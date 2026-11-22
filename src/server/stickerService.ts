import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const DEFAULT_PACK = "YASHI HALLS MINI";
const DEFAULT_AUTHOR = "Sawrika Suraj • YASHI HALLS";

function escapeXml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Injects or replaces WhatsApp Sticker EXIF metadata (pack name & author) in any static or animated WebP buffer.
 * Pure RIFF container manipulation — lossless and preserves animation frames.
 */
export function addExifToWebp(
  webpBuffer: Buffer,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR,
  emojis: string[] = ["✨", "🤖"]
): Buffer {
  if (!webpBuffer || webpBuffer.length < 16) return webpBuffer;
  if (webpBuffer.toString("ascii", 0, 4) !== "RIFF" || webpBuffer.toString("ascii", 8, 12) !== "WEBP") {
    return webpBuffer;
  }

  const jsonObj = {
    "sticker-pack-id": `yashi.halls.${crypto.randomBytes(6).toString("hex")}`,
    "sticker-pack-name": (packName || DEFAULT_PACK).slice(0, 64),
    "sticker-pack-publisher": (author || DEFAULT_AUTHOR).slice(0, 64),
    emojis,
  };
  const jsonBuf = Buffer.from(JSON.stringify(jsonObj), "utf8");

  // WhatsApp WebP EXIF TIFF header
  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  exifHeader.writeUInt32LE(jsonBuf.length, 14);
  const exifPayload = Buffer.concat([exifHeader, jsonBuf]);

  // Parse existing RIFF chunks
  const chunks: Array<{ id: string; data: Buffer }> = [];
  let offset = 12;
  while (offset + 8 <= webpBuffer.length) {
    const id = webpBuffer.toString("ascii", offset, offset + 4);
    const size = webpBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(webpBuffer.length, dataStart + size);
    const data = Buffer.from(webpBuffer.subarray(dataStart, dataEnd));
    if (id !== "EXIF") {
      chunks.push({ id, data });
    }
    offset = dataStart + size + (size % 2);
  }

  let hasVp8x = false;
  let width = 512;
  let height = 512;
  let hasAlpha = false;

  for (const ch of chunks) {
    if (ch.id === "VP8X" && ch.data.length >= 10) {
      hasVp8x = true;
      ch.data[0] = ch.data[0] | 0x08; // Set EXIF bit (bit 3)
    } else if (ch.id === "VP8 " && ch.data.length >= 10) {
      // Lossy keyframe header: bytes 6..9 store 14-bit width & height
      if (ch.data[3] === 0x9d && ch.data[4] === 0x01 && ch.data[5] === 0x2a) {
        width = ch.data.readUInt16LE(6) & 0x3fff;
        height = ch.data.readUInt16LE(8) & 0x3fff;
      }
    } else if (ch.id === "VP8L" && ch.data.length >= 5) {
      const bits = ch.data.readUInt32LE(1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      hasAlpha = Boolean((bits >> 28) & 1);
    } else if (ch.id === "ALPH") {
      hasAlpha = true;
    }
  }

  // If image was plain VP8/VP8L without VP8X, prepend VP8X so Android WhatsApp reads EXIF + Alpha reliably
  if (!hasVp8x) {
    const vp8x = Buffer.alloc(10, 0);
    let flags = 0x08; // EXIF
    if (hasAlpha) flags |= 0x10; // Alpha
    vp8x[0] = flags;
    const wMinus1 = Math.max(0, width - 1);
    const hMinus1 = Math.max(0, height - 1);
    vp8x[4] = wMinus1 & 0xff;
    vp8x[5] = (wMinus1 >> 8) & 0xff;
    vp8x[6] = (wMinus1 >> 16) & 0xff;
    vp8x[7] = hMinus1 & 0xff;
    vp8x[8] = (hMinus1 >> 8) & 0xff;
    vp8x[9] = (hMinus1 >> 16) & 0xff;
    chunks.unshift({ id: "VP8X", data: vp8x });
  }

  chunks.push({ id: "EXIF", data: exifPayload });

  // Re-serialize RIFF
  const serializedChunks: Buffer[] = [];
  let totalPayloadSize = 4; // "WEBP"
  for (const ch of chunks) {
    const header = Buffer.alloc(8);
    header.write(ch.id, 0, 4, "ascii");
    header.writeUInt32LE(ch.data.length, 4);
    const pad = ch.data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
    serializedChunks.push(header, ch.data, pad);
    totalPayloadSize += 8 + ch.data.length + pad.length;
  }

  const riffHeader = Buffer.alloc(12);
  riffHeader.write("RIFF", 0, 4, "ascii");
  riffHeader.writeUInt32LE(totalPayloadSize, 4);
  riffHeader.write("WEBP", 8, 4, "ascii");

  return Buffer.concat([riffHeader, ...serializedChunks]);
}

export function parsePackAndAuthor(rawArgs?: string): { packName: string; author: string } {
  const clean = (rawArgs || "").trim();
  if (!clean) return { packName: DEFAULT_PACK, author: DEFAULT_AUTHOR };
  if (clean.includes("|")) {
    const [p, a] = clean.split("|").map((s) => s.trim());
    return {
      packName: p || DEFAULT_PACK,
      author: a || DEFAULT_AUTHOR,
    };
  }
  return {
    packName: clean,
    author: DEFAULT_AUTHOR,
  };
}

/**
 * Converts a static photo (JPG/PNG/WebP/etc.) to a crisp 512x512 WhatsApp WebP sticker.
 */
export async function imageToSticker(
  inputBuffer: Buffer,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR
): Promise<Buffer> {
  const webp = await sharp(inputBuffer)
    .rotate()
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 85, alphaQuality: 92 })
    .toBuffer();

  return addExifToWebp(webp, packName, author);
}

