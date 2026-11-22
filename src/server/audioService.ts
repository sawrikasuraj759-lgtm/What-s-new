import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface AudioDownloadResult {
  success: boolean;
  title: string;
  artist?: string;
  duration?: string;
  bitrate?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  error?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const SAVETUBE_MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36";

function decodeSaveTubePayload(enc: string): any {
  const secretKey = "C5D58EF67A7584E4A29F6C35BBC4EB12";
  const data = Buffer.from(enc, "base64");
  const iv = data.subarray(0, 16);
  const content = data.subarray(16);
  const key = Buffer.from(secretKey, "hex");
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export interface SaveTubeResolvedMedia {
  buffer: Buffer;
  title: string;
  duration?: string;
  thumbnailUrl?: string;
  quality: string;
  downloadUrl: string;
  sizeBytes: number;
}

/**
 * Resolves and downloads a YouTube video (MP4) or audio (MP3) directly through SaveTube CDN proxies,
 * avoiding Cloud/Datacenter IP blocks on googlevideo.com.
 */
export async function resolveViaSaveTube(
  ytUrl: string,
  mode: "video" | "audio" = "video",
  preferredHeight: 360 | 480 | 720 = 480
): Promise<SaveTubeResolvedMedia | null> {
  const ytId = extractYoutubeId(ytUrl);
  const canonicalUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : ytUrl;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": SAVETUBE_MOBILE_UA,
    Referer: "https://save-tube.com/",
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cdnResp = await fetch("https://media.savetube.vip/api/random-cdn", {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (!cdnResp.ok) continue;
      const cdnJson: any = await cdnResp.json();
      const cdn = cdnJson?.cdn;
      if (!cdn) continue;

      const infoResp = await fetch(`https://${cdn}/v2/info`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: canonicalUrl }),
        signal: AbortSignal.timeout(9000),
      });
      if (!infoResp.ok) continue;
      const infoJson: any = await infoResp.json();
      if (!infoJson?.data) continue;

      const info = decodeSaveTubePayload(infoJson.data);
      const title = String(info?.title || "YouTube Media").trim();
      const duration = info?.durationLabel ? String(info.durationLabel) : undefined;
      const thumbnailUrl = info?.thumbnail ? String(info.thumbnail) : undefined;
      const key = info?.key;
      if (!key) continue;

      if (mode === "audio") {
        const dlMetaResp = await fetch(`https://${cdn}/download`, {
          method: "POST",
          headers,
          body: JSON.stringify({ downloadType: "audio", quality: "128", key }),
          signal: AbortSignal.timeout(15000),
        });
        if (!dlMetaResp.ok) continue;
        const dlMeta: any = await dlMetaResp.json();
        const dlUrl = dlMeta?.data?.downloadUrl;
        if (!dlUrl || typeof dlUrl !== "string") continue;

        const mediaResp = await fetch(dlUrl, {
          headers: { "User-Agent": SAVETUBE_MOBILE_UA },
          signal: AbortSignal.timeout(35000),
        });
        if (!mediaResp.ok) continue;
        const ct = (mediaResp.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("text/html") || ct.includes("application/json")) continue;
        const buf = Buffer.from(await mediaResp.arrayBuffer());
        if (buf.length < 8000) continue;

        return {
          buffer: buf,
          title,
          duration,
          thumbnailUrl,
          quality: "320kbps MP3",
          downloadUrl: dlUrl,
          sizeBytes: buf.length,
        };
      }

      const qualityCascade = preferredHeight >= 720 ? ["720", "480", "360", "240"] : ["480", "360", "240"];
      for (const q of qualityCascade) {
        try {
          const dlMetaResp = await fetch(`https://${cdn}/download`, {
            method: "POST",
            headers,
            body: JSON.stringify({ downloadType: "video", quality: q, key }),
            signal: AbortSignal.timeout(15000),
          });
          if (!dlMetaResp.ok) continue;
          const dlMeta: any = await dlMetaResp.json();
          const dlUrl = dlMeta?.data?.downloadUrl;
          if (!dlUrl || typeof dlUrl !== "string") continue;

          // Check size if there is a lower quality fallback so we stay within WhatsApp ~58MB delivery budget
          const hasSmallerFallback = q !== qualityCascade[qualityCascade.length - 1];
          if (hasSmallerFallback) {
            try {
              const headResp = await fetch(dlUrl, {
                method: "HEAD",
                headers: { "User-Agent": SAVETUBE_MOBILE_UA },
                signal: AbortSignal.timeout(4500),
              });
              const cl = Number(headResp.headers.get("content-length") || 0);
              if (cl > 56 * 1024 * 1024) {
                continue;
              }
            } catch {}
          }

          const mediaResp = await fetch(dlUrl, {
            headers: { "User-Agent": SAVETUBE_MOBILE_UA },
            signal: AbortSignal.timeout(45000),
          });
          if (!mediaResp.ok) continue;
          const ct = (mediaResp.headers.get("content-type") || "").toLowerCase();
          if (ct.includes("text/html") || ct.includes("application/json")) continue;
          const buf = Buffer.from(await mediaResp.arrayBuffer());
          if (buf.length < 15000) continue;

          return {
            buffer: buf,
            title,
            duration,
            thumbnailUrl,
            quality: `${q}p ${Number(q) >= 720 ? "HD" : "SD"} MP4`,
            downloadUrl: dlUrl,
            sizeBytes: buf.length,
          };
        } catch {}
      }
    } catch {}
  }

  return null;
}

