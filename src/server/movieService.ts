/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * YASHI HALLS - High-Speed Movie & Sinhala Subtitle Download Engine
 *
 * Uses live working APIs & direct CDNs:
 * 1. SinhalaSub.lk Direct Engine (DDLServer-02 & Pixeldrain MP4 CDN with Sinhala subtitles)
 * 2. Thenkiri Compact HD Engine (DownloadWella fast compact MKV/MP4 resolver)
 * 3. Archive.org Open Cinema fallback (Public Domain MP4s)
 * 4. OpenSubtitles Direct .SRT Engine (Sinhala & English subtitle decompression)
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Readable } from "stream";
import sharp from "sharp";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const OPENSUBTITLES_UA = "TemporaryUserAgent";

const MAX_WHATSAPP_BYTES = 1950 * 1024 * 1024; // 1.95 GB safe limit under WhatsApp 2GB cap
const MIN_VALID_MOVIE_BYTES = 2 * 1024 * 1024; // 2 MB minimum to reject HTML error pages
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface MovieDownloadLink {
  quality: string;
  size: string;
  sizeBytes?: number;
  directUrl: string;
  source: string;
  host?: string;
  fileName?: string;
  mimeType?: string;
  referer?: string;
  linkPageUrl?: string;
}

export interface MovieItem {
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  runtime: string;
  genre: string;
  language: string;
  isSinhalaDub: boolean;
  hasSinhalaSub: boolean;
  posterUrl: string;
  synopsisSinhala?: string;
  synopsisEnglish?: string;
  downloads: MovieDownloadLink[];
  sinhalaSubUrl?: string;
  watchOnlineUrl?: string;
  cineruUrl?: string;
  cineruSubUrl?: string;
  cineruSetUrl?: string;
}

export interface FilmSetPart {
  partNumber: number;
  title: string;
  year: string;
  cineruLink: string;
  subUrl: string;
  directDownload: string;
}

export interface FilmSetItem {
  setTitle: string;
  franchise: string;
  totalParts: number;
  years: string;
  rating: string;
  genre: string;
  posterUrl: string;
  descriptionSinhala: string;
  descriptionEnglish: string;
  cineruSetUrl: string;
  parts: FilmSetPart[];
}

export interface DownloadedMovieFile {
  success: boolean;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sizeFormatted?: string;
  quality?: string;
  source?: string;
  directUrl?: string;
  error?: string;
}

export interface MovieDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  quality?: string;
  source?: string;
}

export interface SubtitleDownloadResult {
  success: boolean;
  fileName?: string;
  srtBuffer?: Buffer;
  movieName?: string;
  year?: string;
  language?: string;
  languageCode?: "sin" | "eng";
  isFallbackLang?: boolean;
  sizeFormatted?: string;
  error?: string;
}

const movieSearchCache = new Map<string, { ts: number; results: MovieItem[] }>();

export const POPULAR_FILM_SETS: FilmSetItem[] = [
  {
    setTitle: "Harry Potter Complete Film Set (Parts 1-8)",
    franchise: "harry potter",
    totalParts: 8,
    years: "2001 - 2011",
    rating: "8.1/10 ⭐",
    genre: "Fantasy, Adventure, Magic",
    posterUrl: "https://images.unsplash.com/photo-1547756536-cde3673fa2e5?w=600&auto=format&fit=crop&q=80",
    descriptionSinhala:
      "හැරී පොටර් සමස්ත චිත්‍රපට මාලාවේ (1 සිට 8 දක්වා) ඕනෑම කොටසක් .film command එකෙන් කෙලින්ම WhatsApp වෙත Download කරගන්න.",
    descriptionEnglish:
      "The legendary wizarding journey of Harry Potter. Complete 8-part collection.",
    cineruSetUrl: "https://sinhalasub.lk/?s=harry+potter",
    parts: [
      { partNumber: 1, title: "Harry Potter and the Sorcerer's Stone", year: "2001", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Sorcerers+Stone", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+1", directDownload: "Harry Potter 2001" },
      { partNumber: 2, title: "Harry Potter and the Chamber of Secrets", year: "2002", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Chamber+of+Secrets", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+2", directDownload: "Harry Potter 2002" },
      { partNumber: 3, title: "Harry Potter and the Prisoner of Azkaban", year: "2004", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Prisoner+of+Azkaban", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+3", directDownload: "Harry Potter 2004" },
      { partNumber: 4, title: "Harry Potter and the Goblet of Fire", year: "2005", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Goblet+of+Fire", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+4", directDownload: "Harry Potter 2005" },
      { partNumber: 5, title: "Harry Potter and the Order of the Phoenix", year: "2007", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Order+of+the+Phoenix", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+5", directDownload: "Harry Potter 2007" },
      { partNumber: 6, title: "Harry Potter and the Half-Blood Prince", year: "2009", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+and+the+Half+Blood+Prince", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+6", directDownload: "Harry Potter 2009" },
      { partNumber: 7, title: "Harry Potter and the Deathly Hallows: Part 1", year: "2010", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+Deathly+Hallows+Part+1", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+7", directDownload: "Harry Potter Deathly Hallows Part 1" },
      { partNumber: 8, title: "Harry Potter and the Deathly Hallows: Part 2", year: "2011", cineruLink: "https://sinhalasub.lk/?s=Harry+Potter+Deathly+Hallows+Part+2", subUrl: "https://www.baiscopelk.com/?s=Harry+Potter+8", directDownload: "Harry Potter Deathly Hallows Part 2" },
    ],
  },
  {
    setTitle: "Fast & Furious Complete Film Franchise Set (1-10)",
    franchise: "fast and furious",
    totalParts: 10,
    years: "2001 - 2023",
    rating: "7.4/10 ⭐",
    genre: "Action, Crime, Street Racing",
    posterUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop&q=80",
    descriptionSinhala:
      "Fast & Furious චිත්‍රපට මාලාවේ (1 සිට 10 දක්වා) සියලුම කොටස් — .film <නම> යොදා කෙලින්ම WhatsApp වෙත ගෙන්වා ගන්න.",
    descriptionEnglish: "The entire Fast & Furious saga.",
    cineruSetUrl: "https://sinhalasub.lk/?s=fast+and+furious",
    parts: [
      { partNumber: 1, title: "The Fast and the Furious", year: "2001", cineruLink: "https://sinhalasub.lk/?s=The+Fast+and+the+Furious+2001", subUrl: "https://www.baiscopelk.com/?s=Fast+and+the+Furious", directDownload: "The Fast and the Furious 2001" },
      { partNumber: 2, title: "2 Fast 2 Furious", year: "2003", cineruLink: "https://sinhalasub.lk/?s=2+Fast+2+Furious", subUrl: "https://www.baiscopelk.com/?s=2+Fast+2+Furious", directDownload: "2 Fast 2 Furious" },
      { partNumber: 3, title: "The Fast and the Furious: Tokyo Drift", year: "2006", cineruLink: "https://sinhalasub.lk/?s=Tokyo+Drift", subUrl: "https://www.baiscopelk.com/?s=Tokyo+Drift", directDownload: "Tokyo Drift" },
      { partNumber: 4, title: "Fast & Furious 4", year: "2009", cineruLink: "https://sinhalasub.lk/?s=Fast+and+Furious+2009", subUrl: "https://www.baiscopelk.com/?s=Fast+Furious+4", directDownload: "Fast and Furious 2009" },
      { partNumber: 5, title: "Fast Five", year: "2011", cineruLink: "https://sinhalasub.lk/?s=Fast+Five", subUrl: "https://www.baiscopelk.com/?s=Fast+Five", directDownload: "Fast Five" },
      { partNumber: 6, title: "Fast & Furious 6", year: "2013", cineruLink: "https://sinhalasub.lk/?s=Fast+and+Furious+6", subUrl: "https://www.baiscopelk.com/?s=Fast+Furious+6", directDownload: "Fast and Furious 6" },
      { partNumber: 7, title: "Furious 7", year: "2015", cineruLink: "https://sinhalasub.lk/?s=Furious+7", subUrl: "https://www.baiscopelk.com/?s=Furious+7", directDownload: "Furious 7" },
      { partNumber: 8, title: "The Fate of the Furious", year: "2017", cineruLink: "https://sinhalasub.lk/?s=The+Fate+of+the+Furious", subUrl: "https://www.baiscopelk.com/?s=Fate+of+the+Furious", directDownload: "Fate of the Furious" },
      { partNumber: 9, title: "F9: The Fast Saga", year: "2021", cineruLink: "https://sinhalasub.lk/?s=F9+Fast+Saga", subUrl: "https://www.baiscopelk.com/?s=Fast+9", directDownload: "F9 Fast Saga" },
      { partNumber: 10, title: "Fast X", year: "2023", cineruLink: "https://sinhalasub.lk/?s=Fast+X", subUrl: "https://www.baiscopelk.com/?s=Fast+X", directDownload: "Fast X" },
    ],
  },
  {
    setTitle: "John Wick Complete Action Film Set (Chapters 1-4)",
    franchise: "john wick",
    totalParts: 4,
    years: "2014 - 2023",
    rating: "8.2/10 ⭐",
    genre: "Action, Thriller, Neo-Noir",
    posterUrl: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80",
    descriptionSinhala:
      "ජෝන් වික් ක්‍රියාදාම චිත්‍රපට මාලාවේ (1 සිට 4 දක්වා) කොටස් — .film <නම> යොදා කෙලින්ම බාගත කරන්න.",
    descriptionEnglish: "The complete John Wick assassin saga.",
    cineruSetUrl: "https://sinhalasub.lk/?s=john+wick",
    parts: [
      { partNumber: 1, title: "John Wick: Chapter 1", year: "2014", cineruLink: "https://sinhalasub.lk/?s=John+Wick+2014", subUrl: "https://www.baiscopelk.com/?s=John+Wick+1", directDownload: "John Wick 2014" },
      { partNumber: 2, title: "John Wick: Chapter 2", year: "2017", cineruLink: "https://sinhalasub.lk/?s=John+Wick+Chapter+2", subUrl: "https://www.baiscopelk.com/?s=John+Wick+2", directDownload: "John Wick Chapter 2" },
      { partNumber: 3, title: "John Wick: Chapter 3 - Parabellum", year: "2019", cineruLink: "https://sinhalasub.lk/?s=John+Wick+Parabellum", subUrl: "https://www.baiscopelk.com/?s=John+Wick+3", directDownload: "John Wick Chapter 3" },
      { partNumber: 4, title: "John Wick: Chapter 4", year: "2023", cineruLink: "https://sinhalasub.lk/?s=John+Wick+Chapter+4", subUrl: "https://www.baiscopelk.com/?s=John+Wick+4", directDownload: "John Wick Chapter 4" },
    ],
  },
  {
    setTitle: "K.G.F Chapters 1 & 2 (Complete Set)",
    franchise: "kgf",
    totalParts: 2,
    years: "2018 - 2022",
    rating: "8.3/10 ⭐",
    genre: "Action, Crime, Period Drama",
    posterUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80",
    descriptionSinhala:
      "K.G.F Chapter 1 සහ Chapter 2 — .film kgf chapter 1 හෝ .film kgf chapter 2 ලෙස ටයිප් කර WhatsApp වෙත කෙලින්ම ගෙන්වා ගන්න.",
    descriptionEnglish: "Rocking Star Yash in KGF Chapter 1 & 2.",
    cineruSetUrl: "https://sinhalasub.lk/?s=kgf",
    parts: [
      { partNumber: 1, title: "K.G.F: Chapter 1", year: "2018", cineruLink: "https://sinhalasub.lk/?s=KGF+Chapter+1", subUrl: "https://www.baiscopelk.com/?s=KGF+Chapter+1", directDownload: "KGF Chapter 1" },
      { partNumber: 2, title: "K.G.F: Chapter 2", year: "2022", cineruLink: "https://sinhalasub.lk/?s=KGF+Chapter+2", subUrl: "https://www.baiscopelk.com/?s=KGF+Chapter+2", directDownload: "KGF Chapter 2" },
    ],
  },
];