/**
 * Converts a short video or GIF buffer into an animated 512x512 WhatsApp WebP sticker.
 */
export async function videoToSticker(
  inputBuffer: Buffer,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR,
  extHint = "mp4"
): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join("/tmp", `stk_in_${uid}.${extHint}`);
  const outPath = path.join("/tmp", `stk_out_${uid}.webp`);

  try {
    await fs.promises.writeFile(inPath, inputBuffer);

    const runFfmpeg = async (fps: number, quality: number, maxSec: number) => {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-t",
          String(maxSec),
          "-i",
          inPath,
          "-vf",
          `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba`,
          "-vcodec",
          "libwebp_anim",
          "-lossless",
          "0",
          "-compression_level",
          "4",
          "-q:v",
          String(quality),
          "-loop",
          "0",
          "-an",
          "-vsync",
          "0",
          outPath,
        ],
        { timeout: 30000 }
      );
    };

    await runFfmpeg(12, 60, 7);
    let webp = await fs.promises.readFile(outPath);

    // WhatsApp animated sticker size limit is ~1 MB
    if (webp.length > 920 * 1024) {
      await runFfmpeg(9, 38, 6);
      webp = await fs.promises.readFile(outPath);
    }
    if (webp.length > 980 * 1024) {
      await runFfmpeg(7, 25, 5);
      webp = await fs.promises.readFile(outPath);
    }

    return addExifToWebp(webp, packName, author);
  } finally {
    await fs.promises.unlink(inPath).catch(() => {});
    await fs.promises.unlink(outPath).catch(() => {});
  }
}

/**
 * Re-tags any existing WhatsApp sticker (static or animated) with custom Pack & Author metadata.
 */
export function retagStickerExif(
  stickerBuffer: Buffer,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR
): Buffer {
  return addExifToWebp(stickerBuffer, packName, author);
}

/**
 * Converts a WhatsApp WebP sticker into a full-resolution JPEG photo.
 */
export async function stickerToImage(webpBuffer: Buffer): Promise<Buffer> {
  return sharp(webpBuffer, { page: 0 })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Converts a static or animated WhatsApp WebP sticker into an H.264 MP4 video.
 */
export async function stickerToVideo(webpBuffer: Buffer): Promise<{ buffer: Buffer; isAnimated: boolean }> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const workDir = path.join("/tmp", `stk2vid_${uid}`);
  const outMp4 = path.join("/tmp", `stk2vid_${uid}.mp4`);

  await fs.promises.mkdir(workDir, { recursive: true });

  try {
    const meta = await sharp(webpBuffer, { animated: true }).metadata();
    const totalPages = Math.max(1, Math.min(180, meta.pages || 1));
    const delays = Array.isArray(meta.delay) ? meta.delay : [];
    const avgDelayMs =
      delays.length > 0
        ? Math.max(30, delays.reduce((a, b) => a + (b || 80), 0) / delays.length)
        : 80;
    const fps = Math.max(4, Math.min(25, Math.round(1000 / avgDelayMs)));

    if (totalPages === 1) {
      const framePath = path.join(workDir, "single.png");
      await sharp(webpBuffer, { page: 0 })
        .flatten({ background: "#09090b" })
        .resize(512, 512, { fit: "contain", background: "#09090b" })
        .png()
        .toFile(framePath);

      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-loop",
          "1",
          "-i",
          framePath,
          "-t",
          "2.5",
          "-vf",
          "scale=512:512,format=yuv420p",
          "-c:v",
          "libx264",
          "-movflags",
          "+faststart",
          outMp4,
        ],
        { timeout: 25000 }
      );
      const buffer = await fs.promises.readFile(outMp4);
      return { buffer, isAnimated: false };
    }

    for (let i = 0; i < totalPages; i++) {
      const framePath = path.join(workDir, `frame_${String(i).padStart(4, "0")}.png`);
      await sharp(webpBuffer, { page: i })
        .flatten({ background: "#09090b" })
        .resize(512, 512, { fit: "contain", background: "#09090b" })
        .png()
        .toFile(framePath);
    }

    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        path.join(workDir, "frame_%04d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outMp4,
      ],
      { timeout: 30000 }
    );

    const buffer = await fs.promises.readFile(outMp4);
    return { buffer, isAnimated: true };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.unlink(outMp4).catch(() => {});
  }
}