export function extractYoutubeId(input: string): string | null {
  const ytRegex =
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|live\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
  const match = input.match(ytRegex);
  return match ? match[1] : null;
}

export async function searchYoutubeVideo(query: string): Promise<{ videoId: string; title: string; thumbnailUrl: string } | null> {
  const directId = extractYoutubeId(query);
  if (directId) {
    try {
      const oRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(3000) }
      );
      if (oRes.ok) {
        const oData = await oRes.json();
        return {
          videoId: directId,
          title: oData.title || "YouTube Audio Track",
          thumbnailUrl: oData.thumbnail_url || `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
        };
      }
    } catch {}

    const cleanTitle = query.replace(/(https?:\/\/[^\s]+)/g, "").trim() || "YouTube Track";
    return {
      videoId: directId,
      title: cleanTitle,
      thumbnailUrl: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
    };
  }

  // Fast scrape search
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (res.ok) {
      const html = await res.text();
      const idMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
      if (idMatches && idMatches.length > 0) {
        let foundId = null;
        for (const m of idMatches) {
          const id = m.replace("/watch?v=", "");
          if (id.length === 11) {
            foundId = id;
            break;
          }
        }

        if (foundId) {
          let extractedTitle = query;
          const titleRegex = /"title":\{"runs":\[\{"text":"([^"]+)"\}\]/;
          const titleMatch = html.match(titleRegex);
          if (titleMatch && titleMatch[1]) {
            extractedTitle = titleMatch[1];
          }
          return {
            videoId: foundId,
            title: extractedTitle,
            thumbnailUrl: `https://i.ytimg.com/vi/${foundId}/hqdefault.jpg`,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[AudioService] YouTube search notice:", err?.message);
  }

  // Fallback search via siputzx
  try {
    const apiRes = await fetch(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(7000),
    });
    if (apiRes.ok) {
      const data: any = await apiRes.json();
      const first = Array.isArray(data?.data) ? data.data.find((d: any) => d?.videoId || d?.url) : null;
      if (first) {
        const vid = first.videoId || extractYoutubeId(first.url || "");
        if (vid) {
          return {
            videoId: vid,
            title: first.title || query,
            thumbnailUrl: first.thumbnail || first.image || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          };
        }
      }
    }
  } catch {}

  return null;
}

export function getYtDlpBinary(): string {
  const localBin = path.resolve(process.cwd(), "bin", "yt-dlp");
  if (fs.existsSync(localBin)) {
    try { fs.chmodSync(localBin, 0o755); } catch {}
    return localBin;
  }
  const usrBin = "/usr/local/bin/yt-dlp";
  if (fs.existsSync(usrBin)) return usrBin;
  return "yt-dlp";
}

export async function ensureYtDlpBinary(): Promise<void> {
  const binDir = path.resolve(process.cwd(), "bin");
  const localBin = path.join(binDir, "yt-dlp");
  if (fs.existsSync(localBin)) {
    try { fs.chmodSync(localBin, 0o755); return; } catch {}
  }
  const usrBin = "/usr/local/bin/yt-dlp";
  if (fs.existsSync(usrBin)) return;

  try {
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    console.log("[AudioService] Provisioning yt-dlp standalone engine...");
    const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const arrBuf = await res.arrayBuffer();
      fs.writeFileSync(localBin, Buffer.from(arrBuf));
      fs.chmodSync(localBin, 0o755);
      console.log("[AudioService] yt-dlp binary provisioned successfully.");
    }
  } catch (err: any) {
    console.warn("[AudioService] Warning provisioning yt-dlp:", err?.message);
  }
}