export function getFilmSet(franchiseQuery: string): FilmSetItem | null {
  const clean = (franchiseQuery || "").toLowerCase().trim();
  if (!clean) return null;

  const isExplicitSet = /\b(set|film set|movie set|franchise|complete set|all parts|collection)\b/i.test(clean);
  if (!isExplicitSet) return null;

  const found = POPULAR_FILM_SETS.find(
    (s) =>
      clean.includes(s.franchise.toLowerCase()) ||
      s.franchise.toLowerCase().includes(clean.replace(/\b(set|film|movie|complete|collection)\b/gi, "").trim())
  );
  if (found) return found;

  const topic = clean.replace(/\b(set|film set|movie set|franchise|complete set|all parts|collection|cineru|film|movie)\b/gi, "").trim();
  if (topic && topic.length >= 2) {
    const formattedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
    const encoded = encodeURIComponent(topic);
    return {
      setTitle: `${formattedTopic} Complete Film Set`,
      franchise: topic,
      totalParts: 3,
      years: "Anthology",
      rating: "8.2/10 ⭐",
      genre: "Action, Adventure, Blockbuster",
      posterUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
      descriptionSinhala: `${formattedTopic} චිත්‍රපට මාලාවේ කොටස් බාගත කිරීමට .film ${formattedTopic} part 1 ආදී ලෙස භාවිතා කරන්න.`,
      descriptionEnglish: `Complete ${formattedTopic} collection.`,
      cineruSetUrl: `https://sinhalasub.lk/?s=${encoded}`,
      parts: [
        { partNumber: 1, title: `${formattedTopic} Part 1`, year: "Part 1", cineruLink: `https://sinhalasub.lk/?s=${encoded}+1`, subUrl: `https://www.baiscopelk.com/?s=${encoded}+1`, directDownload: `${formattedTopic} 1` },
        { partNumber: 2, title: `${formattedTopic} Part 2`, year: "Part 2", cineruLink: `https://sinhalasub.lk/?s=${encoded}+2`, subUrl: `https://www.baiscopelk.com/?s=${encoded}+2`, directDownload: `${formattedTopic} 2` },
        { partNumber: 3, title: `${formattedTopic} Part 3`, year: "Part 3", cineruLink: `https://sinhalasub.lk/?s=${encoded}+3`, subUrl: `https://www.baiscopelk.com/?s=${encoded}+3`, directDownload: `${formattedTopic} 3` },
      ],
    };
  }

  return null;
}

export const searchFilmSets = getFilmSet;

function decodeHtmlEntities(str: string): string {
  return String(str || "")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function parseSizeToBytes(sizeStr: string): number {
  const clean = String(sizeStr || "").trim().toUpperCase();
  const match = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|GB|MB|KB|B)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "TB") return Math.round(val * 1024 * 1024 * 1024 * 1024);
  if (unit === "GB") return Math.round(val * 1024 * 1024 * 1024);
  if (unit === "MB") return Math.round(val * 1024 * 1024);
  if (unit === "KB") return Math.round(val * 1024);
  return Math.round(val);
}