function wrapLines(text: string, maxCharsPerLine = 12): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharsPerLine) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        lines.push(word.slice(i, i + maxCharsPerLine));
      }
    } else if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

function buildTextStickerSvg(text: string, textColor: string, strokeColor: string, glowColor: string): string {
  const clean = text.trim() || "YASHI HALLS";
  const maxChars = clean.length <= 10 ? 8 : clean.length <= 24 ? 11 : 14;
  const lines = wrapLines(clean, maxChars);
  const longest = Math.max(...lines.map((l) => l.length), 4);
  let fontSize = Math.floor(420 / Math.max(longest * 0.65, lines.length * 1.15));
  fontSize = Math.max(36, Math.min(108, fontSize));
  const lineHeight = Math.round(fontSize * 1.2);
  const totalTextHeight = lines.length * lineHeight;
  const startY = Math.round(256 - totalTextHeight / 2 + fontSize * 0.82);

  const textElements = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `
        <text x="256" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans, Noto Sans Sinhala, sans-serif" font-weight="900" font-size="${fontSize}" fill="none" stroke="${strokeColor}" stroke-width="${Math.max(8, Math.round(fontSize * 0.16))}" stroke-linejoin="round">${escapeXml(line)}</text>
        <text x="256" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Noto Sans, Noto Sans Sinhala, sans-serif" font-weight="900" font-size="${fontSize}" fill="${textColor}">${escapeXml(line)}</text>
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${glowColor}" flood-opacity="0.85"/>
      </filter>
    </defs>
    <g filter="url(#glow)">
      ${textElements}
    </g>
  </svg>`;
}

/**
 * Creates a static (.ttp) or animated rainbow neon (.attp) WhatsApp text sticker.
 */
export async function createTextSticker(
  rawText: string,
  animated: boolean,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR
): Promise<Buffer> {
  const cleanText = (rawText || "YASHI HALLS").trim();

  if (!animated) {
    const svg = buildTextStickerSvg(cleanText, "#f3e5ab", "#09090b", "#d4af37");
    const webp = await sharp(Buffer.from(svg))
      .resize(512, 512)
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer();
    return addExifToWebp(webp, packName, author);
  }

  const palette = [
    { fill: "#ff2e93", glow: "#ff2e93" },
    { fill: "#ff9900", glow: "#ff9900" },
    { fill: "#facc15", glow: "#facc15" },
    { fill: "#22c55e", glow: "#22c55e" },
    { fill: "#06b6d4", glow: "#06b6d4" },
    { fill: "#60a5fa", glow: "#3b82f6" },
    { fill: "#c084fc", glow: "#a855f7" },
    { fill: "#ffffff", glow: "#f43f5e" },
  ];

  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const workDir = path.join("/tmp", `attp_${uid}`);
  const outWebp = path.join("/tmp", `attp_${uid}.webp`);
  await fs.promises.mkdir(workDir, { recursive: true });

  try {
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i];
      const svg = buildTextStickerSvg(cleanText, c.fill, "#09090b", c.glow);
      await sharp(Buffer.from(svg))
        .resize(512, 512)
        .png()
        .toFile(path.join(workDir, `f_${String(i).padStart(2, "0")}.png`));
    }

    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "8",
        "-i",
        path.join(workDir, "f_%02d.png"),
        "-vcodec",
        "libwebp_anim",
        "-lossless",
        "0",
        "-compression_level",
        "4",
        "-q:v",
        "80",
        "-loop",
        "0",
        "-an",
        outWebp,
      ],
      { timeout: 20000 }
    );

    const webp = await fs.promises.readFile(outWebp);
    return addExifToWebp(webp, packName, author);
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.unlink(outWebp).catch(() => {});
  }
}

