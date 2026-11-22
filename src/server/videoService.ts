import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractYoutubeId, searchYoutubeVideo, getYtDlpBinary, resolveViaSaveTube } from "./audioService";

const execFileAsync = promisify(execFile);

export interface VideoDownloadResult {
  success: boolean;
  videoUrl?: string;
  buffer?: Buffer;
  localPath?: string;
  title: string;
  sizeBytes?: number;
  fileSizeStr?: string;
  duration?: string;
  quality?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  author?: string;
  views?: string;
  isDirectDownloadable?: boolean;
  error?: string;
}

export interface MediaPreviewInfo {
  title: string;
  platform: string;
  duration?: string;
  author?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  sdSize?: string;
  hdSize?: string;
  cachedPlayUrl?: string;
  cachedHdPlayUrl?: string;
  ts?: number;
}

const mediaPreviewCache = new Map<string, MediaPreviewInfo>();

export function extractMediaQualityFlag(input: string): {
  cleanQuery: string;
  quality: "480p" | "720p" | "mp3" | null;
} {
  const raw = (input || "").trim();
  const match = raw.match(/^(.*?)\s+(360p|480p|720p|1080p|sd|hd|mp3|audio)$/i);
  if (!match) {
    return { cleanQuery: raw, quality: null };
  }
  const flag = match[2].toLowerCase();
  const cleanQuery = match[1].trim();
  if (!cleanQuery) return { cleanQuery: raw, quality: null };
  if (flag === "mp3" || flag === "audio") return { cleanQuery, quality: "mp3" };
  if (flag === "720p" || flag === "1080p" || flag === "hd") return { cleanQuery, quality: "720p" };
  return { cleanQuery, quality: "480p" };
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null);
}

function formatDurationSeconds(sec: number | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "HD Video";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

async function fetchVideoBuffer(
  url: string,
  timeoutMs = 20000
): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 15_000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function downloadWithYtDlpMp4(
  targetUrl: string,
  prefixTag: string,
  maxTimeoutMs = 28000,
  preferMaxHeight = 480
): Promise<{
  buffer: Buffer;
  title?: string;
  duration?: string;
  author?: string;
  thumbnailUrl?: string;
} | null> {
  const ytDlp = getYtDlpBinary();
  const filePrefix = `vid_${prefixTag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outPattern = path.join("/tmp", `${filePrefix}.%(ext)s`);

  const formatSelector =
    preferMaxHeight <= 480
      ? "b[height<=480][ext=mp4]/b[height<=720][ext=mp4]/b[height<=480]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[ext=mp4]/b"
      : "b[height<=720][ext=mp4]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b[ext=mp4]/b";

  try {
    await execFileAsync(
      ytDlp,
      [
        "-f",
        formatSelector,
        "--merge-output-format",
        "mp4",
        "--concurrent-fragments",
        "8",
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--write-info-json",
        "--max-filesize",
        "58M",
        "-o",
        outPattern,
        targetUrl,
      ],
      { timeout: maxTimeoutMs }
    );
  } catch {
    // Still check /tmp in case yt-dlp wrote a valid video file before exiting
  }

  let result: {
    buffer: Buffer;
    title?: string;
    duration?: string;
    author?: string;
    thumbnailUrl?: string;
  } | null = null;

  try {
    if (fs.existsSync("/tmp")) {
      const allFiles = fs.readdirSync("/tmp").filter((f) => f.startsWith(filePrefix));
      const infoFile = allFiles.find((f) => f.endsWith(".info.json"));
      let meta: any = null;
      if (infoFile) {
        try {
          meta = JSON.parse(fs.readFileSync(path.join("/tmp", infoFile), "utf8"));
        } catch {}
      }

      const mediaFile = allFiles.find(
        (f) =>
          !f.endsWith(".part") &&
          !f.endsWith(".ytdl") &&
          !f.endsWith(".info.json") &&
          !f.endsWith(".jpg") &&
          !f.endsWith(".webp") &&
          !f.endsWith(".png")
      );

      if (mediaFile) {
        const fullPath = path.join("/tmp", mediaFile);
        const stats = fs.statSync(fullPath);
        if (stats.size > 20_000) {
          const buffer = fs.readFileSync(fullPath);
          result = {
            buffer,
            title: meta?.title || meta?.fulltitle || undefined,
            duration: meta?.duration ? formatDurationSeconds(meta.duration) : undefined,
            author: meta?.uploader || meta?.channel || undefined,
            thumbnailUrl: meta?.thumbnail || undefined,
          };
        }
      }

      // Clean up all temp files for this prefix
      for (const f of allFiles) {
        try {
          fs.unlinkSync(path.join("/tmp", f));
        } catch {}
      }
    }
  } catch {}

  return result;
}

async function resolveDailymotionVideo(
  searchQuery: string
): Promise<{
  id: string;
  url: string;
  title: string;
  durationSec: number;
  author?: string;
  thumbnailUrl?: string;
} | null> {
  try {
    const res = await fetch(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(
        searchQuery
      )}&fields=id,title,duration,thumbnail_480_url,owner.screenname&limit=8`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const list: any[] = Array.isArray(json?.list) ? json.list : [];
    if (list.length === 0) return null;

    // Prefer reasonably sized clips (10s to 12m) so MP4 fits quickly within WhatsApp limits
    const suitable =
      list.find((v) => v.duration >= 15 && v.duration <= 600) ||
      list.find((v) => v.duration >= 5 && v.duration <= 900) ||
      list[0];

    if (!suitable?.id) return null;
    return {
      id: suitable.id,
      url: `https://www.dailymotion.com/video/${suitable.id}`,
      title: suitable.title || searchQuery,
      durationSec: Number(suitable.duration) || 0,
      author: suitable["owner.screenname"] || "Dailymotion",
      thumbnailUrl: suitable.thumbnail_480_url || undefined,
    };
  } catch {
    return null;
  }
}