export function formatBytesSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function normalizeForMatch(s: string): string {
  return decodeHtmlEntities(s)
    .toLowerCase()
    .replace(/([a-z])\.([a-z])\.([a-z])\b/g, "$1$2$3")
    .replace(/([a-z])\.([a-z])\b/g, "$1$2")
    .replace(/sinhala subtitles?|සිංහල උපසිරැසි.*|download hollywood movie|download movie|webrip|bluray|amzn|\(\d{4}\)|\|.*/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b([a-z])\s+([a-z])\s+([a-z])\b/g, "$1$2$3")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitleMatch(candidateTitle: string, rawQuery: string): number {
  const normTitle = normalizeForMatch(candidateTitle);
  const normQuery = normalizeForMatch(rawQuery);
  if (!normTitle || !normQuery) return -100;

  let score = 0;
  if (normTitle === normQuery) score += 120;
  else if (normTitle.includes(normQuery)) score += 75;

  const qWords = normQuery.split(" ").filter((w) => w.length >= 2 || /^\d+$/.test(w));
  const tWords = new Set(normTitle.split(" "));

  let hits = 0;
  for (const w of qWords) {
    if (tWords.has(w) || normTitle.includes(w)) {
      hits++;
      score += 25;
    } else {
      score -= 22;
    }
  }

  if (qWords.length > 0 && hits === 0) {
    return -100;
  }

  const wantsSeries = /\b(season|episode|s\d+|e\d+|series|tv)\b/i.test(rawQuery);
  if (!wantsSeries && /\b(tv series|s\d{2}|episode\s*\d+)\b/i.test(candidateTitle)) {
    score -= 45;
  }

  score -= Math.abs(normTitle.length - normQuery.length) * 0.25;
  return score;
}

export function extractMovieQualityFlag(rawQuery: string): { cleanQuery: string; preferredQuality?: "360p" | "480p" | "720p" | "1080p" | "compact" } {
  const match = rawQuery.match(/\b(360p|480p|720p|1080p|compact)\b/i);
  if (!match) return { cleanQuery: rawQuery.trim() };
  const preferredQuality = match[1].toLowerCase() as "360p" | "480p" | "720p" | "1080p" | "compact";
  const cleanQuery = rawQuery.replace(/\b(360p|480p|720p|1080p|compact)\b/gi, "").replace(/\s+/g, " ").trim();
  return { cleanQuery, preferredQuality };
}

/**
 * Estimates total seconds to download + encrypt + upload to WhatsApp for smart mirror ordering.
 * Smaller files + faster CDN hosts rank first when user doesn't force a specific resolution.
 */
function estimateMirrorSeconds(dl: MovieDownloadLink): number {
  const fallbackMB = dl.host === "DownloadWella"
    ? 340
    : /480p/i.test(dl.quality)
      ? 550
      : /720p/i.test(dl.quality)
        ? 980
        : 750;
  const sizeMB = dl.sizeBytes && dl.sizeBytes > 0 ? dl.sizeBytes / (1024 * 1024) : fallbackMB;

  const dlHostMBps = dl.host === "DLServer-02"
    ? 3.7
    : dl.host === "Pixeldrain"
      ? 3.2 // With 6x parallel range chunks
      : dl.host === "DownloadWella"
        ? 1.4
        : 3.0;
  const waUploadMBps = 4.2; // Approximate AES encrypt + upload throughput

  return sizeMB / dlHostMBps + sizeMB / waUploadMBps;
}

async function probeMirrorContentLength(dl: MovieDownloadLink): Promise<void> {
  if ((dl.sizeBytes && dl.sizeBytes > 0) || !dl.directUrl) return;
  try {
    const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
    if (dl.referer) headers["Referer"] = dl.referer;
    const res = await fetch(dl.directUrl, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(1800),
    });
    const cl = Number(res.headers.get("content-length") || "0");
    if (cl > MIN_VALID_MOVIE_BYTES) {
      dl.sizeBytes = cl;
      dl.size = formatBytesSize(cl);
    }
  } catch {}
}

/**
 * Resolves a SinhalaSub.lk /links/... redirect wrapper to its direct CDN/Pixeldrain URL.
 */