function emojiToCodepointVariants(emoji: string): string[] {
  const cps: number[] = [];
  for (const ch of Array.from(emoji.trim())) {
    const cp = ch.codePointAt(0);
    if (cp) cps.push(cp);
  }
  if (cps.length === 0) return [];
  const withFe0f = cps.map((c) => `u${c.toString(16)}`).join("-");
  const withoutFe0f = cps.filter((c) => c !== 0xfe0f).map((c) => `u${c.toString(16)}`).join("-");
  return Array.from(new Set([withFe0f, withoutFe0f].filter(Boolean)));
}

export function extractTwoEmojis(input: string): [string, string] | null {
  const cleaned = (input || "").replace(/[+_&,]+/g, " ").trim();
  const segmenter = new (Intl as any).Segmenter("en", { granularity: "grapheme" });
  const graphemes: string[] = [];
  for (const seg of segmenter.segment(cleaned)) {
    const g = String(seg.segment || "").trim();
    if (!g) continue;
    const cp = g.codePointAt(0) || 0;
    // Match emoji/pictograph codepoint ranges
    if (cp > 0x2000) {
      graphemes.push(g);
    }
  }
  if (graphemes.length >= 2) {
    return [graphemes[0], graphemes[1]];
  }
  return null;
}

const KITCHEN_DATES = [
  "20240530",
  "20240206",
  "20231113",
  "20230803",
  "20230418",
  "20230126",
  "20221101",
  "20220815",
  "20220506",
  "20220203",
  "20211115",
  "20210831",
  "20210521",
  "20210218",
  "20201001",
];

/**
 * Fetches a real Google Noto Emoji Kitchen mashup image and converts it into a WhatsApp sticker.
 * Falls back to a stylized dual-emoji composite badge if that specific emoji pair isn't in Google Kitchen.
 */