export async function previewMediaForCard(
  queryOrUrl: string,
  platformHint = "YouTube"
): Promise<MediaPreviewInfo> {
  const clean = (queryOrUrl || "").trim();
  const cached = mediaPreviewCache.get(clean);
  if (cached && cached.ts && Date.now() - cached.ts < 10 * 60 * 1000) {
    return cached;
  }

  const storeCache = (info: MediaPreviewInfo) => {
    info.ts = Date.now();
    mediaPreviewCache.set(clean, info);
    if (mediaPreviewCache.size > 150) {
      const oldest = mediaPreviewCache.keys().next().value;
      if (oldest) mediaPreviewCache.delete(oldest);
    }
    return info;
  };

  if (/tiktok\.com/i.test(clean)) {
    try {
      const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(clean)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(4500),
      });
      if (apiRes.ok) {
        const json: any = await apiRes.json();
        if (json?.code === 0 && json?.data) {
          const d = json.data;
          const sdMb = d.size ? `${(Number(d.size) / (1024 * 1024)).toFixed(1)} MB` : "Fast MP4";
          const hdMb = d.hd_size ? `${(Number(d.hd_size) / (1024 * 1024)).toFixed(1)} MB` : "Best HD";
          return storeCache({
            title: (d.title || "TikTok Video").slice(0, 110),
            platform: "TikTok",
            duration: d.duration ? `${d.duration}s` : "HD Reel",
            author: d.author?.nickname || d.author?.unique_id || "TikTok Creator",
            thumbnailUrl: d.cover || d.origin_cover || undefined,
            sourceUrl: clean,
            sdSize: sdMb,
            hdSize: hdMb,
            cachedPlayUrl: d.play,
            cachedHdPlayUrl: d.hdplay || d.play,
          });
        }
      }
    } catch {}
    return storeCache({
      title: "TikTok Video Reel",
      platform: "TikTok",
      duration: "HD Reel",
      author: "TikTok",
      sourceUrl: clean,
      sdSize: "Fast MP4",
      hdSize: "HD No Watermark",
    });
  }

  // Social URL quick metadata probe via yt-dlp --dump-json (capped at 6.5s)
  if (/^https?:\/\//i.test(clean) && !extractYoutubeId(clean) && !/youtube\.com|youtu\.be/i.test(clean)) {
    const plat = /facebook\.com|fb\.watch|fb\.com/i.test(clean)
      ? "Facebook"
      : /instagram\.com|instagr\.am/i.test(clean)
        ? "Instagram"
        : /twitter\.com|x\.com/i.test(clean)
          ? "Twitter"
          : platformHint;

    try {
      const ytDlp = getYtDlpBinary();
      const { stdout } = await execFileAsync(
        ytDlp,
        ["--dump-json", "--no-playlist", "--no-warnings", "--no-check-certificates", clean],
        { timeout: 6500 }
      );
      const line = (stdout || "").trim().split("\n")[0];
      if (line) {
        const meta: any = JSON.parse(line);
        return storeCache({
          title: meta.title || meta.fulltitle || `${plat} Video`,
          platform: plat,
          duration: meta.duration ? formatDurationSeconds(meta.duration) : "HD Video",
          author: meta.uploader || meta.channel || plat,
          thumbnailUrl: meta.thumbnail || undefined,
          sourceUrl: clean,
          sdSize: "Fast 480p",
          hdSize: "Best 720p",
        });
      }
    } catch {}

    return storeCache({
      title: `${plat} Video Download`,
      platform: plat,
      duration: "HD Stream",
      author: plat,
      sourceUrl: clean,
      sdSize: "Fast 480p",
      hdSize: "Best 720p",
    });
  }

  // YouTube URL or general search query
  const ytId = extractYoutubeId(clean);
  if (ytId) {
    const ytMeta = await withTimeout(searchYoutubeVideo(clean), 3500);
    return storeCache({
      title: ytMeta?.title || "YouTube Video",
      platform: "YouTube",
      duration: "HD Video",
      author: "YouTube",
      thumbnailUrl: ytMeta?.thumbnailUrl || `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
      sdSize: "Fast 480p",
      hdSize: "Best 720p",
    });
  }

  try {
    // @ts-ignore
    const { ytsearch } = await import("ruhend-scraper");
    const searchRes: any = await withTimeout(ytsearch(clean), 4500);
    if (searchRes?.video?.length > 0) {
      const top = searchRes.video[0];
      const vId = top.videoId || "";
      return storeCache({
        title: top.title || clean,
        platform: platformHint || "YouTube",
        duration: top.duration || top.durationH || "HD Video",
        author: top.authorName || "YouTube",
        thumbnailUrl: top.thumbnail || (vId ? `https://i.ytimg.com/vi/${vId}/hqdefault.jpg` : undefined),
        sourceUrl: vId ? `https://www.youtube.com/watch?v=${vId}` : clean,
        sdSize: "Fast 480p",
        hdSize: "Best 720p",
      });
    }
  } catch {}

  const ytFallback = await withTimeout(searchYoutubeVideo(clean), 4000);
  return storeCache({
    title: ytFallback?.title || clean,
    platform: platformHint || "YouTube",
    duration: "HD Video",
    author: "YouTube",
    thumbnailUrl: ytFallback?.thumbnailUrl,
    sourceUrl: ytFallback?.videoId ? `https://www.youtube.com/watch?v=${ytFallback.videoId}` : clean,
    sdSize: "Fast 480p",
    hdSize: "Best 720p",
  });
}