async function resolveSinhalaSubLinkPage(linkUrl: string, moviePageUrl: string): Promise<{ directUrl: string; hostType: string } | null> {
  try {
    const resp = await fetch(linkUrl, {
      headers: { "User-Agent": BROWSER_UA, Referer: moviePageUrl },
      signal: AbortSignal.timeout(4800),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const match = html.match(/var\s+zluFinalLink\s*=\s*['"]([^'"]+)['"]/i);
    if (!match || !match[1]) return null;
    const finalLink = match[1].trim();

    if (/pixeldrain\.com\/(?:u|file)\/([a-zA-Z0-9]+)/i.test(finalLink)) {
      const id = finalLink.match(/pixeldrain\.com\/(?:u|file)\/([a-zA-Z0-9]+)/i)![1];
      return {
        directUrl: `https://pixeldrain.com/api/file/${id}?download`,
        hostType: "Pixeldrain",
      };
    }

    if (/ddl\.sinhalasub\.net/i.test(finalLink)) {
      return {
        directUrl: finalLink,
        hostType: "DLServer-02",
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Provider 1: SinhalaSub.lk Real Movie Search & Direct MP4 Resolver (DDLServer-02 + Pixeldrain)
 */
async function searchSinhalaSubProvider(
  query: string,
  preferredQuality?: "360p" | "480p" | "720p" | "1080p" | "compact"
): Promise<MovieItem | null> {
  try {
    const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
    const sr = await fetch(searchUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(5500),
    });
    if (!sr.ok) return null;
    const searchHtml = await sr.text();

    const candidateMap = new Map<string, string>();
    const anchorRegex = /<a[^>]+href=["'](https:\/\/sinhalasub\.lk\/movies\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRegex.exec(searchHtml)) !== null) {
      const url = m[1];
      const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (!candidateMap.has(url) || text.length > (candidateMap.get(url)?.length || 0)) {
        const slugFallback = url.split("/movies/")[1]?.replace(/\/$/, "").replace(/-/g, " ") || "";
        candidateMap.set(url, text.length >= 3 ? text : slugFallback);
      }
    }

    if (candidateMap.size === 0) return null;

    const ranked = [...candidateMap.entries()]
      .map(([url, rawTitle]) => {
        const slugTitle = url.split("/movies/")[1]?.replace(/\/$/, "").replace(/-/g, " ") || rawTitle;
        const bestTitle = rawTitle.length >= 4 ? rawTitle : slugTitle;
        return { url, title: bestTitle, score: Math.max(scoreTitleMatch(bestTitle, query), scoreTitleMatch(slugTitle, query)) };
      })
      .filter((x) => x.score >= 10)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) return null;
    const best = ranked[0];

    const mr = await fetch(best.url, {
      headers: { "User-Agent": BROWSER_UA, Referer: searchUrl },
      signal: AbortSignal.timeout(5500),
    });
    if (!mr.ok) return null;
    const movieHtml = await mr.text();

    const ogTitle =
      movieHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      movieHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
      movieHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "") ||
      movieHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "") ||
      best.title;
    const cleanTitle = decodeHtmlEntities(ogTitle)
      .replace(/\|\s*සිංහල උපසිරැසි.*$/i, "")
      .replace(/Sinhala Subtitles.*$/i, "")
      .replace(/\s*[-–|]\s*SinhalaSub.*$/i, "")
      .trim();

    const yearMatch = cleanTitle.match(/\((\d{4})\)/) || ogTitle.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : "Latest";

    const rawPosterUrl =
      movieHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      movieHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=780&auto=format&fit=crop&q=80";
    const posterUrl = rawPosterUrl.trim();

    const rawDesc =
      movieHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      movieHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ||
      "";
    const cleanDesc = decodeHtmlEntities(rawDesc).replace(/\s+/g, " ").trim().slice(0, 240);

    interface RawRow {
      quality: string;
      size: string;
      sizeBytes: number;
      host: string;
      linkPageUrl: string;
      priority: number;
    }

    const rawRows: RawRow[] = [];
    const rowRegex = /<tr[^>]*class=["'][^"']*zm-link-row[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRegex.exec(movieHtml)) !== null) {
      const rowHtml = rm[1];
      const href = rowHtml.match(/href=["'](https:\/\/sinhalasub\.lk\/links\/[^"']+)["']/i)?.[1];
      if (!href) continue;

      const quality = decodeHtmlEntities(rowHtml.match(/class=["']zm-q["'][^>]*>([^<]+)</i)?.[1] || "HD").trim();
      const sizeStr = decodeHtmlEntities(rowHtml.match(/class=["']zm-m-size["'][^>]*>([^<]+)</i)?.[1] || "").trim();
      const host = decodeHtmlEntities(
        rowHtml.match(/class=["']zm-dl-btn["'][^>]*>[\s\S]*?<\/i>\s*([^<]+)/i)?.[1] ||
          rowHtml.match(/class=["']zm-dl-btn["'][^>]*>([^<]+)</i)?.[1] ||
          ""
      ).trim();

      const isSupportedHost = /pixeldrain|dlserver-02/i.test(host) || /pixeldrain|ddl\.sinhalasub/i.test(rowHtml);
      if (!isSupportedHost) continue;

      const sizeBytes = parseSizeToBytes(sizeStr);
      if (sizeBytes > MAX_WHATSAPP_BYTES) continue;

      let priority = 0;
      if (/dlserver-02|ddl\.sinhalasub/i.test(host + rowHtml)) priority += 30;
      if (/pixeldrain/i.test(host + rowHtml)) priority += 25;

      const qLower = quality.toLowerCase();
      if (preferredQuality) {
        if (qLower.includes(preferredQuality)) priority += 120;
      } else {
        if (qLower.includes("480p")) priority += 80;
        else if (qLower.includes("360p")) priority += 90;
        else if (qLower.includes("720p")) priority += 25;
        // Favor smaller sizes for fast chat delivery
        if (sizeBytes > 0) {
          priority -= Math.round(sizeBytes / (40 * 1024 * 1024));
        }
      }

      rawRows.push({ quality, size: sizeStr || "MP4", sizeBytes, host: host || "Direct", linkPageUrl: href, priority });
    }

    if (rawRows.length === 0) return null;

    rawRows.sort((a, b) => b.priority - a.priority);

    // Pick best mirrors across distinct resolutions (480p, 720p, 1080p) so user gets 2 quality choices!
    const selectedRows: RawRow[] = [];
    const seenTiers = new Set<string>();
    for (const row of rawRows) {
      const tier = row.quality.match(/(360p|480p|720p|1080p)/i)?.[1]?.toLowerCase() || row.quality.toLowerCase();
      if (!seenTiers.has(tier)) {
        seenTiers.add(tier);
        selectedRows.push(row);
      }
      if (selectedRows.length >= 3) break;
    }
    // Add 1 backup mirror for the highest-priority row
    for (const row of rawRows) {
      if (selectedRows.length >= 4) break;
      if (!selectedRows.includes(row)) {
        selectedRows.push(row);
      }
    }

    const resolvedLinks = await Promise.all(
      selectedRows.map(async (row) => {
        const resolved = await resolveSinhalaSubLinkPage(row.linkPageUrl, best.url);
        if (!resolved) return null;
        const safeBase = cleanTitle.replace(/[^a-zA-Z0-9\s._()-]/g, "").trim().replace(/\s+/g, ".");
        const qTag = row.quality.replace(/\s+/g, ".");
        return {
          quality: `${row.quality} (${resolved.hostType})`,
          size: row.size || (row.sizeBytes ? formatBytesSize(row.sizeBytes) : "Direct MP4"),
          sizeBytes: row.sizeBytes,
          directUrl: resolved.directUrl,
          source: `SinhalaSub.lk • ${resolved.hostType}`,
          host: resolved.hostType,
          fileName: `${safeBase}.${qTag}.mp4`,
          mimeType: "video/mp4",
          referer: "https://sinhalasub.lk/",
          linkPageUrl: row.linkPageUrl,
        } as MovieDownloadLink;
      })
    );

    const validDownloads = resolvedLinks.filter((x): x is MovieDownloadLink => Boolean(x));
    if (validDownloads.length === 0) return null;

    return {
      title: cleanTitle,
      originalTitle: cleanTitle,
      year,
      rating: "IMDb Verified ⭐",
      runtime: "Full Movie",
      genre: "Sinhala Subtitled Movie",
      language: "Original + Sinhala Subtitles",
      isSinhalaDub: false,
      hasSinhalaSub: true,
      posterUrl,
      synopsisSinhala: cleanDesc || `${cleanTitle} චිත්‍රපටය සිංහල උපසිරැසි සමඟින්.`,
      synopsisEnglish: cleanDesc || `${cleanTitle} full movie with Sinhala subtitles.`,
      downloads: validDownloads,
      cineruUrl: best.url,
      sinhalaSubUrl: best.url,
      watchOnlineUrl: best.url,
    };
  } catch (err: any) {
    console.warn("[MovieService] SinhalaSub search notice:", err?.message || err);
    return null;
  }
}

/**
 * Resolves a DownloadWella XFileSharing page (`POST op=download2`) to direct `.mkv`/`.mp4` CDN URL
 */
async function resolveDownloadWellaDirectUrl(pageUrl: string): Promise<{ directUrl: string; fileName?: string } | null> {
  try {
    const cleanPageUrl = pageUrl.split("#")[0].trim();
    const getResp = await fetch(cleanPageUrl, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(5500),
    });
    if (!getResp.ok) return null;
    const html = await getResp.text();

    const params = new URLSearchParams();
    const inputRegex = /<input[^>]+name=["']([^"']+)["'][^>]*>/gi;
    let im: RegExpExecArray | null;
    while ((im = inputRegex.exec(html)) !== null) {
      const tag = im[0];
      const name = im[1];
      const val = tag.match(/value=["']([^"']*)["']/i)?.[1] ?? "";
      params.set(name, val);
    }
    if (!params.has("op")) params.set("op", "download2");
    if (!params.has("id")) {
      const idMatch = cleanPageUrl.match(/downloadwella\.com\/([a-z0-9]+)/i);
      if (idMatch) params.set("id", idMatch[1]);
    }

    const postResp = await fetch(cleanPageUrl, {
      method: "POST",
      headers: {
        "User-Agent": BROWSER_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: cleanPageUrl,
        Origin: "https://downloadwella.com",
      },
      body: params.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });

    const location = postResp.headers.get("location");
    if (location && /\.(?:mkv|mp4)/i.test(location)) {
      const fileName = decodeURIComponent(location.split("/").pop()?.split("?")[0] || "movie.mkv");
      return { directUrl: location, fileName };
    }

    if (postResp.status === 200) {
      const postHtml = await postResp.text();
      const cdnMatch = postHtml.match(/https?:\/\/[^"'\s<>]*downloadwella\.com\/d\/[^"'\s<>]+\.(?:mkv|mp4)/i);
      if (cdnMatch && cdnMatch[0]) {
        const fileName = decodeURIComponent(cdnMatch[0].split("/").pop()?.split("?")[0] || "movie.mkv");
        return { directUrl: cdnMatch[0], fileName };
      }
    }

    return null;
  } catch (err: any) {
    console.warn("[MovieService] DownloadWella resolve notice:", err?.message || err);
    return null;
  }
}

/**
 * Provider 2: Thenkiri Lean WordPress API (fields-only, no _embed overhead) -> DownloadWella Compact MKV/MP4
 */
async function searchNkiriProvider(query: string): Promise<MovieItem | null> {
  try {
    interface NkiriCandidate {
      title: string;
      url: string;
      thumbnail?: string;
      excerpt?: string;
      downloadPages: string[];
    }

    const wpResp = await fetch(
      `https://thenkiri.com/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=4&_fields=title,link,content,excerpt`,
      {
        headers: { "User-Agent": BROWSER_UA },
        signal: AbortSignal.timeout(7500),
      }
    );
    if (!wpResp.ok) return null;
    const posts: any = await wpResp.json();
    if (!Array.isArray(posts) || posts.length === 0) return null;

    const candidates: NkiriCandidate[] = [];
    for (const post of posts) {
      const title = decodeHtmlEntities(post?.title?.rendered || "");
      const content = String(post?.content?.rendered || "");
      const excerpt = decodeHtmlEntities(String(post?.excerpt?.rendered || "").replace(/<[^>]+>/g, " "));
      const downloadPages = [
        ...new Set(
          [...content.matchAll(/https?:\/\/downloadwella\.com\/[a-z0-9]+\/[^"'\s<>]+/gi)].map((m) =>
            decodeHtmlEntities(m[0])
          )
        ),
      ];
      const imgMatch = content.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      const thumb = imgMatch?.[1];
      if (title && downloadPages.length > 0) {
        candidates.push({ title, url: post.link || "https://thenkiri.com/", thumbnail: thumb, excerpt, downloadPages });
      }
    }

    if (candidates.length === 0) return null;

    const ranked = candidates
      .map((c) => ({ ...c, score: scoreTitleMatch(c.title, query) }))
      .filter((c) => c.score >= 10)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) return null;
    const best = ranked[0];

    const sizeMatch = (best.excerpt || "").match(/([0-9]+(?:\.[0-9]+)?\s*(?:MB|GB))/i);
    const sizeLabel = sizeMatch ? sizeMatch[1] : "~350 MB";
    const sizeBytes = sizeMatch ? parseSizeToBytes(sizeMatch[1]) : 0;

    // Resolve primary link (plus mirror 2 if present) concurrently
    const resolvedLinks = await Promise.all(
      best.downloadPages.slice(0, 2).map(async (dlPage, i) => {
        const res = await resolveDownloadWellaDirectUrl(dlPage);
        if (!res) return null;
        const ext = res.fileName?.toLowerCase().endsWith(".mp4") ? "mp4" : "mkv";
        return {
          quality: i === 0 ? "Compact Fast HD" : "Compact HD Mirror 2",
          size: sizeLabel,
          sizeBytes,
          directUrl: res.directUrl,
          source: "DownloadWella Fast Cloud",
          host: "DownloadWella",
          fileName: res.fileName || `${normalizeForMatch(best.title).replace(/\s+/g, ".")}.${ext}`,
          mimeType: ext === "mp4" ? "video/mp4" : "video/x-matroska",
          referer: dlPage,
          linkPageUrl: dlPage,
        } as MovieDownloadLink;
      })
    );

    const validDownloads = resolvedLinks.filter((x): x is MovieDownloadLink => Boolean(x));
    if (validDownloads.length === 0) return null;

    // Probe real Content-Length quickly if excerpt didn't have exact bytes
    if (!validDownloads[0].sizeBytes) {
      await probeMirrorContentLength(validDownloads[0]);
    }

    const cleanTitle = best.title.replace(/\|\s*Download Hollywood Movie/i, "").trim();
    const yearMatch = cleanTitle.match(/\((\d{4})\)/);

    return {
      title: cleanTitle,
      originalTitle: cleanTitle,
      year: yearMatch ? yearMatch[1] : "Latest",
      rating: "IMDb Verified ⭐",
      runtime: "Full Movie",
      genre: "Hollywood / International",
      language: "English",
      isSinhalaDub: false,
      hasSinhalaSub: false,
      posterUrl:
        best.thumbnail ||
        "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80",
      synopsisSinhala: `${cleanTitle} — අඩු Data ප්‍රමාණයකින් වේගයෙන් WhatsApp වෙත ලැබෙන Compact HD චිත්‍රපටය.`,
      synopsisEnglish: (best.excerpt || cleanTitle).slice(0, 240),
      downloads: validDownloads,
      cineruUrl: best.url,
      watchOnlineUrl: best.url,
    };
  } catch (err: any) {
    console.warn("[MovieService] Nkiri search notice:", err?.message || err);
    return null;
  }
}

/**
 * Provider 3: Archive.org Public Cinema Fallback (Direct MP4 under 1.9GB)
 */
async function searchArchiveOrgProvider(query: string): Promise<MovieItem | null> {
  try {
    const cleanQ = normalizeForMatch(query);
    if (!cleanQ) return null;
    const searchUrl = `https://archive.org/advancedsearch.php?q=title:(${encodeURIComponent(cleanQ)})+AND+mediatype:(movies)&fl[]=identifier,title,year,description&rows=4&output=json`;
    const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
    if (!sr.ok) return null;
    const sj: any = await sr.json();
    const docs = sj?.response?.docs;
    if (!Array.isArray(docs) || docs.length === 0) return null;

    const ranked = docs
      .map((d: any) => ({ doc: d, score: scoreTitleMatch(String(d.title || ""), query) }))
      .filter((x: any) => x.score >= 15)
      .sort((a: any, b: any) => b.score - a.score);

    if (ranked.length === 0) return null;
    const doc = ranked[0].doc;
    const id = doc.identifier;

    const mr = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/files`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!mr.ok) return null;
    const mj: any = await mr.json();
    const wantsTrailer = /\b(trailer|teaser|clip|promo)\b/i.test(query);
    const minBytes = wantsTrailer ? MIN_VALID_MOVIE_BYTES : 25 * 1024 * 1024;
    const mp4s = (mj?.result || [])
      .filter((f: any) => {
        const fname = String(f.name || "").toLowerCase();
        if (!fname.endsWith(".mp4")) return false;
        if (!wantsTrailer && /\b(trailer|teaser|promo)\b/i.test(fname)) return false;
        const sz = Number(f.size);
        return sz >= minBytes && sz <= MAX_WHATSAPP_BYTES;
      })
      .sort((a: any, b: any) => Number(a.size) - Number(b.size));

    if (mp4s.length === 0) return null;
    const chosen = mp4s[0];
    const sizeBytes = Number(chosen.size) || 0;

    return {
      title: String(doc.title || query),
      originalTitle: String(doc.title || query),
      year: String(doc.year || "Classic"),
      rating: "Archive.org ⭐",
      runtime: "Full Video",
      genre: "Open Cinema",
      language: "English",
      isSinhalaDub: false,
      hasSinhalaSub: false,
      posterUrl: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      synopsisSinhala: `${doc.title || query} — Archive.org වෙතින් සෘජු MP4 බාගත කිරීම.`,
      synopsisEnglish: String(doc.description || doc.title || "").replace(/<[^>]+>/g, " ").slice(0, 220),
      downloads: [
        {
          quality: "Archive MP4 Direct",
          size: formatBytesSize(sizeBytes),
          sizeBytes,
          directUrl: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(chosen.name)}`,
          source: "Archive.org Open CDN",
          host: "Archive.org",
          fileName: chosen.name,
          mimeType: "video/mp4",
        },
      ],
      cineruUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
    };
  } catch {
    return null;
  }
}

/**
 * Searches live movie providers in parallel with smart early race + 30-min cache,
 * and orders mirrors by fastest estimated end-to-end delivery time.
 */
export async function searchMovies(
  query: string,
  onlySinhalaDub: boolean = false,
  preferredQuality?: "360p" | "480p" | "720p" | "1080p" | "compact"
): Promise<MovieItem[]> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return [];

  const cacheKey = `${cleanQuery.toLowerCase()}|${onlySinhalaDub ? "dub" : "std"}|${preferredQuality || "fast"}`;
  const cached = movieSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

  const searchQ = onlySinhalaDub ? `${cleanQuery} sinhala` : cleanQuery;

  const ssPromise = searchSinhalaSubProvider(searchQ, preferredQuality);
  const nkiriPromise = onlySinhalaDub ? Promise.resolve(null) : searchNkiriProvider(cleanQuery);

  let ssMovie: MovieItem | null = null;
  let nkiriMovie: MovieItem | null = null;

  // Smart early-return race: once the first provider finishes with a valid result,
  // give the second provider at most a 1600ms grace window so slow providers never stall search!
  await new Promise<void>((resolve) => {
    let doneCount = 0;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (graceTimer) clearTimeout(graceTimer);
      resolve();
    };

    const onOneDone = (gotResult: boolean) => {
      doneCount++;
      if (doneCount >= 2) {
        finish();
      } else if (gotResult && !graceTimer) {
        graceTimer = setTimeout(finish, 1600);
      }
    };

    ssPromise
      .then((res) => {
        ssMovie = res;
        onOneDone(Boolean(res));
      })
      .catch(() => onOneDone(false));

    nkiriPromise
      .then((res) => {
        nkiriMovie = res;
        onOneDone(Boolean(res));
      })
      .catch(() => onOneDone(false));
  });

  const results: MovieItem[] = [];

  if (ssMovie && nkiriMovie) {
    const ssScore = scoreTitleMatch((ssMovie as MovieItem).title, cleanQuery);
    const nkScore = scoreTitleMatch((nkiriMovie as MovieItem).title, cleanQuery);
    const primary = !preferredQuality && nkScore > ssScore + 20 ? (nkiriMovie as MovieItem) : (ssMovie as MovieItem);
    const secondary = primary === ssMovie ? (nkiriMovie as MovieItem) : (ssMovie as MovieItem);

    // Combine all unique mirrors; when user didn't force quality, sort by fastest total delivery time!
    const mergedDownloads = [...primary.downloads, ...secondary.downloads];
    if (!preferredQuality) {
      mergedDownloads.sort((a, b) => estimateMirrorSeconds(a) - estimateMirrorSeconds(b));
    }

    primary.downloads = mergedDownloads;
    primary.hasSinhalaSub = Boolean(ssMovie) || primary.hasSinhalaSub;
    results.push(primary, secondary);
  } else if (ssMovie) {
    if (!preferredQuality) {
      (ssMovie as MovieItem).downloads.sort((a, b) => estimateMirrorSeconds(a) - estimateMirrorSeconds(b));
    }
    results.push(ssMovie);
  } else if (nkiriMovie) {
    results.push(nkiriMovie);
  } else {
    const archiveMovie = await searchArchiveOrgProvider(cleanQuery);
    if (archiveMovie) results.push(archiveMovie);
  }

  if (results.length > 0) {
    movieSearchCache.set(cacheKey, { ts: Date.now(), results });
    if (movieSearchCache.size > 60) {
      const oldestKey = movieSearchCache.keys().next().value;
      if (oldestKey) movieSearchCache.delete(oldestKey);
    }
  }

  return results;
}

/**
 * Downloads & resizes a movie poster into a crisp wide banner JPEG data URI
 * so WhatsApp's HTML WebView renders the edge-to-edge poster clearly without hotlink blocks.
 */
export async function fetchPosterAsDataUri(posterUrl: string): Promise<string> {
  const cleanUrl = (posterUrl || "").trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return "";
  try {
    const resp = await fetch(cleanUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "image/*",
        Referer: new URL(cleanUrl).origin + "/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(2500),
    });
    if (!resp.ok) return cleanUrl;
    const rawBuf = Buffer.from(await resp.arrayBuffer());
    if (rawBuf.length < 512) return cleanUrl;

    const compactJpeg = await sharp(rawBuf)
      .resize({ width: 560, withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${compactJpeg.toString("base64")}`;
  } catch {
    return cleanUrl;
  }
}

/**
 * Removes leftover temporary movie downloads & encrypted temp files older than 30 minutes.
 */
export async function cleanupStaleMovieTempFiles(): Promise<void> {
  try {
    const files = await fs.promises.readdir("/tmp");
    const cutoff = Date.now() - 30 * 60 * 1000;
    await Promise.all(
      files
        .filter((f) => /^(movie_|document.*-enc$|video.*-enc$)/.test(f))
        .map(async (f) => {
          const full = path.join("/tmp", f);
          const st = await fs.promises.stat(full).catch(() => null);
          if (st && st.mtimeMs < cutoff) {
            await fs.promises.unlink(full).catch(() => {});
          }
        })
    );
  } catch {}
}

/**
 * High-speed 6-connection concurrent byte-range downloader specifically for hosts
 * verified to accelerate cleanly with Range requests (Pixeldrain).
 */
async function downloadPixeldrainParallel(
  directUrl: string,
  tempFilePath: string,
  baseHeaders: Record<string, string>,
  onBytesProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<{ success: boolean; sizeBytes?: number; fileName?: string; contentType?: string }> {
  try {
    const headResp = await fetch(directUrl, {
      method: "HEAD",
      headers: baseHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
    });
    if (!headResp.ok) return { success: false };

    const totalSize = Number(headResp.headers.get("content-length") || "0");
    const acceptRanges = (headResp.headers.get("accept-ranges") || "").toLowerCase();
    if (!totalSize || totalSize < 15 * 1024 * 1024 || totalSize > MAX_WHATSAPP_BYTES || !acceptRanges.includes("bytes")) {
      return { success: false };
    }

    let fileName: string | undefined;
    const cd = headResp.headers.get("content-disposition");
    if (cd) {
      const fnMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (fnMatch?.[1]) {
        try {
          fileName = decodeURIComponent(fnMatch[1].trim()).replace(/[Â\u00A0]+/g, " ").trim();
        } catch {
          fileName = fnMatch[1].trim();
        }
      }
    }
    const contentType = (headResp.headers.get("content-type") || "").toLowerCase();

    const CONCURRENCY = 6;
    const chunkSize = Math.ceil(totalSize / CONCURRENCY);
    const fh = await fs.promises.open(tempFilePath, "w+");
    let totalDownloaded = 0;

    try {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async (_, idx) => {
          const start = idx * chunkSize;
          if (start >= totalSize) return;
          const end = Math.min(totalSize - 1, (idx + 1) * chunkSize - 1);

          const ac = new AbortController();
          let stallTimer = setTimeout(() => ac.abort(new Error("Range chunk TTFB timeout")), 10000);
          try {
            const resp = await fetch(directUrl, {
              headers: { ...baseHeaders, Range: `bytes=${start}-${end}` },
              redirect: "follow",
              signal: ac.signal,
            });
            clearTimeout(stallTimer);

            if (resp.status !== 206 || !resp.body) {
              throw new Error(`Expected 206, got ${resp.status}`);
            }

            let offset = start;
            const reader = resp.body.getReader();
            while (true) {
              stallTimer = setTimeout(() => ac.abort(new Error("Range chunk read stall")), 15000);
              const { done, value } = await reader.read();
              clearTimeout(stallTimer);
              if (done) break;
              if (value && value.byteLength > 0) {
                await fh.write(value, 0, value.byteLength, offset);
                offset += value.byteLength;
                totalDownloaded += value.byteLength;
                if (onBytesProgress) onBytesProgress(totalDownloaded, totalSize);
              }
            }
          } finally {
            clearTimeout(stallTimer);
          }
        })
      );
    } finally {
      await fh.close();
    }

    const stat = await fs.promises.stat(tempFilePath);
    if (stat.size !== totalSize) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
      return { success: false };
    }

    return { success: true, sizeBytes: stat.size, fileName, contentType };
  } catch {
    await fs.promises.unlink(tempFilePath).catch(() => {});
    return { success: false };
  }
}

/**
 * Single-stream high-buffer download with 10s first-byte & 15s stall timeout
 * (used for DDLServer-02, DownloadWella, Archive.org, and Pixeldrain fallback).
 */
async function downloadSingleStreamFast(
  directUrl: string,
  tempFilePath: string,
  headers: Record<string, string>,
  fallbackSizeBytes: number = 0,
  onBytesProgress?: (downloadedBytes: number, totalBytes: number) => void
): Promise<{
  success: boolean;
  sizeBytes?: number;
  fileName?: string;
  contentType?: string;
  error?: string;
}> {
  const ac = new AbortController();
  let ttfbTimer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => ac.abort(new Error("Connection timeout (no response in 10s)")),
    10000
  );
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    const resp = await fetch(directUrl, {
      headers,
      redirect: "follow",
      signal: ac.signal,
    });
    if (ttfbTimer) {
      clearTimeout(ttfbTimer);
      ttfbTimer = null;
    }

    if (!resp.ok || !resp.body) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html")) {
      await resp.body.cancel().catch(() => {});
      return { success: false, error: "Returned webpage instead of video stream" };
    }

    const contentLength = Number(resp.headers.get("content-length") || "0");
    if (contentLength > MAX_WHATSAPP_BYTES) {
      await resp.body.cancel().catch(() => {});
      return { success: false, error: `File size (${formatBytesSize(contentLength)}) exceeds WhatsApp's 2 GB limit.` };
    }
    const expectedTotal = contentLength || fallbackSizeBytes || 0;

    let fileName: string | undefined;
    const cd = resp.headers.get("content-disposition");
    if (cd) {
      const fnMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (fnMatch?.[1]) {
        try {
          fileName = decodeURIComponent(fnMatch[1].trim()).replace(/[Â\u00A0]+/g, " ").trim();
        } catch {
          fileName = fnMatch[1].trim();
        }
      }
    }

    // 4 MB write buffer minimizes disk syscalls during high-speed streaming
    const writeStream = fs.createWriteStream(tempFilePath, { highWaterMark: 4 * 1024 * 1024 });
    const nodeReadable = Readable.fromWeb(resp.body as any);
    let downloadedBytes = 0;

    const resetStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        ac.abort(new Error("Stream stalled for 15s"));
        nodeReadable.destroy(new Error("Stream stalled for 15s"));
      }, 15000);
    };

    resetStall();
    await new Promise<void>((resolve, reject) => {
      nodeReadable.on("data", (chunk: Buffer) => {
        resetStall();
        downloadedBytes += chunk.length;
        if (onBytesProgress && expectedTotal > 0) {
          onBytesProgress(downloadedBytes, expectedTotal);
        }
        if (!writeStream.write(chunk)) {
          nodeReadable.pause();
          writeStream.once("drain", () => nodeReadable.resume());
        }
      });
      nodeReadable.once("end", () => {
        if (stallTimer) clearTimeout(stallTimer);
        writeStream.end(() => resolve());
      });
      nodeReadable.once("error", (err) => {
        if (stallTimer) clearTimeout(stallTimer);
        writeStream.destroy();
        reject(err);
      });
      writeStream.once("error", (err) => {
        if (stallTimer) clearTimeout(stallTimer);
        nodeReadable.destroy();
        reject(err);
      });
    });

    const stat = await fs.promises.stat(tempFilePath);
    return { success: true, sizeBytes: stat.size, fileName, contentType };
  } catch (err: any) {
    return { success: false, error: err?.message || "Stream failed" };
  } finally {
    if (ttfbTimer) clearTimeout(ttfbTimer);
    if (stallTimer) clearTimeout(stallTimer);
  }
}

/**
 * Streams a resolved MovieDownloadLink safely to `/tmp` with Pixeldrain multi-range acceleration
 * and fast-failover across mirrors.
 */
export async function downloadMovieFileWithFallback(
  downloads: MovieDownloadLink[],
  movieTitle: string,
  onMirrorAttempt?: (dl: MovieDownloadLink, index: number, total: number) => void | Promise<void>,
  onProgress?: (progress: MovieDownloadProgress) => void
): Promise<DownloadedMovieFile> {
  if (!downloads || downloads.length === 0) {
    return { success: false, error: "No direct download mirrors available." };
  }

  let lastError = "Unable to stream from available mirrors.";

  for (let i = 0; i < downloads.length; i++) {
    const dl = downloads[i];
    if (!dl.directUrl) continue;

    if (dl.sizeBytes && dl.sizeBytes > MAX_WHATSAPP_BYTES) {
      lastError = `${dl.quality} (${formatBytesSize(dl.sizeBytes)}) exceeds WhatsApp's 2 GB limit.`;
      continue;
    }

    if (onMirrorAttempt) {
      try {
        await onMirrorAttempt(dl, i + 1, downloads.length);
      } catch {}
    }

    const fallbackExt = dl.mimeType === "video/x-matroska" || dl.directUrl.toLowerCase().includes(".mkv") ? "mkv" : "mp4";
    const rawFileName = dl.fileName || `${movieTitle.replace(/[^a-zA-Z0-9\s._()-]/g, "").trim().replace(/\s+/g, ".")}.${fallbackExt}`;
    const safeDiskName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tempFilePath = path.join("/tmp", `movie_${Date.now()}_${i}_${safeDiskName}`);

    const headers: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      Accept: "*/*",
    };
    if (dl.referer) headers["Referer"] = dl.referer;

    const emitBytes = (downloadedBytes: number, totalBytes: number) => {
      if (!onProgress || totalBytes <= 0) return;
      const pct = Math.min(99, Math.max(1, Math.round((downloadedBytes / totalBytes) * 100)));
      onProgress({
        percent: pct,
        downloadedBytes,
        totalBytes,
        quality: dl.quality,
        source: dl.source,
      });
    };

    try {
      let streamResult: {
        success: boolean;
        sizeBytes?: number;
        fileName?: string;
        contentType?: string;
        error?: string;
      } | null = null;

      // Pixeldrain gets ~50% faster with 6x concurrent Range requests
      if (dl.host === "Pixeldrain" || /pixeldrain\.com\/api\/file/i.test(dl.directUrl)) {
        const parallelRes = await downloadPixeldrainParallel(dl.directUrl, tempFilePath, headers, emitBytes);
        if (parallelRes.success) {
          streamResult = parallelRes;
        }
      }

      if (!streamResult || !streamResult.success) {
        streamResult = await downloadSingleStreamFast(dl.directUrl, tempFilePath, headers, dl.sizeBytes || 0, emitBytes);
      }

      if (!streamResult.success || !streamResult.sizeBytes) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        lastError = `${dl.source}: ${streamResult.error || "Stream failed"}`;
        continue;
      }

      if (streamResult.sizeBytes < MIN_VALID_MOVIE_BYTES) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        lastError = `Downloaded file from ${dl.source} was too small (${streamResult.sizeBytes} bytes).`;
        continue;
      }

      if (streamResult.sizeBytes > MAX_WHATSAPP_BYTES) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        lastError = `Downloaded movie (${formatBytesSize(streamResult.sizeBytes)}) exceeds WhatsApp's 2 GB limit.`;
        continue;
      }

      const finalFileName = streamResult.fileName || rawFileName;
      const contentType = streamResult.contentType || "";
      const isMkv = finalFileName.toLowerCase().endsWith(".mkv") || contentType.includes("matroska");
      const mimeType = isMkv ? "video/x-matroska" : "video/mp4";

      return {
        success: true,
        filePath: tempFilePath,
        fileName: finalFileName,
        mimeType,
        sizeBytes: streamResult.sizeBytes,
        sizeFormatted: formatBytesSize(streamResult.sizeBytes),
        quality: dl.quality,
        source: dl.source,
        directUrl: dl.directUrl,
      };
    } catch (err: any) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
      lastError = `${dl.source}: ${err?.message || "Stream failed"}`;
      console.warn(`[MovieService] Mirror #${i + 1} failed (${dl.source}):`, err?.message || err);
    }
  }

  return {
    success: false,
    error: lastError,
    directUrl: downloads[0]?.directUrl,
  };
}

/**
 * Searches and downloads real Sinhala (or English fallback) .SRT subtitle files via OpenSubtitles REST API.
 */
async function queryOpenSubtitles(query: string, lang: "sin" | "eng"): Promise<any[]> {
  try {
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}/sublanguageid-${lang}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": OPENSUBTITLES_UA,
        "X-User-Agent": OPENSUBTITLES_UA,
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!resp.ok) return [];
    const data: any = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function searchAndDownloadSubtitle(rawQuery: string): Promise<SubtitleDownloadResult> {
  const input = (rawQuery || "").trim();
  if (!input) {
    return { success: false, error: "Movie name is required." };
  }

  // Optional language flag at the end (e.g. ".sub Deadpool en")
  const wantsEnglish = /\b(en|eng|english)\b$/i.test(input);
  const cleanQuery = input.replace(/\b(en|eng|english|si|sin|sinhala)\b$/i, "").replace(/\s+/g, " ").trim() || input;
  const preferredLang: "sin" | "eng" = wantsEnglish ? "eng" : "sin";

  let usedLang: "sin" | "eng" = preferredLang;
  let isFallbackLang = false;

  let items = await queryOpenSubtitles(cleanQuery, preferredLang);
  if (items.length === 0 && cleanQuery !== normalizeForMatch(cleanQuery)) {
    const simplified = normalizeForMatch(cleanQuery);
    if (simplified) items = await queryOpenSubtitles(simplified, preferredLang);
  }

  if (items.length === 0 && preferredLang === "sin") {
    items = await queryOpenSubtitles(cleanQuery, "eng");
    if (items.length > 0) {
      usedLang = "eng";
      isFallbackLang = true;
    }
  }

  if (items.length === 0) {
    return {
      success: false,
      error: `"${cleanQuery}" සඳහා උපසිරැසි ගොනුවක් හමු නොවීය.`,
    };
  }

  // Rank candidates: exact title match + full-length SRT (> 8 KB) + popular downloads
  const scored = items
    .filter((it) => it?.SubDownloadLink)
    .map((it) => {
      const movieTitle = String(it.MovieName || it.SubFileName || "");
      let score = scoreTitleMatch(movieTitle, cleanQuery);
      const subSize = Number(it.SubSize || 0);
      if (subSize >= 8000) score += 60; // Reject tiny trailer subs when full SRT exists
      else if (subSize > 0 && subSize < 4000) score -= 50;
      if (String(it.SubFormat || "").toLowerCase() === "srt") score += 20;
      const dlCount = Number(it.SubDownloadsCnt || 0);
      score += Math.min(15, Math.floor(dlCount / 500));
      return { it, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      success: false,
      error: `"${cleanQuery}" සඳහා වලංගු .SRT උපසිරැසි ගොනුවක් හමු නොවීය.`,
    };
  }

  for (const candidate of scored.slice(0, 3)) {
    try {
      const subItem = candidate.it;
      const dlResp = await fetch(String(subItem.SubDownloadLink), {
        headers: { "User-Agent": OPENSUBTITLES_UA },
        signal: AbortSignal.timeout(7000),
      });
      if (!dlResp.ok) continue;

      const gzBuffer = Buffer.from(await dlResp.arrayBuffer());
      if (gzBuffer.length < 30) continue;

      let srtBuffer: Buffer;
      try {
        srtBuffer = zlib.gunzipSync(gzBuffer);
      } catch {
        srtBuffer = gzBuffer;
      }

      // Reject invalid/HTML error responses
      const preview = srtBuffer.toString("utf8", 0, Math.min(400, srtBuffer.length));
      if (/<html/i.test(preview) || srtBuffer.length < 60) continue;

      let fileName = String(subItem.SubFileName || `${cleanQuery.replace(/\s+/g, ".")}.srt`).trim();
      fileName = fileName.replace(/[\\/:*?"<>|]/g, "_");
      if (!fileName.toLowerCase().endsWith(".srt")) {
        fileName = `${fileName}.srt`;
      }

      return {
        success: true,
        fileName,
        srtBuffer,
        movieName: String(subItem.MovieName || cleanQuery),
        year: String(subItem.MovieYear || ""),
        language: usedLang === "sin" ? "Sinhala (සිංහල)" : "English",
        languageCode: usedLang,
        isFallbackLang,
        sizeFormatted: formatBytesSize(srtBuffer.length),
      };
    } catch {}
  }

  return {
    success: false,
    error: `"${cleanQuery}" උපසිරැසි ගොනුව බාගත කිරීමට නොහැකි විය.`,
  };
}

export function formatFilmSetCard(set: any, prefix: string = "."): string {
  if (!set) return `❌ Film set details not found.`;
  const setTitle = set.setTitle || "FILM SET";
  const rating = set.rating || "8.0/10 ⭐";
  const years = set.years || "Complete Series";
  const genre = set.genre || "Action, Adventure";
  const parts = Array.isArray(set.parts) ? set.parts : [];
  const totalParts = set.totalParts || parts.length || 1;
  const desc = set.descriptionSinhala || set.descriptionEnglish || "Complete film set collection.";

  let partsList = "";
  parts.forEach((p: any) => {
    const cmdArg = p.directDownload && !String(p.directDownload).startsWith("http") ? p.directDownload : p.title;
    partsList += `│ 🎬 *Part ${p.partNumber || 1}:* ${p.title || "Movie Part"} (${p.year || "Release"})\n│    📥 Download: *${prefix}film ${cmdArg}*\n│\n`;
  });

  return `
╭───「 🎬 *MOVIE SET COLLECTION* 」───╮
│
│ 👑 *SET:* ${String(setTitle).toUpperCase()}
│ ⭐ *Rating:* ${rating} | 📅 *Timeline:* ${years}
│ 🎭 *Genre:* ${genre}
│ 📦 *Total Parts:* ${totalParts} Movies in Set
│
╰───────────────────────────────────╯

📖 *සාරාංශය:*
${desc}

┌───「 🎬 *PARTS TO DOWNLOAD DIRECTLY* 」
│
${partsList}└───────────────────────────────────

💡 *කෙලින්ම WhatsApp වෙත ගෙන්වා ගැනීමට:*
ඉහත ඇති ඕනෑම *${prefix}film <නම>* command එක යවන්න.
`.trim();
}

export function formatMovieCard(movie: any, prefix: string = "."): string {
  if (!movie) return `❌ Movie details not found.`;
  const title = movie.title || "MOVIE TRACK";
  const badge = movie.hasSinhalaSub
    ? "📝 *[SINHALA SUBTITLED • FAST MP4]*"
    : "⚡ *[COMPACT HD • FAST DELIVERY]*";

  const downloads = Array.isArray(movie.downloads) ? movie.downloads : [];
  const primary = downloads[0];
  const primaryInfo = primary
    ? `🎞️ *Selected:* ${primary.quality} (${primary.size || "Direct"})`
    : "🎞️ *Selected:* Direct HD";

  return `
╭───「 🎬 *YASHI HALLS EXPRESS CINEMA* 」───╮
│
│ 🍿 *${String(title).toUpperCase()}*
│ ${badge}
│ 📅 *Year:* ${movie.year || "Latest"}
│ ${primaryInfo}
│
╰──────────────────────────────────────────╯

⚡ *චිත්‍රපටය අධිවේගයෙන් Download කර චැට් එකට එවමින් පවතී...*
💡 *Sinhala Subtitle (.SRT):* *${prefix}sub ${title.replace(/\(\d{4}\)/g, "").trim()}*
`.trim();
}