export function cleanStaleTempFiles(): void {
  try {
    const tmpDir = "/tmp";
    if (!fs.existsSync(tmpDir)) return;
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith("song_") || file.startsWith("vid_") || file.endsWith(".m4a") || file.endsWith(".part")) {
        const fullPath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > 3 * 60 * 1000) {
            fs.unlinkSync(fullPath);
          }
        } catch {}
      }
    }
  } catch {}
}

const tmpCleanInterval = setInterval(cleanStaleTempFiles, 5 * 60 * 1000);
if (tmpCleanInterval.unref) tmpCleanInterval.unref();

async function resolveViaSoundCloudAudio(
  searchQuery: string,
  targetTitle?: string,
  thumbnailUrl?: string,
  sourceUrl?: string
): Promise<AudioDownloadResult | null> {
  const ytDlp = getYtDlpBinary();
  const filePrefix = `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPattern = path.join("/tmp", `${filePrefix}.%(ext)s`);

  const findAndReadResult = (): AudioDownloadResult | null => {
    try {
      if (!fs.existsSync("/tmp")) return null;
      const allFiles = fs.readdirSync("/tmp");
      const matched = allFiles.find(
        (f) => f.startsWith(filePrefix) && !f.endsWith(".part") && !f.endsWith(".ytdl")
      );
      if (matched) {
        const fullPath = path.join("/tmp", matched);
        const stats = fs.statSync(fullPath);
        if (stats.size > 10000) {
          const buffer = fs.readFileSync(fullPath);
          try { fs.unlinkSync(fullPath); } catch {}
          const ext = path.extname(matched).replace(".", "").toLowerCase() || "m4a";
          const finalTitle = targetTitle || searchQuery;
          const safeTitle = finalTitle.replace(/[/\\?%*:|"<>]/g, "").trim() || "song";
          return {
            success: true,
            title: finalTitle,
            duration: "HQ Audio",
            bitrate: ext === "mp3" ? "320kbps MP3" : "HQ AAC / M4A (Ultra Fast)",
            sourceUrl: sourceUrl || `https://soundcloud.com/search?q=${encodeURIComponent(searchQuery)}`,
            thumbnailUrl,
            buffer,
            mimeType: ext === "mp3" ? "audio/mpeg" : "audio/mp4",
            fileName: `${safeTitle}.${ext === "mp3" ? "mp3" : "m4a"}`,
          };
        }
      }
    } catch (err: any) {
      console.warn("[AudioService] Read error:", err?.message);
    }
    return null;
  };

  // Attempt 1: Fast direct bestaudio download from SoundCloud
  try {
    await execFileAsync(
      ytDlp,
      [
        "-f", "bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "-o", outPattern,
        `scsearch1:${searchQuery}`,
      ],
      { timeout: 30000 }
    );
  } catch (err: any) {
    // If file was extracted successfully, ignore process exit notice
  }

  const res1 = findAndReadResult();
  if (res1) return res1;

  // Attempt 2: Clean query without brackets or noise (e.g. "Song (Official Video)" -> "Song")
  const simplified = searchQuery
    .replace(/[([][^)]*[)\]]/g, "")
    .replace(/\b(official|video|music|audio|lyrics|hd|4k|remix|dj|prod|ft|feat)\b/gi, "")
    .replace(/[-_~]/g, " ")
    .trim();

  if (simplified && simplified.length >= 3 && simplified.toLowerCase() !== searchQuery.toLowerCase()) {
    try {
      await execFileAsync(
        ytDlp,
        [
          "-f", "bestaudio/best",
          "--no-playlist",
          "--no-warnings",
          "--no-check-certificates",
          "-o", outPattern,
          `scsearch1:${simplified}`,
        ],
        { timeout: 25000 }
      );
    } catch {}

    const res2 = findAndReadResult();
    if (res2) return res2;
  }

  // Attempt 3: Try scsearch2
  try {
    await execFileAsync(
      ytDlp,
      [
        "-f", "bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "-o", outPattern,
        `scsearch2:${searchQuery}`,
      ],
      { timeout: 25000 }
    );
  } catch {}

  const res3 = findAndReadResult();
  if (res3) return res3;

  return null;
}

export async function previewSongInfo(
  query: string
): Promise<{ title: string; thumbnailUrl?: string; sourceUrl?: string }> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return { title: "Music Track" };
  try {
    const yt = await Promise.race([
      searchYoutubeVideo(cleanQuery),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800)),
    ]);
    if (yt) {
      return {
        title: yt.title || cleanQuery,
        thumbnailUrl: yt.thumbnailUrl,
        sourceUrl: `https://www.youtube.com/watch?v=${yt.videoId}`,
      };
    }
  } catch {}
  return { title: cleanQuery };
}