export async function resolveVideo(
  query: string,
  preferredQuality: "480p" | "720p" | "mp3" = "480p"
): Promise<VideoDownloadResult> {
  const clean = (query || "").trim();
  const maxHeight = preferredQuality === "720p" ? 720 : 480;
  if (!clean) {
    return { success: false, title: "", error: "No video query or link provided." };
  }

  // Audio-only extraction shortcut when user selects MP3 quality
  if (preferredQuality === "mp3") {
    const directYtId = extractYoutubeId(clean);
    let mp3YtUrl = directYtId ? `https://www.youtube.com/watch?v=${directYtId}` : "";
    if (!mp3YtUrl && !/^https?:\/\//i.test(clean)) {
      const ytMeta = await searchYoutubeVideo(clean);
      if (ytMeta?.videoId) mp3YtUrl = `https://www.youtube.com/watch?v=${ytMeta.videoId}`;
    }
    if (mp3YtUrl) {
      const stAudio = await resolveViaSaveTube(mp3YtUrl, "audio");
      if (stAudio?.buffer) {
        return {
          success: true,
          videoUrl: mp3YtUrl,
          buffer: stAudio.buffer,
          title: stAudio.title || clean,
          duration: stAudio.duration,
          thumbnailUrl: stAudio.thumbnailUrl,
          quality: stAudio.quality,
          sourceUrl: mp3YtUrl,
          sizeBytes: stAudio.sizeBytes,
          fileSizeStr: `${(stAudio.sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
          isDirectDownloadable: true,
        };
      }
    }

    const ytDlp = getYtDlpBinary();
    const uid = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outPattern = path.join("/tmp", `${uid}.%(ext)s`);
    try {
      await execFileAsync(
        ytDlp,
        ["-f", "bestaudio/best", "--no-playlist", "--no-warnings", "--no-check-certificates", "-o", outPattern, clean],
        { timeout: 22000 }
      );
    } catch {}
    try {
      const files = fs.readdirSync("/tmp").filter((f) => f.startsWith(uid) && !f.endsWith(".part") && !f.endsWith(".ytdl"));
      if (files[0]) {
        const fp = path.join("/tmp", files[0]);
        const buf = fs.readFileSync(fp);
        try { fs.unlinkSync(fp); } catch {}
        if (buf.length > 5000) {
          return {
            success: true,
            videoUrl: clean,
            buffer: buf,
            title: clean,
            quality: "MP3 / HQ Audio",
            sourceUrl: clean,
            sizeBytes: buf.length,
            fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
            isDirectDownloadable: true,
          };
        }
      }
    } catch {}
  }

  // 1. Direct MP4 or video stream URL
  if (/^https?:\/\/.+\.(mp4|mkv|mov|webm|avi)(\?.*)?$/i.test(clean)) {
    try {
      const headResp = await fetch(clean, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      const cl = headResp.headers.get("content-length");
      const sizeBytes = cl ? parseInt(cl, 10) : 0;
      const sizeMB = sizeBytes > 0 ? (sizeBytes / (1024 * 1024)).toFixed(1) + " MB" : "Direct Video Stream";
      const fileName = clean.split("/").pop()?.split("?")[0] || "video.mp4";

      if (sizeBytes === 0 || sizeBytes <= 55 * 1024 * 1024) {
        const buf = await fetchVideoBuffer(clean, 22000);
        if (buf) {
          return {
            success: true,
            videoUrl: clean,
            buffer: buf,
            title: fileName,
            sizeBytes: buf.length,
            fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
            quality: "HD Direct MP4",
            sourceUrl: clean,
            isDirectDownloadable: true,
          };
        }
      }

      return {
        success: true,
        videoUrl: clean,
        title: fileName,
        sizeBytes,
        fileSizeStr: sizeMB,
        quality: "HD Direct",
        sourceUrl: clean,
        isDirectDownloadable: true,
      };
    } catch {
      return {
        success: true,
        videoUrl: clean,
        title: "Direct Video",
        fileSizeStr: "Online Stream",
        quality: "HD Direct",
        sourceUrl: clean,
        isDirectDownloadable: true,
      };
    }
  }

  // 2. TikTok URL (use cached TikWM direct play if available, else yt-dlp + TikWM)
  if (/tiktok\.com/i.test(clean)) {
    const cachedTt = mediaPreviewCache.get(clean);
    const cachedDirectUrl = preferredQuality === "720p" ? cachedTt?.cachedHdPlayUrl : cachedTt?.cachedPlayUrl;
    if (cachedDirectUrl) {
      const cBuf = await fetchVideoBuffer(cachedDirectUrl, 16000);
      if (cBuf) {
        return {
          success: true,
          videoUrl: cachedDirectUrl,
          buffer: cBuf,
          title: cachedTt?.title || "TikTok Video",
          duration: cachedTt?.duration || "HD Reel",
          author: cachedTt?.author,
          thumbnailUrl: cachedTt?.thumbnailUrl,
          quality: preferredQuality === "720p" ? "720p / 1080p HD (No Watermark)" : "480p Fast (No Watermark)",
          sourceUrl: clean,
          sizeBytes: cBuf.length,
          fileSizeStr: `${(cBuf.length / (1024 * 1024)).toFixed(1)} MB`,
          isDirectDownloadable: true,
        };
      }
    }

    const ytRes = await downloadWithYtDlpMp4(clean, "tt", 22000, maxHeight);
    if (ytRes?.buffer) {
      return {
        success: true,
        videoUrl: clean,
        buffer: ytRes.buffer,
        title: ytRes.title || "TikTok Video",
        duration: ytRes.duration || "HD Reel",
        author: ytRes.author,
        thumbnailUrl: ytRes.thumbnailUrl,
        quality: maxHeight >= 720 ? "720p / 1080p HD (No Watermark)" : "480p Fast (No Watermark)",
        sourceUrl: clean,
        sizeBytes: ytRes.buffer.length,
        fileSizeStr: `${(ytRes.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        isDirectDownloadable: true,
      };
    }

    // Strategy B: ruhend ttdl (capped at 8s)
    try {
      // @ts-ignore
      const { ttdl } = await import("ruhend-scraper");
      const res: any = await withTimeout(ttdl(clean), 8000);
      const vidUrl = res?.video_hd || res?.video;
      if (vidUrl && typeof vidUrl === "string" && vidUrl.startsWith("http")) {
        const buf = await fetchVideoBuffer(vidUrl, 15000);
        if (buf) {
          return {
            success: true,
            videoUrl: vidUrl,
            buffer: buf,
            title: res.title || "TikTok Video",
            quality: "HD No Watermark",
            sourceUrl: clean,
            sizeBytes: buf.length,
            fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
            isDirectDownloadable: true,
          };
        }
      }
    } catch {}

    // Strategy C: TikWM fallback (short 4s timeout)
    try {
      const apiRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(clean)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(4500),
      });
      if (apiRes.ok) {
        const json: any = await apiRes.json();
        if (json?.code === 0 && json?.data?.play) {
          const directPlay = json.data.play;
          const buf = await fetchVideoBuffer(directPlay, 15000);
          if (buf) {
            return {
              success: true,
              videoUrl: directPlay,
              buffer: buf,
              title: json.data.title || "TikTok Video",
              duration: `${json.data.duration || 0}s`,
              quality: "1080p HD (No Watermark)",
              sourceUrl: clean,
              sizeBytes: buf.length,
              fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
              isDirectDownloadable: true,
            };
          }
        }
      }
    } catch {}

    return {
      success: false,
      title: "TikTok Video",
      sourceUrl: clean,
      error: "TikTok වීඩියෝව ලබාගත නොහැකි විය. ලින්ක් එක Public දැයි පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
    };
  }

  // 3. Facebook URL
  if (/facebook\.com|fb\.watch|fb\.com/i.test(clean)) {
    const ytRes = await downloadWithYtDlpMp4(clean, "fb", 25000, maxHeight);
    if (ytRes?.buffer) {
      return {
        success: true,
        videoUrl: clean,
        buffer: ytRes.buffer,
        title: ytRes.title || "Facebook Video",
        duration: ytRes.duration,
        author: ytRes.author,
        quality: maxHeight >= 720 ? "720p HD MP4" : "480p SD MP4",
        sourceUrl: clean,
        sizeBytes: ytRes.buffer.length,
        fileSizeStr: `${(ytRes.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        isDirectDownloadable: true,
      };
    }

    try {
      // @ts-ignore
      const { fbdl2, fbdl } = await import("ruhend-scraper");
      const fbRes2: any = await withTimeout(fbdl2(clean), 8000);
      let vidUrl: string | null = null;
      if (fbRes2?.data?.length > 0 && fbRes2.data[0].url) {
        vidUrl = fbRes2.data[0].url;
      }
      if (!vidUrl) {
        const fbRes1: any = await withTimeout(fbdl(clean), 8000);
        vidUrl = Array.isArray(fbRes1) ? fbRes1[0] : fbRes1;
      }

      if (vidUrl && typeof vidUrl === "string" && vidUrl.startsWith("http")) {
        const buf = await fetchVideoBuffer(vidUrl, 18000);
        if (buf) {
          return {
            success: true,
            videoUrl: vidUrl,
            buffer: buf,
            title: "Facebook Video",
            quality: "720p HD",
            sourceUrl: clean,
            sizeBytes: buf.length,
            fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
            isDirectDownloadable: true,
          };
        }
        return {
          success: true,
          videoUrl: vidUrl,
          title: "Facebook Video",
          quality: "720p HD",
          sourceUrl: clean,
          isDirectDownloadable: true,
        };
      }
    } catch {}

    return {
      success: false,
      title: "Facebook Video",
      sourceUrl: clean,
      error: "Facebook වීඩියෝව ලබාගත නොහැකි විය. කරුණාකර Public ලින්ක් එකක් ලබා දෙන්න.",
    };
  }

  // 4. Twitter / X URL
  if (/twitter\.com|x\.com/i.test(clean)) {
    const ytRes = await downloadWithYtDlpMp4(clean, "tw", 22000, maxHeight);
    if (ytRes?.buffer) {
      return {
        success: true,
        videoUrl: clean,
        buffer: ytRes.buffer,
        title: ytRes.title || "Twitter / X Video",
        duration: ytRes.duration,
        author: ytRes.author,
        quality: maxHeight >= 720 ? "720p HD MP4" : "480p SD MP4",
        sourceUrl: clean,
        sizeBytes: ytRes.buffer.length,
        fileSizeStr: `${(ytRes.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        isDirectDownloadable: true,
      };
    }

    try {
      const form = new URLSearchParams({ q: clean, lang: "en", cftoken: "" });
      const res = await fetch("https://savetwitter.net/api/ajaxSearch", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          origin: "https://savetwitter.net",
          referer: "https://savetwitter.net/en4",
          "user-agent": USER_AGENT,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(7000),
      });

      if (res.ok) {
        const json: any = await res.json();
        if (json.status === "ok" && json.data) {
          const match = json.data.match(/href="([^"]*(?:dl\.snapcdn\.app|twimg\.com)[^"]*)"/i);
          if (match && match[1]) {
            const vidUrl = match[1];
            const buf = await fetchVideoBuffer(vidUrl, 15000);
            if (buf) {
              return {
                success: true,
                videoUrl: vidUrl,
                buffer: buf,
                title: "Twitter / X Video",
                quality: "720p HD",
                sourceUrl: clean,
                sizeBytes: buf.length,
                fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
                isDirectDownloadable: true,
              };
            }
          }
        }
      }
    } catch {}

    return {
      success: false,
      title: "Twitter / X Video",
      sourceUrl: clean,
      error: "Twitter / X වීඩියෝව ලබාගත නොහැකි විය. ලින්ක් එක පරීක්ෂා කරන්න.",
    };
  }

  // 5. Instagram URL
  if (/instagram\.com|instagr\.am/i.test(clean)) {
    const ytRes = await downloadWithYtDlpMp4(clean, "ig", 22000, maxHeight);
    if (ytRes?.buffer) {
      return {
        success: true,
        videoUrl: clean,
        buffer: ytRes.buffer,
        title: ytRes.title || "Instagram Reel",
        duration: ytRes.duration,
        author: ytRes.author,
        quality: maxHeight >= 720 ? "720p HD Reel" : "480p Fast Reel",
        sourceUrl: clean,
        sizeBytes: ytRes.buffer.length,
        fileSizeStr: `${(ytRes.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        isDirectDownloadable: true,
      };
    }

    try {
      // @ts-ignore
      const { igdl2, igdl } = await import("ruhend-scraper");
      const igRes: any = await withTimeout(igdl2(clean), 8000);
      let vidUrl: string | null = null;
      if (igRes?.data?.length > 0 && igRes.data[0].url) {
        vidUrl = igRes.data[0].url;
      }
      if (!vidUrl) {
        const igRes1: any = await withTimeout(igdl(clean), 8000);
        vidUrl = Array.isArray(igRes1) ? igRes1[0] : (igRes1?.video || igRes1?.url);
      }

      if (vidUrl && typeof vidUrl === "string" && vidUrl.startsWith("http")) {
        const buf = await fetchVideoBuffer(vidUrl, 16000);
        if (buf) {
          return {
            success: true,
            videoUrl: vidUrl,
            buffer: buf,
            title: "Instagram Reel",
            quality: "HD Reel",
            sourceUrl: clean,
            sizeBytes: buf.length,
            fileSizeStr: `${(buf.length / (1024 * 1024)).toFixed(1)} MB`,
            isDirectDownloadable: true,
          };
        }
        return {
          success: true,
          videoUrl: vidUrl,
          title: "Instagram Reel",
          quality: "HD Reel",
          sourceUrl: clean,
          isDirectDownloadable: true,
        };
      }
    } catch {}

    return {
      success: false,
      title: "Instagram Reel",
      sourceUrl: clean,
      error: "Instagram වීඩියෝව ලබාගත නොහැකි විය. Private ගිණුමක වීඩියෝවක් විය හැක.",
    };
  }

  // 6. Any other non-YouTube URL supported by yt-dlp (Dailymotion, Vimeo, Reddit, Pinterest, Twitch, etc.)
  if (/^https?:\/\//i.test(clean) && !extractYoutubeId(clean) && !/youtube\.com|youtu\.be/i.test(clean)) {
    const genericYt = await downloadWithYtDlpMp4(clean, "gen", 28000, maxHeight);
    if (genericYt?.buffer) {
      return {
        success: true,
        videoUrl: clean,
        buffer: genericYt.buffer,
        title: genericYt.title || "Video Download",
        duration: genericYt.duration || "HD Video",
        author: genericYt.author,
        thumbnailUrl: genericYt.thumbnailUrl,
        quality: `${maxHeight}p HD MP4`,
        sourceUrl: clean,
        sizeBytes: genericYt.buffer.length,
        fileSizeStr: `${(genericYt.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        isDirectDownloadable: true,
      };
    }
  }

  // 7. YouTube URL or General Video Search Query -> Real MP4 Delivery
  try {
    let title = clean;
    let videoId = extractYoutubeId(clean) || "";
    let duration = "HQ Video";
    let author = "YASHI HALLS Media";
    let views = "";
    let thumbnailUrl = "";

    // Resolve YouTube metadata quickly (for accurate video title + watch fallback)
    if (videoId) {
      const ytMeta = await searchYoutubeVideo(clean);
      if (ytMeta) {
        title = ytMeta.title || title;
        thumbnailUrl = ytMeta.thumbnailUrl;
      }
    } else {
      try {
        // @ts-ignore
        const { ytsearch } = await import("ruhend-scraper");
        const searchRes: any = await withTimeout(ytsearch(clean), 5000);
        if (searchRes?.video?.length > 0) {
          const top = searchRes.video[0];
          title = top.title || title;
          videoId = top.videoId || videoId;
          duration = top.duration || top.durationH || duration;
          author = top.authorName || author;
          views = top.viewH || top.view || "";
          thumbnailUrl = top.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
        }
      } catch {}

      if (!videoId) {
        const ytVideo = await searchYoutubeVideo(clean);
        if (ytVideo?.videoId) {
          videoId = ytVideo.videoId;
          title = ytVideo.title || title;
          thumbnailUrl = ytVideo.thumbnailUrl;
        }
      }
    }

    const ytSourceUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
    if (!thumbnailUrl && videoId) {
      thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    // Attempt A1: Real proxied YouTube MP4 via SaveTube (bypasses Cloud/Datacenter IP blocks, exact YouTube video!)
    if (ytSourceUrl) {
      const stHeight = maxHeight >= 720 ? 720 : 480;
      const stRes = await resolveViaSaveTube(ytSourceUrl, "video", stHeight);
      if (stRes?.buffer) {
        return {
          success: true,
          videoUrl: stRes.downloadUrl || ytSourceUrl,
          buffer: stRes.buffer,
          title: stRes.title || title,
          duration: stRes.duration || duration,
          author,
          views,
          thumbnailUrl: stRes.thumbnailUrl || thumbnailUrl,
          quality: stRes.quality,
          sourceUrl: ytSourceUrl,
          sizeBytes: stRes.sizeBytes,
          fileSizeStr: `${(stRes.sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
          isDirectDownloadable: true,
        };
      }
    }

    // Attempt A2: Direct yt-dlp on YouTube URL (fast fallback if host IP is unblocked)
    if (ytSourceUrl) {
      const ytDl = await downloadWithYtDlpMp4(ytSourceUrl, "yt", 10000, maxHeight);
      if (ytDl?.buffer) {
        return {
          success: true,
          videoUrl: ytSourceUrl,
          buffer: ytDl.buffer,
          title: ytDl.title || title,
          duration: ytDl.duration || duration,
          author: ytDl.author || author,
          views,
          thumbnailUrl: ytDl.thumbnailUrl || thumbnailUrl,
          quality: maxHeight >= 720 ? "720p HD MP4" : "480p SD MP4",
          sourceUrl: ytSourceUrl,
          sizeBytes: ytDl.buffer.length,
          fileSizeStr: `${(ytDl.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
          isDirectDownloadable: true,
        };
      }
    }

    // Attempt B: Cleaned Dailymotion mirror fallback if SaveTube was rate-limited or video restricted
    const cleanDmQuery = (q: string) =>
      q
        .replace(/[\[\(][^\]\)]*[\]\)]/g, " ")
        .replace(/\|.*$/, " ")
        .replace(/\b(official|music|video|lyrics|lyric|audio|hd|4k|remastered|full)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const searchTitleForDm =
      videoId && title && !/^https?:\/\//i.test(title)
        ? cleanDmQuery(title)
        : cleanDmQuery(clean);

    let dmMatch = searchTitleForDm ? await resolveDailymotionVideo(searchTitleForDm) : null;
    if (!dmMatch && !/^https?:\/\//i.test(clean) && cleanDmQuery(clean) !== searchTitleForDm) {
      dmMatch = await resolveDailymotionVideo(cleanDmQuery(clean));
    }

    if (dmMatch) {
      const dmDl = await downloadWithYtDlpMp4(dmMatch.url, "dm", 35000, maxHeight);
      if (dmDl?.buffer) {
        return {
          success: true,
          videoUrl: dmMatch.url,
          buffer: dmDl.buffer,
          title: dmDl.title || title || dmMatch.title,
          duration: dmDl.duration || formatDurationSeconds(dmMatch.durationSec) || duration,
          author: dmDl.author || dmMatch.author || author,
          views,
          thumbnailUrl: dmDl.thumbnailUrl || dmMatch.thumbnailUrl || thumbnailUrl,
          quality: maxHeight >= 720 ? "720p HD MP4" : "480p SD MP4",
          sourceUrl: ytSourceUrl || dmMatch.url,
          sizeBytes: dmDl.buffer.length,
          fileSizeStr: `${(dmDl.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
          isDirectDownloadable: true,
        };
      }
    }

    // Attempt C: Final fallback - YouTube Watch Card if search succeeded but MP4 mirror unavailable
    if (ytSourceUrl) {
      return {
        success: true,
        videoUrl: ytSourceUrl,
        title,
        duration,
        author,
        views,
        thumbnailUrl,
        quality: "1080p / 720p HD",
        sourceUrl: ytSourceUrl,
        isDirectDownloadable: false,
        fileSizeStr: "Watch Stream Only",
      };
    }

    return {
      success: false,
      title: clean,
      error: `"${clean}" සඳහා වීඩියෝවක් සොයාගැනීමට හෝ බාගත කිරීමට නොහැකි විය.`,
    };
  } catch (err: any) {
    return {
      success: false,
      title: clean,
      error: `Failed to process video: ${err?.message || err}`,
    };
  }
}