export async function createEmojiMixSticker(
  emoji1: string,
  emoji2: string,
  packName = DEFAULT_PACK,
  author = DEFAULT_AUTHOR
): Promise<{ buffer: Buffer; isOfficialKitchen: boolean }> {
  const v1List = emojiToCodepointVariants(emoji1);
  const v2List = emojiToCodepointVariants(emoji2);

  const candidateUrls: string[] = [];
  for (const d of KITCHEN_DATES) {
    for (const u1 of v1List) {
      for (const u2 of v2List) {
        candidateUrls.push(`https://www.gstatic.com/android/keyboard/emojikitchen/${d}/${u1}/${u1}_${u2}.png`);
        candidateUrls.push(`https://www.gstatic.com/android/keyboard/emojikitchen/${d}/${u2}/${u2}_${u1}.png`);
      }
    }
  }

  let matchedPng: Buffer | null = null;
  // Probe in fast parallel waves of 12 URLs
  for (let i = 0; i < candidateUrls.length && !matchedPng; i += 12) {
    const batch = candidateUrls.slice(i, i + 12);
    try {
      const winner = await Promise.any(
        batch.map(async (url) => {
          const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length < 1000) throw new Error("Too small");
          return buf;
        })
      );
      if (winner) {
        matchedPng = winner;
        break;
      }
    } catch {
      // None in this batch matched; try next batch
    }
  }

  if (matchedPng) {
    const webp = await sharp(matchedPng)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 95 })
      .toBuffer();
    return {
      buffer: addExifToWebp(webp, packName, author, [emoji1, emoji2]),
      isOfficialKitchen: true,
    };
  }

  // Fallback stylized dual-emoji fusion SVG
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#d4af37" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#09090b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="256" cy="256" r="230" fill="url(#bg)"/>
    <text x="175" y="295" text-anchor="middle" font-size="185" font-family="Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji, sans-serif">${escapeXml(emoji1)}</text>
    <text x="335" y="335" text-anchor="middle" font-size="185" font-family="Noto Color Emoji, Apple Color Emoji, Segoe UI Emoji, sans-serif">${escapeXml(emoji2)}</text>
  </svg>`;

  const fallbackWebp = await sharp(Buffer.from(fallbackSvg))
    .resize(512, 512)
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();

  return {
    buffer: addExifToWebp(fallbackWebp, packName, author, [emoji1, emoji2]),
    isOfficialKitchen: false,
  };
}

/**
 * Removes backdrop via fast edge-connected flood-fill + anti-aliased alpha feathering in Sharp.
 * Preserves foreground subjects cleanly even if foreground contains white/light colors isolated from edges.
 */
export async function removeBackgroundFromImage(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const totalPixels = w * h;
  const out = Buffer.from(data);

  // Sample border pixels to find dominant backdrop color(s)
  const borderSamples: Array<[number, number, number]> = [];
  const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let x = 0; x < w; x += sampleStep) {
    const t = x * 4;
    const b = ((h - 1) * w + x) * 4;
    borderSamples.push([data[t], data[t + 1], data[t + 2]]);
    borderSamples.push([data[b], data[b + 1], data[b + 2]]);
  }
  for (let y = 0; y < h; y += sampleStep) {
    const l = (y * w) * 4;
    const r = (y * w + (w - 1)) * 4;
    borderSamples.push([data[l], data[l + 1], data[l + 2]]);
    borderSamples.push([data[r], data[r + 1], data[r + 2]]);
  }

  // Median border RGB
  const rs = borderSamples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = borderSamples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = borderSamples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(borderSamples.length / 2);
  const bgR = rs[mid] ?? 255;
  const bgG = gs[mid] ?? 255;
  const bgB = bs[mid] ?? 255;

  const colorDist = (idx: number, refR: number, refG: number, refB: number) => {
    const dr = data[idx] - refR;
    const dg = data[idx + 1] - refG;
    const db = data[idx + 2] - refB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // BFS flood fill from all 4 borders through similar-color connected background pixels
  const visited = new Uint8Array(totalPixels);
  const isBg = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  const HARD_THRESHOLD = 46;
  const STEP_THRESHOLD = 28;

  const tryPush = (pxIdx: number, refR: number, refG: number, refB: number) => {
    if (visited[pxIdx]) return;
    const off = pxIdx * 4;
    if (colorDist(off, bgR, bgG, bgB) <= HARD_THRESHOLD || colorDist(off, refR, refG, refB) <= STEP_THRESHOLD) {
      // Also guard against crossing far away from border color
      if (colorDist(off, bgR, bgG, bgB) <= 78) {
        visited[pxIdx] = 1;
        isBg[pxIdx] = 1;
        queue[tail++] = pxIdx;
      }
    }
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, bgR, bgG, bgB);
    tryPush((h - 1) * w + x, bgR, bgG, bgB);
  }
  for (let y = 0; y < h; y++) {
    tryPush(y * w, bgR, bgG, bgB);
    tryPush(y * w + (w - 1), bgR, bgG, bgB);
  }

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = Math.floor(curr / w);
    const currOff = curr * 4;
    const r0 = data[currOff];
    const g0 = data[currOff + 1];
    const b0 = data[currOff + 2];

    if (cx > 0) tryPush(curr - 1, r0, g0, b0);
    if (cx + 1 < w) tryPush(curr + 1, r0, g0, b0);
    if (cy > 0) tryPush(curr - w, r0, g0, b0);
    if (cy + 1 < h) tryPush(curr + w, r0, g0, b0);
  }

  // Apply transparency and 1px edge feathering
  for (let i = 0; i < totalPixels; i++) {
    if (isBg[i]) {
      out[i * 4 + 3] = 0;
    } else {
      const x = i % w;
      const y = Math.floor(i / w);
      const touchesBg =
        (x > 0 && isBg[i - 1]) ||
        (x + 1 < w && isBg[i + 1]) ||
        (y > 0 && isBg[i - w]) ||
        (y + 1 < h && isBg[i + w]);
      if (touchesBg) {
        const d = colorDist(i * 4, bgR, bgG, bgB);
        if (d < 85) {
          out[i * 4 + 3] = Math.round((d / 85) * 200);
        }
      }
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Upscales & sharpens low-resolution photos into clean HD clarity.
 */
export async function enhanceImageHd(
  inputBuffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const meta = await sharp(inputBuffer).rotate().metadata();
  const srcW = meta.width || 640;
  const srcH = meta.height || 640;
  const scale = srcW < 1000 && srcH < 1000 ? 2 : 1.5;
  const targetW = Math.min(2048, Math.round(srcW * scale));
  const targetH = Math.min(2048, Math.round(srcH * scale));

  const enhanced = await sharp(inputBuffer)
    .rotate()
    .resize(targetW, targetH, { kernel: sharp.kernel.lanczos3, fit: "inside" })
    .clahe({ width: 8, height: 8, maxSlope: 2 })
    .sharpen({ sigma: 1.15, m1: 0.7, m2: 1.4 })
    .modulate({ saturation: 1.1, brightness: 1.02 })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: enhanced.data,
    width: enhanced.info.width,
    height: enhanced.info.height,
  };
}