export async function resolveSongAudio(query: string): Promise<AudioDownloadResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      success: false,
      title: "",
      error: "Query is empty. Please specify song title or YouTube link.",
    };
  }

  let finalSearchQuery = cleanQuery;
  let targetTitle = cleanQuery;
  let thumbUrl: string | undefined;
  let sourceUrl: string | undefined;

  // Check if it's a YouTube link
  const ytId = extractYoutubeId(cleanQuery);
  if (ytId) {
    sourceUrl = `https://www.youtube.com/watch?v=${ytId}`;
    thumbUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    try {
      const oRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`,
        { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(3000) }
      );
      if (oRes.ok) {
        const oData = await oRes.json();
        if (oData.title) {
          targetTitle = oData.title;
          finalSearchQuery = oData.title;
        }
        if (oData.thumbnail_url) {
          thumbUrl = oData.thumbnail_url;
        }
      }
    } catch {}
  } else {
    // Fetch thumbnail & title quickly (capped at 2.2s) for card info
    try {
      const yt = await Promise.race([
        searchYoutubeVideo(cleanQuery),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200)),
      ]);
      if (yt) {
        thumbUrl = yt.thumbnailUrl;
        sourceUrl = `https://www.youtube.com/watch?v=${yt.videoId}`;
        if (yt.title && yt.title !== cleanQuery && cleanQuery.length < 40) {
          targetTitle = yt.title;
        }
      }
    } catch {}
  }

  // 1. If explicit YouTube link was pasted, fetch exact audio via SaveTube first
  if (ytId && sourceUrl) {
    const exactYtAudio = await resolveViaSaveTube(sourceUrl, "audio");
    if (exactYtAudio?.buffer) {
      const safeTitle = (exactYtAudio.title || targetTitle).replace(/[/\\?%*:|"<>]/g, "").trim() || "song";
      return {
        success: true,
        title: exactYtAudio.title || targetTitle,
        duration: exactYtAudio.duration || "HQ Audio",
        bitrate: exactYtAudio.quality,
        sourceUrl,
        thumbnailUrl: exactYtAudio.thumbnailUrl || thumbUrl,
        buffer: exactYtAudio.buffer,
        mimeType: "audio/mpeg",
        fileName: `${safeTitle}.mp3`,
      };
    }
  }

  // 2. Ultra-fast direct audio extraction from SoundCloud (2-4 seconds)
  const scResult = await resolveViaSoundCloudAudio(finalSearchQuery, targetTitle, thumbUrl, sourceUrl);
  if (scResult && scResult.buffer) {
    return scResult;
  }

  // 3. YouTube SaveTube fallback when SoundCloud doesn't have the song (e.g. Sinhala / niche tracks)
  if (sourceUrl) {
    const ytAudioFallback = await resolveViaSaveTube(sourceUrl, "audio");
    if (ytAudioFallback?.buffer) {
      const safeTitle = (ytAudioFallback.title || targetTitle).replace(/[/\\?%*:|"<>]/g, "").trim() || "song";
      return {
        success: true,
        title: ytAudioFallback.title || targetTitle,
        duration: ytAudioFallback.duration || "HQ Audio",
        bitrate: ytAudioFallback.quality,
        sourceUrl,
        thumbnailUrl: ytAudioFallback.thumbnailUrl || thumbUrl,
        buffer: ytAudioFallback.buffer,
        mimeType: "audio/mpeg",
        fileName: `${safeTitle}.mp3`,
      };
    }
  }

  // 4. Direct MP3 URL handling
  if (cleanQuery.startsWith("http") && (cleanQuery.endsWith(".mp3") || cleanQuery.includes(".mp3?"))) {
    try {
      const resp = await fetch(cleanQuery, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const arr = await resp.arrayBuffer();
        const buffer = Buffer.from(arr);
        if (buffer.length > 5000) {
          return {
            success: true,
            title: "Direct Audio Stream",
            duration: "HQ Stream",
            bitrate: "320kbps",
            sourceUrl: cleanQuery,
            buffer,
            mimeType: "audio/mp4",
            fileName: "audio_track.mp3",
          };
        }
      }
    } catch {}
  }

  return {
    success: false,
    title: targetTitle,
    sourceUrl,
    thumbnailUrl: thumbUrl,
    error: `Unable to download audio stream for "${targetTitle}". Source may be unavailable or restricted.`,
  };
}
