/**
 * Zaileys HTML Apps & Interactive Card Helper for Casileys
 * 
 * Based on Zaileys Official Documentation:
 * https://zaileys.kejaa.id/messaging/html-app
 * 
 * Implements Android In-Chat HTML Apps matching reference screenshots:
 * - Cyber Purple & Black theme (#0e0719 / #1e1035 / #581c87 / #c084fc)
 * - Animated rotating neon gear/spark icon
 * - Centered Category Header & "Tap to copy!" subtitle
 * - 2-Column Command Card grid with title, description, and monospace capsule badge
 * - 1-Tap Clipboard Copy with animated toast & visual haptic feedback
 * - bypassDownload: false support for the "Verify security / Download" prompt
 */

import crypto from 'crypto';
import { proto, generateWAMessageFromContent, AIRich } from '@kaels/casileys';
import { EMBEDDED_BRAND_LOGO_BASE64, EMBEDDED_HEADER_BG_BASE64 } from './embeddedLogo';

export interface CommandCardItem {
  name: string;
  desc: string;
  capsule: string;
}

export interface HtmlAppOptions {
  title?: string;
  height?: number;
  quoted?: any;
  bypassDownload?: boolean;
  additionalAttributes?: Record<string, string>;
  cachedPayload?: any;
}

/**
 * HTML Escaping utility
 */
export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface HtmlCardSessionMeta {
  responseId: string;
  botResponseId: string;
  messageSecret: Buffer;
}

const cardSessionMetaMap = new Map<string, HtmlCardSessionMeta>();
const cardEditQueueMap = new Map<string, Promise<boolean>>();

/**
 * Builds the exact Protobuf message payload for WhatsApp Android HTML App card
 */
export function buildHtmlAppPayload(
  markup: string,
  options: {
    title?: string;
    height?: number;
    responseId?: string;
    botResponseId?: string;
    messageSecret?: Buffer;
  } = {}
): proto.IMessage {
  const height = options.height || 980;
  const title = options.title || 'YASHI HALLS MINI';

  const stylePrefix = `<style>
html,body{margin:0;padding:0;height:${height}px;max-height:${height}px;overflow-x:hidden;overflow-y:auto;background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#09090b}
::-webkit-scrollbar-thumb{background:#3f3f46;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#d4af37}
</style>`;

  // Strip DOCTYPE, html, head, body tags if present while strictly preserving internal <style> and <script> contents
  const sanitizedMarkup = markup.trim()
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .trim();

  const cleanPayload = stylePrefix + sanitizedMarkup;
  const responseId = options.responseId || crypto.randomUUID();
  const botResponseId = options.botResponseId || crypto.randomUUID();
  const messageSecret = options.messageSecret || crypto.randomBytes(32);

  const sectionData = {
    __typename: 'GenAIUnifiedResponse',
    response_id: responseId,
    sections: [
      {
        __typename: 'GenAIUnifiedResponseSection',
        view_model: {
          __typename: 'GenAISingleLayoutViewModel',
          primitive: {
            __typename: 'GenAIaeacdsnwHtmlPrimitive',
            payload: cleanPayload,
            trusted_sources: [],
          },
        },
      },
    ],
  };

  const verificationMetadata = typeof (AIRich as any)?.generateVerificationMetadata === 'function'
    ? (AIRich as any).generateVerificationMetadata()
    : {
        proofs: [
          {
            version: 1,
            useCase: 1,
            signature: crypto.randomBytes(64).toString('base64'),
            certificateChain: [
              crypto.randomBytes(684).toString('base64'),
              crypto.randomBytes(892).toString('base64'),
            ],
          },
        ],
      };

  const payload: proto.IMessage = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret,
      botMetadata: {
        messageDisclaimerText: title,
        botResponseId,
        verificationMetadata,
        richResponseSourcesMetadata: {
          sources: [],
        },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1, // GenAI rich response
          submessages: [],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify(sectionData), 'utf-8'),
          },
          originalRecipientMetadata: {
            data: Buffer.from(JSON.stringify(sectionData), 'utf-8'),
          },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: {
              botJid: '867051314767696@bot',
            },
            forwardOrigin: 4,
          },
        },
      },
    },
  };

  return payload;
}

/**
 * Sends an HTML App card via Casileys socket.
 * Executes Protocol 14 (MESSAGE_EDIT) bypass automatically unless bypassDownload is explicitly false,
 * expanding the rendered HTML card UI directly in the WhatsApp Android chat bubble.
 */
export async function sendHtmlApp(
  sock: any,
  jid: string,
  markup: string,
  options: HtmlAppOptions = {}
): Promise<{ success: boolean; messageId: string; error?: string }> {
  if (!sock) {
    throw new Error('Casileys socket is not initialized');
  }

  const userJid = sock.authState?.creds?.me?.id || sock.user?.id || '';
  const height = options.height || 980;
  const title = options.title || 'YASHI HALLS MINI';

  const responseId = crypto.randomUUID();
  const botResponseId = crypto.randomUUID();
  const messageSecret = crypto.randomBytes(32);

  const rawPayload =
    options.cachedPayload ||
    buildHtmlAppPayload(markup, { title, height, responseId, botResponseId, messageSecret });

  try {
    const fullMsg = generateWAMessageFromContent(
      jid,
      rawPayload,
      {
        userJid,
        logger: sock.logger,
      }
    );

    const messageId = fullMsg.key?.id || ('YASHI_' + crypto.randomBytes(8).toString('hex').toUpperCase());

    if (!options.cachedPayload) {
      cardSessionMetaMap.set(messageId, { responseId, botResponseId, messageSecret });
      if (cardSessionMetaMap.size > 400) {
        const oldest = cardSessionMetaMap.keys().next().value;
        if (oldest) cardSessionMetaMap.delete(oldest);
      }
    }

    // 1. Pre-build Protocol 14 unpack message in memory so there's zero processing lag
    let editMsg: any = null;
    if (options.bypassDownload !== false) {
      const editContent = {
        botForwardedMessage: {
          message: {
            protocolMessage: {
              key: {
                remoteJid: jid,
                fromMe: true,
                id: messageId,
              },
              type: 14, // proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
              timestampMs: Date.now(),
              editedMessage: fullMsg.message,
            },
          },
        },
      };

      editMsg = generateWAMessageFromContent(
        jid,
        editContent,
        {
          userJid,
          logger: sock.logger,
        }
      );
    }

    // 2. Relay initial HTML container message
    await sock.relayMessage(jid, fullMsg.message, {
      messageId,
      additionalAttributes: {
        ...(options.additionalAttributes || {}),
      },
    });

    // 3. Wait 25ms & send initial Protocol 14 unpack edit before returning so subsequent live edits never race
    if (editMsg && editMsg.key?.id) {
      await new Promise((r) => setTimeout(r, 25));
      try {
        await sock.relayMessage(jid, editMsg.message, {
          messageId: editMsg.key.id,
        });
      } catch (editErr: any) {
        console.warn('[HTML APP] Protocol 14 bypass edit notice:', editErr?.message || editErr);
      }
    }

    return { success: true, messageId };
  } catch (err: any) {
    console.error('[HTML APP] Failed to relay HTML App:', err?.message || err);
    return { success: false, messageId: '', error: err?.message || String(err) };
  }
}

/**
 * Edits an existing HTML App Card in-place using WhatsApp Protocol 14 (MESSAGE_EDIT),
 * preserving response_id/botResponseId and serializing updates per messageId.
 */
export async function editHtmlApp(
  sock: any,
  jid: string,
  messageId: string,
  markup: string,
  options: { title?: string; height?: number } = {}
): Promise<boolean> {
  if (!sock || !messageId) return false;

  const prevTask = cardEditQueueMap.get(messageId) || Promise.resolve(true);
  const runEdit = prevTask.catch(() => false).then(async () => {
    const userJid = sock.authState?.creds?.me?.id || sock.user?.id || '';
    const height = options.height || 360;
    const title = options.title || 'YASHI HALLS MEDIA';
    const meta = cardSessionMetaMap.get(messageId);

    try {
      const rawPayload = buildHtmlAppPayload(markup, {
        title,
        height,
        responseId: meta?.responseId,
        botResponseId: meta?.botResponseId,
        messageSecret: meta?.messageSecret,
      });
      const fullMsg = generateWAMessageFromContent(jid, rawPayload, { userJid, logger: sock.logger });

      const editContent = {
        botForwardedMessage: {
          message: {
            protocolMessage: {
              key: {
                remoteJid: jid,
                fromMe: true,
                id: messageId,
              },
              type: 14, // proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
              timestampMs: Date.now(),
              editedMessage: fullMsg.message,
            },
          },
        },
      };

      const editMsg = generateWAMessageFromContent(jid, editContent, { userJid, logger: sock.logger });
      if (editMsg.key?.id) {
        await sock.relayMessage(jid, editMsg.message, {
          messageId: editMsg.key.id,
        });
        return true;
      }
    } catch (err: any) {
      console.warn('[EDIT HTML APP] Protocol 14 edit notice:', err?.message || err);
    }
    return false;
  });

  cardEditQueueMap.set(messageId, runEdit);
  if (cardEditQueueMap.size > 400) {
    const oldest = cardEditQueueMap.keys().next().value;
    if (oldest) cardEditQueueMap.delete(oldest);
  }
  return runEdit;
}

export interface DownloadStatusOptions {
  botName?: string;
  type?: 'AUDIO' | 'VIDEO' | 'FILE' | string;
  query: string;
  title?: string;
  status: 'SEARCHING' | 'DOWNLOADING' | 'SUCCESS' | 'ERROR';
  progress?: number;
  duration?: string;
  bitrate?: string;
  quality?: string;
  fileSize?: string;
  errorMessage?: string;
  prefix?: string;
  height?: number;
}

export function generateDownloadStatusHtml(options: DownloadStatusOptions): string {
  const height = options.height || 280;
  const botName = (options.botName || 'YASHI HALLS').toUpperCase();
  const query = escapeHtml(options.query || 'Media');
  const title = escapeHtml(options.title || options.query || 'Media Track');
  const status = options.status || 'SEARCHING';
  const rawType = (options.type || 'MEDIA').toUpperCase();
  const type = rawType;
  const pct = Math.min(100, Math.max(0, options.progress ?? (status === 'SEARCHING' ? 30 : status === 'DOWNLOADING' ? 75 : 100)));

  let icon = '📥';
  if (type.includes('TIKTOK')) icon = '🎵';
  else if (type.includes('FACEBOOK') || type.includes('FB')) icon = '📘';
  else if (type.includes('INSTAGRAM') || type.includes('IG')) icon = '📸';
  else if (type.includes('TWITTER') || type.includes(' X')) icon = '🐦';
  else if (type.includes('MEDIAFIRE') || type.includes('MF')) icon = '📁';
  else if (type.includes('APK') || type.includes('APP')) icon = '📱';
  else if (type.includes('VIDEO')) icon = '🎬';
  else if (type.includes('AUDIO') || type.includes('SONG') || type.includes('MUSIC')) icon = '🎵';

  const circumference = 213.6;
  const strokeOffset = (circumference - (circumference * pct / 100)).toFixed(1);

  let statusBadge = '';
  let badgeStyle = '';
  let themeColor = '#06b6d4';
  let hudGlow = 'rgba(6, 182, 212, 0.4)';
  let gradId = 'ringGrad';

  if (status === 'SEARCHING') {
    statusBadge = 'SCANNING // FREQ';
    badgeStyle = 'border-color: rgba(234, 179, 8, 0.5); color: #fde047; background: rgba(234, 179, 8, 0.12);';
    themeColor = '#eab308';
    hudGlow = 'rgba(234, 179, 8, 0.35)';
  } else if (status === 'DOWNLOADING') {
    statusBadge = `SYNCING // ${pct}%`;
    badgeStyle = 'border-color: rgba(6, 182, 212, 0.5); color: #38bdf8; background: rgba(6, 182, 212, 0.12);';
    themeColor = '#06b6d4';
    hudGlow = 'rgba(6, 182, 212, 0.4)';
  } else if (status === 'SUCCESS') {
    statusBadge = 'LOCKED // READY';
    badgeStyle = 'border-color: rgba(16, 185, 129, 0.5); color: #34d399; background: rgba(16, 185, 129, 0.15);';
    themeColor = '#10b981';
    hudGlow = 'rgba(16, 185, 129, 0.35)';
    gradId = 'ringSuccess';
  } else {
    statusBadge = 'ABORT // ERROR';
    badgeStyle = 'border-color: rgba(239, 68, 68, 0.5); color: #f87171; background: rgba(239, 68, 68, 0.15);';
    themeColor = '#ef4444';
    hudGlow = 'rgba(239, 68, 68, 0.35)';
  }

  return `
<style>
  @keyframes hudSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes hudPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; filter: drop-shadow(0 0 6px ${themeColor}); } }
  @keyframes freqWave { 0%, 100% { height: 4px; } 50% { height: 18px; } }

  .hud-card {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: #050711;
    background-image: 
      linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px);
    background-size: 16px 16px;
    color: #ffffff;
    padding: 14px 14px 12px 14px;
    border: 1px solid rgba(6, 182, 212, 0.3);
    border-radius: 14px;
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, monospace, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 16px rgba(6, 182, 212, 0.04);
  }

  .bracket {
    position: absolute;
    width: 8px;
    height: 8px;
    border-color: ${themeColor};
    pointer-events: none;
  }
  .bracket.tl { top: 4px; left: 4px; border-top: 2px solid ${themeColor}; border-left: 2px solid ${themeColor}; }
  .bracket.tr { top: 4px; right: 4px; border-top: 2px solid ${themeColor}; border-right: 2px solid ${themeColor}; }
  .bracket.bl { bottom: 4px; left: 4px; border-bottom: 2px solid ${themeColor}; border-left: 2px solid ${themeColor}; }
  .bracket.br { bottom: 4px; right: 4px; border-bottom: 2px solid ${themeColor}; border-right: 2px solid ${themeColor}; }

  .hud-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(6, 182, 212, 0.15);
  }
  .hud-id {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #67e8f9;
  }
  .hud-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${themeColor};
    animation: hudPulse 1.5s ease-in-out infinite;
  }
  .hud-pill {
    font-size: 9px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.8px;
    border: 1px solid;
    ${badgeStyle}
  }

  .hud-mid {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 2px;
  }
  .ring-wrap {
    position: relative;
    width: 76px;
    height: 76px;
    flex-shrink: 0;
  }
  .ring-svg {
    width: 76px;
    height: 76px;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.08);
    stroke-width: 5;
  }
  .ring-bar {
    fill: none;
    stroke: url(#${gradId});
    stroke-width: 5;
    stroke-linecap: round;
    stroke-dasharray: 213.6;
    transition: stroke-dashoffset 0.4s ease;
    filter: drop-shadow(0 0 5px ${hudGlow});
  }
  .ring-core {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
  .core-pct {
    font-size: 14px;
    font-weight: 900;
    color: #e0f2fe;
    letter-spacing: -0.5px;
  }
  .core-check {
    font-size: 24px;
    font-weight: 900;
    color: #34d399;
    filter: drop-shadow(0 0 8px #10b981);
  }

  .hud-details {
    flex: 1;
    min-width: 0;
  }
  .hud-title {
    font-size: 14px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.2px;
    margin-bottom: 2px;
  }
  .hud-query {
    font-size: 10px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.4px;
    margin-bottom: 6px;
  }

  .hud-stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .stat-box {
    background: rgba(6, 182, 212, 0.06);
    border: 1px solid rgba(6, 182, 212, 0.25);
    border-radius: 4px;
    padding: 3px 6px;
    display: flex;
    flex-direction: column;
    min-width: 52px;
  }
  .stat-lbl {
    font-size: 8px;
    color: #67e8f9;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .stat-val {
    font-size: 10px;
    color: #ffffff;
    font-weight: 800;
  }

  .hud-freq-wrap {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 20px;
    margin-top: 6px;
  }
  .freq-bar {
    width: 3px;
    background: linear-gradient(180deg, #38bdf8, #a855f7);
    border-radius: 2px;
    animation: freqWave 0.8s ease-in-out infinite;
  }
  .freq-bar:nth-child(2) { animation-delay: 0.1s; }
  .freq-bar:nth-child(3) { animation-delay: 0.2s; }
  .freq-bar:nth-child(4) { animation-delay: 0.3s; }
  .freq-bar:nth-child(5) { animation-delay: 0.4s; }
  .freq-bar:nth-child(6) { animation-delay: 0.5s; }
  .freq-bar:nth-child(7) { animation-delay: 0.6s; }
  .freq-bar:nth-child(8) { animation-delay: 0.7s; }

  .hud-bot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #64748b;
    border-top: 1px solid rgba(6, 182, 212, 0.12);
    padding-top: 6px;
    letter-spacing: 0.5px;
  }
  .hud-brand {
    color: #06b6d4;
    font-weight: 800;
  }
</style>

<div class="hud-card">
  <div class="bracket tl"></div>
  <div class="bracket tr"></div>
  <div class="bracket bl"></div>
  <div class="bracket br"></div>

  <div class="hud-top">
    <div class="hud-id">
      <span class="hud-dot"></span>
      <span>${botName} // ${type} HUD</span>
    </div>
    <div class="hud-pill">${statusBadge}</div>
  </div>

  <div class="hud-mid">
    <div class="ring-wrap">
      <svg class="ring-svg" viewBox="0 0 88 88">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#c084fc" />
          </linearGradient>
          <linearGradient id="ringSuccess" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#34d399" />
          </linearGradient>
        </defs>
        <circle class="ring-bg" cx="44" cy="44" r="34" />
        <circle class="ring-bar" cx="44" cy="44" r="34" style="stroke-dashoffset: ${strokeOffset};" />
      </svg>
      <div class="ring-core">
        ${status === 'SUCCESS' ? '<span class="core-check">✓</span>' : `<span class="core-pct">${pct}%</span>`}
      </div>
    </div>

    <div class="hud-details">
      <div class="hud-title">${icon} ${title}</div>
      <div class="hud-query">${status === 'SUCCESS' ? 'DOWNLOAD & SYNC COMPLETE' : query}</div>

      ${status === 'SUCCESS' ? `
      <div class="hud-stats">
        <div class="stat-box"><span class="stat-lbl">DURATION</span><span class="stat-val">${escapeHtml(options.duration || "03:45")}</span></div>
        <div class="stat-box"><span class="stat-lbl">BITRATE</span><span class="stat-val">${escapeHtml(options.bitrate || options.quality || "320 KBPS")}</span></div>
        <div class="stat-box"><span class="stat-lbl">SIZE</span><span class="stat-val">${escapeHtml(options.fileSize || "DIRECT")}</span></div>
      </div>
      ` : `
      <div class="hud-freq-wrap">
        <span class="freq-bar" style="height: 6px;"></span>
        <span class="freq-bar" style="height: 14px;"></span>
        <span class="freq-bar" style="height: 10px;"></span>
        <span class="freq-bar" style="height: 18px;"></span>
        <span class="freq-bar" style="height: 12px;"></span>
        <span class="freq-bar" style="height: 16px;"></span>
        <span class="freq-bar" style="height: 8px;"></span>
        <span class="freq-bar" style="height: 14px;"></span>
      </div>
      `}

      ${status === 'ERROR' ? `
      <div style="font-size: 10px; color: #f87171; margin-top: 4px;">
        ABORT // ${escapeHtml(options.errorMessage || "STREAM EXTRACTION FAILED")}
      </div>
      ` : ''}
    </div>
  </div>

  <div class="hud-bot">
    <span>SYSTEM // ${status === 'SUCCESS' ? 'DEPLOYING DIRECT TO CHAT' : 'SYNCING QUANTUM STREAM...'}</span>
    <span class="hud-brand">CYBER HUD v2.5 ⚡</span>
  </div>
</div>
`;
}

export interface PingCardOptions {
  botName?: string;
  latencyMs?: number | string;
  speed?: string;
  uptime?: string;
  plan?: string;
  prefix?: string;
  serverRegion?: string;
  height?: number;
}

/**
 * Compact Cyberpunk HUD Speed/Ping Card for .ping command
 */
export function generatePingCardHtml(options: PingCardOptions = {}): string {
  const height = options.height || 200;
  const botName = (options.botName || 'YASHI HALLS').toUpperCase();
  const latency = options.latencyMs !== undefined ? `${options.latencyMs}ms` : '0ms';
  const speed = options.speed || '0.000s';
  const uptime = options.uptime || '24h 00m';
  const plan = (options.plan || 'PRO').toUpperCase();
  const prefix = options.prefix || '.';
  const serverRegion = options.serverRegion || 'ASIA-SOUTH1';

  return `
<style>
  @keyframes hudPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; filter: drop-shadow(0 0 6px #10b981); } }
  @keyframes glowBreath { 0%, 100% { filter: drop-shadow(0 0 3px rgba(16,185,129,0.4)); } 50% { filter: drop-shadow(0 0 8px rgba(16,185,129,0.9)); } }
  @keyframes radarSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

  .ping-card {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: #050711;
    background-image: 
      linear-gradient(rgba(16, 185, 129, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16, 185, 129, 0.05) 1px, transparent 1px);
    background-size: 14px 14px;
    color: #ffffff;
    padding: 12px 14px 10px 14px;
    border: 1px solid rgba(16, 185, 129, 0.35);
    border-radius: 14px;
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, monospace, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 16px rgba(16, 185, 129, 0.05);
    user-select: none;
    -webkit-user-select: none;
  }

  .ping-bracket {
    position: absolute;
    width: 8px;
    height: 8px;
    border-color: #10b981;
    pointer-events: none;
  }
  .ping-bracket.tl { top: 4px; left: 4px; border-top: 2px solid #10b981; border-left: 2px solid #10b981; }
  .ping-bracket.tr { top: 4px; right: 4px; border-top: 2px solid #10b981; border-right: 2px solid #10b981; }
  .ping-bracket.bl { bottom: 4px; left: 4px; border-bottom: 2px solid #10b981; border-left: 2px solid #10b981; }
  .ping-bracket.br { bottom: 4px; right: 4px; border-bottom: 2px solid #10b981; border-right: 2px solid #10b981; }

  .ping-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(16, 185, 129, 0.2);
  }
  .ping-id {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.8px;
    color: #6ee7b7;
  }
  .ping-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    animation: hudPulse 1.5s ease-in-out infinite;
  }
  .ping-pill {
    font-size: 9px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    letter-spacing: 0.8px;
    border: 1px solid rgba(16, 185, 129, 0.5);
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .ping-mid {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }
  .ping-radar-wrap {
    position: relative;
    width: 60px;
    height: 60px;
    flex-shrink: 0;
  }
  .ping-radar-svg {
    width: 60px;
    height: 60px;
    transform: rotate(-90deg);
  }
  .ping-radar-core {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .radar-icon {
    font-size: 15px;
    line-height: 1;
    animation: glowBreath 1.5s ease-in-out infinite;
  }
  .radar-ms {
    font-size: 10px;
    font-weight: 900;
    color: #34d399;
    letter-spacing: -0.3px;
    margin-top: 2px;
  }

  .ping-stats-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
    min-width: 0;
  }
  .p-stat-box {
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: 6px;
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .p-stat-lbl {
    font-size: 8px;
    color: #6ee7b7;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .p-stat-val {
    font-size: 11px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ping-meta-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 9px;
    color: #94a3b8;
  }
  .meta-tag {
    color: #67e8f9;
    font-weight: 700;
  }

  .ping-bot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #64748b;
    border-top: 1px solid rgba(16, 185, 129, 0.15);
    padding-top: 5px;
    letter-spacing: 0.5px;
  }
  .ping-brand {
    color: #10b981;
    font-weight: 800;
  }
</style>

<div class="ping-card">
  <div class="ping-bracket tl"></div>
  <div class="ping-bracket tr"></div>
  <div class="ping-bracket bl"></div>
  <div class="ping-bracket br"></div>

  <div class="ping-top">
    <div class="ping-id">
      <span class="ping-dot"></span>
      <span>${escapeHtml(botName)} // SPEED HUD</span>
    </div>
    <div class="ping-pill">ONLINE 24/7</div>
  </div>

  <div class="ping-mid">
    <div class="ping-radar-wrap">
      <svg class="ping-radar-svg" viewBox="0 0 68 68">
        <defs>
          <linearGradient id="pingRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="34" cy="34" r="28" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="4" />
        <circle cx="34" cy="34" r="28" fill="none" stroke="url(#pingRingGrad)" stroke-width="4" stroke-dasharray="175.9" stroke-dashoffset="35" stroke-linecap="round" style="filter: drop-shadow(0 0 4px rgba(16,185,129,0.5));" />
      </svg>
      <div class="ping-radar-core">
        <span class="radar-icon">⚡</span>
        <span class="radar-ms">${escapeHtml(latency)}</span>
      </div>
    </div>

    <div class="ping-stats-grid">
      <div class="p-stat-box">
        <span class="p-stat-lbl">LATENCY</span>
        <span class="p-stat-val">${escapeHtml(speed)}</span>
      </div>
      <div class="p-stat-box">
        <span class="p-stat-lbl">UPTIME</span>
        <span class="p-stat-val">${escapeHtml(uptime)}</span>
      </div>
      <div class="p-stat-box">
        <span class="p-stat-lbl">ENGINE</span>
        <span class="p-stat-val">${escapeHtml(plan)}</span>
      </div>
    </div>
  </div>

  <div class="ping-meta-strip">
    <span>RESPONSE: <strong class="meta-tag">ULTRA FAST ⚡</strong></span>
    <span>SERVER: <strong class="meta-tag">${escapeHtml(serverRegion)}</strong></span>
  </div>

  <div class="ping-bot">
    <span>SYSTEM // YASHI HALLS</span>
    <span class="ping-brand">OPTIMAL ✓</span>
  </div>
</div>
`;
}

/**
 * 60 Text Tools catalog exactly as seen in reference screenshots
 */
export const TEXT_TOOLS_CATALOG: CommandCardItem[] = [
  { name: 'UPPERTEXT', desc: 'Transform or analyze t..', capsule: '.uppertext' },
  { name: 'LOWERTEXT', desc: 'Transform or analyze t..', capsule: '.lowertext' },
  { name: 'TITLETEXT', desc: 'Transform or analyze t..', capsule: '.titletext' },
  { name: 'REVERSEWORDS', desc: 'Transform or analyze t..', capsule: '.reversewords' },
  { name: 'REVERSECHARS', desc: 'Transform or analyze t..', capsule: '.reversechars' },
  { name: 'TRIMTEXT', desc: 'Transform or analyze t..', capsule: '.trimtext' },
  { name: 'COUNTLETTERS', desc: 'Transform or analyze t..', capsule: '.countletters' },
  { name: 'COUNTWORDS', desc: 'Transform or analyze t..', capsule: '.countwords' },
  { name: 'COUNTLINES', desc: 'Transform or analyze t..', capsule: '.countlines' },
  { name: 'REMOVESPACES', desc: 'Delete every space fro..', capsule: '.removespaces' },
  { name: 'JSONMINIFY', desc: 'Format or organize tex..', capsule: '.jsonminify' },
  { name: 'SLUGIFY', desc: 'Convert text to kebab-..', capsule: '.slugify' },
  { name: 'CAMELCASE', desc: 'Convert text to camelCase', capsule: '.camelcase' },
  { name: 'KEBABCASE', desc: 'Convert text to kebab-..', capsule: '.kebabcase' },
  { name: 'SNAKECASE', desc: 'Convert text to snake_..', capsule: '.snakecase' },
  { name: 'HASHTAG', desc: 'Format or organize tex..', capsule: '.hashtag' },
  { name: 'INITIALS', desc: 'Build an acronym from ..', capsule: '.initials' },
  { name: 'WORDSHUFFLE', desc: 'Format or organize tex..', capsule: '.wordshuffle' },
  { name: 'SORTWORDS', desc: 'Format or organize tex..', capsule: '.sortwords' },
  { name: 'TITLECASE', desc: 'Capitalise The First L..', capsule: '.titlecase' },
  { name: 'SENTENCECASE', desc: 'Fix capitalisation sen..', capsule: '.sentencecase' },
  { name: 'TOGGLECASE', desc: 'Swap upper and lower case', capsule: '.togglecase' },
  { name: 'RANDOMCASE', desc: 'rAnDoM mOcKiNg CaSe', capsule: '.randomcase' },
  { name: 'PASCALCASE', desc: 'Convert text to Pascal..', capsule: '.pascalcase' },
  { name: 'CONSTCASE', desc: 'Convert text to CONSTA..', capsule: '.constcase' },
  { name: 'SORTLINES', desc: 'Sort every line alphab..', capsule: '.sortlines' },
  { name: 'DEDUPE', desc: 'Remove duplicate lines', capsule: '.dedupe' },
  { name: 'SHUFFLELINES', desc: 'Randomly shuffle the l..', capsule: '.shufflelines' },
  { name: 'NUMBERLINES', desc: 'Add a number to every ..', capsule: '.numberlines' },
  { name: 'REVERSELINE', desc: 'Reverse the order of t..', capsule: '.reverselines' },
  { name: 'CLEANTEXT', desc: 'Strip extra spaces and..', capsule: '.cleantext' },
  { name: 'SPACEOUT', desc: 'P u t  s p a c e  b..', capsule: '.spaceout' },
  { name: 'WRAPTEXT', desc: 'Wrap text at a given l..', capsule: '.wraptext' },
  { name: 'REPEAT', desc: 'Repeat text N times', capsule: '.repeat' },
  { name: 'EXTRACTURLS', desc: 'Pull every link out of..', capsule: '.extracturls' },
  { name: 'EXTRACTEMAILS', desc: 'Pull every e-mail addr..', capsule: '.extractemails' },
  { name: 'EXTRACTNUMBERS', desc: 'Pull every number out ..', capsule: '.extractnumbers' },
  { name: 'FINDREPLACE', desc: 'Find and replace insid..', capsule: '.findreplace' },
  { name: 'GREP', desc: 'Keep only the lines co..', capsule: '.grep' },
  { name: 'WORDFREQ', desc: 'Most frequently used w..', capsule: '.wordfreq' },
  { name: 'CHARFREQ', desc: 'Most frequently used l..', capsule: '.charfreq' },
  { name: 'READTIME', desc: 'Estimate how long a te..', capsule: '.readtime' },
  { name: 'PALINDROME', desc: 'Check whether a text i..', capsule: '.palindrome' },
  { name: 'ANAGRAM', desc: 'Check if two words are..', capsule: '.anagram' },
  { name: 'ACRONYM', desc: 'Build an acronym from ..', capsule: '.acronym' },
  { name: 'VOWELS', desc: 'Count vowels and conso..', capsule: '.vowels' },
  { name: 'ROT13', desc: 'Encode or decode ROT13', capsule: '.rot13' },
  { name: 'CAESAR', desc: 'Caesar cipher with a c..', capsule: '.caesar' },
  { name: 'ATBASH', desc: 'Atbash cipher (a<->z m..', capsule: '.atbash' },
  { name: 'LEETSPEAK', desc: 'Convert text to l33t s..', capsule: '.leetspeak' },
  { name: 'UPSIDEDOWN', desc: 'Flip text upside down', capsule: '.upsidedown' },
  { name: 'BUBBLETEXT', desc: 'Ⓑⓤⓑⓑⓛⓔ ⓣⓔⓧⓣ', capsule: '.bubbletext' },
  { name: 'SQUARETEXT', desc: '🅂🅀🅄🄰🅁🄴 🅃🄴🅇🅃', capsule: '.squaretext' },
  { name: 'FULLWIDTH', desc: 'ｆｕｌｌｗｉｄｔｈ', capsule: '.fullwidth' },
  { name: 'STRIKETHROUGH', desc: 'Cross out t..', capsule: '.strikethrough' },
  { name: 'UNDERLINETEXT', desc: 'Underline t..', capsule: '.underlinetext' },
  { name: 'ZALGO', desc: 'C̴u̴r̴s̴e̴d̴ glitch text', capsule: '.zalgo' },
  { name: 'CLAP', desc: 'Put 👏 between 👏 ever..', capsule: '.clap' },
  { name: 'EMOJIFY', desc: 'Turn text into emoji l..', capsule: '.emojify' },
  { name: 'LOREM', desc: 'Generate placeholder l..', capsule: '.lorem' },
];

/**
 * Downloads category catalog - 12 High Quality Commands
 */
export const DOWNLOADS_CATALOG: CommandCardItem[] = [
  { name: '📁 MEDIAFIRE', desc: 'Direct high-speed zip/rar download', capsule: '.mediafire' },
  { name: '🎵 TIKTOK HD', desc: 'Watermark-free full HD video', capsule: '.tiktok' },
  { name: '📘 FACEBOOK', desc: 'Full HD 1080p video downloader', capsule: '.fb' },
  { name: '📸 INSTAGRAM', desc: 'Reels, stories & carousel photos', capsule: '.ig' },
  { name: '🎧 YOUTUBE MP3', desc: 'Crystal clear 320kbps audio song', capsule: '.song' },
  { name: '🎬 YOUTUBE MP4', desc: 'High definition 1080p MP4 video', capsule: '.video' },
  { name: '🐦 TWITTER / X', desc: 'Direct HD video & animated GIF', capsule: '.twitter' },
  { name: '☁️ GOOGLE DRIVE', desc: 'Direct high-speed GDrive downloader', capsule: '.gdrive' },
  { name: '📱 APK DOWNLOAD', desc: 'Android pure APK package install', capsule: '.apk' },
  { name: '📌 PINTEREST', desc: 'High-resolution photo & board download', capsule: '.pinterest' },
  { name: '🟢 SPOTIFY TRACK', desc: 'Direct high quality Spotify music', capsule: '.spotify' },
  { name: '☁️ SOUNDCLOUD', desc: 'Direct high-bitrate audio stream', capsule: '.soundcloud' },
];

/**
 * AI tools category catalog - 10 Smart AI Tools
 */
export const AI_CATALOG: CommandCardItem[] = [
  { name: '🤖 GEMINI PRO', desc: 'Google Gemini 2.5 Flash / Pro AI', capsule: '.ai' },
  { name: '💬 SMART CHAT', desc: 'Multi-turn conversational smart AI', capsule: '.gemini' },
  { name: '❓ ASK QUESTION', desc: 'Instant factual answers & logic', capsule: '.ask' },
  { name: '💻 CODE WRITER', desc: 'Full-stack code generator & bug fixer', capsule: '.code' },
  { name: '📝 AI SUMMARIZE', desc: 'Bullet-point instant summary', capsule: '.summarize' },
  { name: '🌐 TRANSLATOR', desc: 'Sinhala, Tamil & 100+ languages', capsule: '.tr' },
  { name: '🎨 IMAGINE AI', desc: 'Photorealistic AI image generator', capsule: '.imagine' },
  { name: '✍️ GRAMMAR FIX', desc: 'Syntax check & professional phrasing', capsule: '.grammar' },
  { name: '📄 ESSAY WRITER', desc: 'Academic essays, speeches & letters', capsule: '.essay' },
  { name: '🎙️ AUDIO TO TEXT', desc: 'Voice note speech transcription', capsule: '.transcribe' },
];

/**
 * Movies category catalog - 2 Direct Film & Sinhala Subtitle Commands
 */
export const MOVIES_CATALOG: CommandCardItem[] = [
  { name: '🎬 FILM DOWNLOAD', desc: 'Download full movies directly to WhatsApp', capsule: '.film' },
  { name: '📝 SINHALA SUBTITLE', desc: 'Direct Sinhala .SRT subtitle file to WhatsApp', capsule: '.sub' },
];

/**
 * Music category catalog - 10 Audio & Music Tools
 */
export const MUSIC_CATALOG: CommandCardItem[] = [
  { name: '🎵 SONG MP3', desc: 'Ultra HQ 320kbps MP3 audio download', capsule: '.song' },
  { name: '▶️ PLAY VIDEO', desc: 'Instant YouTube music video download', capsule: '.play' },
  { name: '🔊 DIRECT AUDIO', desc: 'WhatsApp voice note audio format', capsule: '.audio' },
  { name: '🟢 SPOTIFY MUSIC', desc: 'Direct track & album download', capsule: '.spotify' },
  { name: '🔍 SHAZAM SONG', desc: 'Identify song from short audio sample', capsule: '.shazam' },
  { name: '📜 SONG LYRICS', desc: 'Complete verified lyrics with chords', capsule: '.lyrics' },
  { name: '🎧 8D BASS BOOST', desc: '8D surround sound bass-boosted audio', capsule: '.bass' },
  { name: '📈 TOP TRACKS', desc: 'Sri Lanka & Global trending hit tracks', capsule: '.toptracks' },
  { name: '🌙 SLOWED+REVERB', desc: 'Aesthetic chill remix audio stream', capsule: '.slowed' },
  { name: '🔔 RINGTONE', desc: 'Catchy 30-sec ringtone cut from song', capsule: '.ringtone' },
];

/**
 * Group tools category catalog - 14 Group Admin Tools
 */
export const GROUPS_CATALOG: CommandCardItem[] = [
  { name: '📢 TAG ALL', desc: 'Mention all group participants in 1-tap', capsule: '.tagall' },
  { name: '👻 GHOST TAG', desc: 'Invisible broadcast mention to all', capsule: '.hidetag' },
  { name: '⛔ KICK USER', desc: 'Remove participant from group chat', capsule: '.kick' },
  { name: '➕ ADD USER', desc: 'Add phone number directly to group', capsule: '.add' },
  { name: '⭐ PROMOTE ADMIN', desc: 'Make participant a group administrator', capsule: '.promote' },
  { name: '⬇️ DEMOTE ADMIN', desc: 'Revoke group administrator status', capsule: '.demote' },
  { name: '🚨 ANTI-DELETE', desc: 'Monitor & recover deleted messages', capsule: '.antidelete' },
  { name: '👁️ ANTI VIEW-ONCE', desc: 'Capture 1-time view photos & videos', capsule: '.antiviewonce' },
  { name: '👋 WELCOME BANNER', desc: 'Custom welcome message on join', capsule: '.welcome' },
  { name: '🚪 GOODBYE BANNER', desc: 'Farewell alert when members leave', capsule: '.goodbye' },
  { name: '🛡️ ANTI BAD WORDS', desc: 'Filter toxic insults & auto-warn', capsule: '.antibadword' },
  { name: '🤖 AI CHATBOT', desc: 'Gemini automated group conversation', capsule: '.chatbot' },
  { name: '🔗 INVITE LINK', desc: 'Fetch current group invitation link', capsule: '.link' },
  { name: '🔄 REVOKE LINK', desc: 'Reset & invalidate old invite link', capsule: '.revoke' },
  { name: '🔇 MUTE GROUP', desc: 'Admins-only messaging mode', capsule: '.mute' },
  { name: '🔊 UNMUTE GROUP', desc: 'All participants can send messages', capsule: '.unmute' },
  { name: '⚠️ WARN USER', desc: 'Issue official strike to member', capsule: '.warn' },
  { name: '🛡️ ANTI-LINK', desc: 'Auto-kick spam links & link sharers', capsule: '.antilink' },
];

/**
 * Games category catalog - 10 Games & Fun Tools
 */
export const GAMES_CATALOG: CommandCardItem[] = [
  { name: '⭕ TIC TAC TOE', desc: 'Interactive 2-player grid game in chat', capsule: '.tictactoe' },
  { name: '🧠 TRIVIA QUIZ', desc: 'Multiple-choice general knowledge quiz', capsule: '.quiz' },
  { name: '🎰 SLOT MACHINE', desc: 'Casino lucky 777 jackpot spinner', capsule: '.slot' },
  { name: '🎲 ROLL DICE', desc: 'Random 6-sided dice roll with odds', capsule: '.roll' },
  { name: '🪙 FLIP COIN', desc: 'Heads or Tails coin toss generator', capsule: '.flip' },
  { name: '😂 DAD JOKE', desc: 'Hilarious clean joke of the day', capsule: '.joke' },
  { name: '💡 FUN FACT', desc: 'Mind-blowing real science & world facts', capsule: '.fact' },
  { name: '❤️ LOVE TESTER', desc: 'Calculate compatibility score %', capsule: '.lovecalc' },
  { name: '🔮 MAGIC 8-BALL', desc: 'Ask a question for mystical fortunes', capsule: '.8ball' },
  { name: '🔥 ROAST USER', desc: 'Savage & hilarious roast generator', capsule: '.roast' },
];

/**
 * Utilities & Converters category catalog - 10 Tools
 */
export const UTILITIES_CATALOG: CommandCardItem[] = [
  { name: '🔢 MATH CALC', desc: 'Instant arithmetic, algebra & formulas', capsule: '.calc' },
  { name: '📊 PERCENTAGE', desc: 'Calculate discount, markup & %', capsule: '.percent' },
  { name: '⚖️ BMI CALCULATE', desc: 'Body Mass Index & fitness category', capsule: '.bmi' },
  { name: '💱 CURRENCY FX', desc: 'Real-time USD, LKR, EUR forex rates', capsule: '.currency' },
  { name: '🌡️ TEMP CONVERT', desc: 'Celsius to Fahrenheit converter', capsule: '.c2f' },
  { name: '📏 KM TO MILES', desc: 'Distance unit converter (km/miles)', capsule: '.km2miles' },
  { name: '🏋️ KG TO LBS', desc: 'Mass converter (kg/pounds)', capsule: '.kg2lbs' },
  { name: '💾 DATA SIZE', desc: 'Storage converter (MB <-> GB <-> TB)', capsule: '.mb2gb' },
  { name: '🔐 PASS GENERATOR', desc: 'Generate military-grade strong password', capsule: '.passgen' },
  { name: '🆔 UUID V4', desc: 'Generate cryptographic UUID token', capsule: '.uuid' },
];

/**
 * Search category catalog - 8 Search Tools
 */
export const SEARCH_CATALOG: CommandCardItem[] = [
  { name: '📖 DICTIONARY', desc: 'English word meanings & definitions', capsule: '.define' },
  { name: '🛹 URBAN SLANG', desc: 'Modern street slang & memes dictionary', capsule: '.urban' },
  { name: '🌐 IP LOOKUP', desc: 'IP address geolocation & ISP info', capsule: '.ipinfo' },
  { name: '🥇 GOLD RATES', desc: 'Sri Lanka 22k & 24k gold gram prices', capsule: '.gold' },
  { name: '⛅ WEATHER', desc: 'Current temperature, humidity & rain', capsule: '.weather' },
  { name: '📚 WIKIPEDIA', desc: 'Encyclopedia summary of any topic', capsule: '.wiki' },
  { name: '🔍 GOOGLE SEARCH', desc: 'Top search result links & snippets', capsule: '.google' },
  { name: '🪙 CRYPTO RATES', desc: 'Bitcoin, Ethereum & USDT real-time', capsule: '.crypto' },
];

/**
 * System tools category catalog - 8 System Tools
 */
export const SYSTEM_CATALOG: CommandCardItem[] = [
  { name: '⚡ SPEED PING', desc: 'Measure server response speed latency', capsule: '.ping' },
  { name: '🟢 ALIVE STATUS', desc: 'Bot uptime, RAM usage & status report', capsule: '.alive' },
  { name: '🤖 BOT DETAILS', desc: 'Engine versions, platform & system info', capsule: '.botinfo' },
  { name: '⏱️ UPTIME STATS', desc: 'Continuous 24/7 uptime counter', capsule: '.uptime' },
  { name: '🩺 HEALTH CHECK', desc: 'Real-time node health & socket check', capsule: '.status' },
  { name: '🔄 RESTART ENGINE', desc: 'Safe reload & socket reconnect', capsule: '.restart' },
  { name: '🎫 DAILY QUOTAS', desc: 'Check daily free commands & coins', capsule: '.quota' },
  { name: '👑 OWNER CONTACT', desc: 'Direct owner contact & WhatsApp channel', capsule: '.owner' },
];

/**
 * Sri Lanka Local Services Catalog - 8 Tools
 */
export const SL_SERVICES_CATALOG: CommandCardItem[] = [
  { name: '🇱🇰 BREAKING NEWS', desc: 'Ada Derana & Hiru live headlines', capsule: '.news' },
  { name: '🚆 TRAIN SCHEDULE', desc: 'Railway timetable Fort, Kandy, Galle', capsule: '.train' },
  { name: '⛽ FUEL PRICES', desc: 'Ceypetco & LIOC petrol & diesel rates', capsule: '.fuel' },
  { name: '⚡ CEB BILL CALC', desc: 'Electricity tariff & units estimate', capsule: '.ceb' },
  { name: '🥇 GOLD SOVEREIGN', desc: '24K & 22K Sri Lanka pawn rates', capsule: '.goldrate' },
  { name: '🚌 HIGHWAY BUS', desc: 'Expressway Makumbura, Kadawatha, Galle', capsule: '.bus' },
  { name: '📝 PAST PAPERS', desc: 'A/L & O/L exam papers & schemes', capsule: '.pastpapers' },
  { name: '🏖️ PUBLIC HOLIDAYS', desc: 'Sri Lanka mercantile & poya calendar', capsule: '.slholiday' },
];

/**
 * Sticker & Photo Studio Catalog - 8 Tools
 */
export const STICKER_CATALOG: CommandCardItem[] = [
  { name: '🖼️ CREATE STICKER', desc: 'Convert image or video to sticker', capsule: '.sticker' },
  { name: '🏷️ STICKER STEALER', desc: 'Rebrand pack name & author info', capsule: '.take' },
  { name: '🔮 EMOJI KITCHEN', desc: 'Blend 2 emojis into custom sticker', capsule: '.emojimix' },
  { name: '📸 STICKER TO PHOTO', desc: 'Extract JPG photo from sticker', capsule: '.toimg' },
  { name: '🎥 STICKER TO VIDEO', desc: 'Extract animated sticker to MP4', capsule: '.tovideo' },
  { name: '✂️ REMOVE BG', desc: 'Instant AI transparent cutouts', capsule: '.removebg' },
  { name: '💎 HD ENHANCER', desc: 'AI 4K photo restoration & upscale', capsule: '.hd' },
  { name: '✨ NEON TEXT STICKER', desc: 'Animated glowing rainbow sticker', capsule: '.attp' },
];

/**
 * Audio FX & DJ Catalog - 6 Tools
 */
export const AUDIO_FX_CATALOG: CommandCardItem[] = [
  { name: '🌌 SLOWED + REVERB', desc: 'Aesthetic chill lofi ambient reverb', capsule: '.slowed' },
  { name: '⚡ NIGHTCORE', desc: 'Sped-up pitch & boosted tempo beats', capsule: '.nightcore' },
  { name: '🔊 BASS BOOST', desc: 'Subwoofer heavy bass equalizer', capsule: '.bass' },
  { name: '🎤 VOCAL REMOVER', desc: 'Split vocals & karaoke instrumental', capsule: '.vocalremover' },
  { name: '⏪ REVERSE AUDIO', desc: 'Backward audio playback effect', capsule: '.reverse' },
  { name: '🤖 ROBOT VOCODER', desc: 'Electronic metallic vocoder filter', capsule: '.robot' },
];

/**
 * Astrology & Fun Catalog - 8 Tools
 */
export const ASTROLOGY_FUN_CATALOG: CommandCardItem[] = [
  { name: '🪐 LAGNA PALAPALA', desc: 'Daily Sinhala horoscope for 12 signs', capsule: '.lagna' },
  { name: '💘 LOVE MATCH', desc: 'True compatibility percentage calculator', capsule: '.love' },
  { name: '🔥 TRUTH OR DARE', desc: 'Party dare challenge generator', capsule: '.dare' },
  { name: '🗣️ TRUTH QUESTION', desc: 'Deep reveal party question', capsule: '.truth' },
  { name: '🧞 AKINATOR GENIE', desc: 'Guess the character in your mind', capsule: '.akinator' },
  { name: '🎭 SINHALA MEMES', desc: 'Trending FB & TikTok viral memes', capsule: '.sinhalameme' },
  { name: '😂 COMEDY JOKES', desc: 'Hilarious Sinhala & English jokes', capsule: '.joke' },
  { name: '💭 DAILY QUOTE', desc: 'Inspirational motivational quote', capsule: '.quote' },
];

/**
 * Tech & Web Suite Catalog - 6 Tools
 */
export const TECH_WEB_CATALOG: CommandCardItem[] = [
  { name: '📬 TEMP EMAIL', desc: 'Disposable inbox & OTP code receiver', capsule: '.tempmail' },
  { name: '🔗 URL SHORTENER', desc: 'TinyURL quick link generator', capsule: '.shorturl' },
  { name: '🖥️ WEB SCREENSHOT', desc: 'Full webpage preview snapshot', capsule: '.ssweb' },
  { name: '🪙 CRYPTO BINANCE', desc: 'Live BTC, ETH & USDT to LKR rates', capsule: '.crypto' },
  { name: '🌐 DOMAIN WHOIS', desc: 'Domain registration & nameservers', capsule: '.whois' },
  { name: '📶 SPEED BENCHMARK', desc: 'Server bandwidth & latency test', capsule: '.speedtest' },
];

export const YASHI_HALLS_DEFAULT_LOGO_BASE64 = EMBEDDED_BRAND_LOGO_BASE64;

/**
 * Generates the YASHI HALLS Premium Download HTML Menu App.
 * Matches user specified dark purple/black neon design (#090510, #1a0c29, #7136a5)
 * with embedded logo, 12 commands, copy buttons, clipboard fallback & toast.
 */
export function generateDownloadMenuHtml(options: {
  botName?: string;
  prefix?: string;
  logoUrl?: string;
} = {}): string {
  const p = options.prefix || '.';
  const botName = (options.botName || 'YASHI HALLS').toUpperCase();
  const logoSrc = options.logoUrl || YASHI_HALLS_DEFAULT_LOGO_BASE64;

  return `<style>
* { box-sizing: border-box; }
.dl-menu-root {
  padding: 10px 8px 16px;
  background: #090510;
  color: white;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.menu {
  max-width: 420px;
  margin: auto;
  padding: 14px;
  border: 1px solid #7136a5;
  border-radius: 18px;
  background: linear-gradient(145deg,#1a0c29,#090510);
  box-shadow: 0 0 20px #8425c944;
}
.header {
  text-align: center;
  padding: 4px 0 12px;
}
.logo {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid #c084fc;
  box-shadow: 0 0 16px #a855f7;
  object-fit: cover;
}
.brand {
  font-size: 20px;
  font-weight: 900;
  color: #e9c5ff;
  margin-top: 8px;
  letter-spacing: 1.5px;
  text-shadow: 0 0 10px #a855f7;
}
.subtitle {
  color: #b78bd5;
  font-size: 10.5px;
  margin-top: 3px;
  font-weight: 700;
  letter-spacing: 0.8px;
}
.online {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 20px;
  background: #153321;
  color: #55f59b;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.8px;
  border: 1px solid #22c55e44;
}
.heading {
  color: #e8c8ff;
  font-size: 12px;
  font-weight: 800;
  margin: 10px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #583276;
  letter-spacing: 0.8px;
}
.command-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  background: #241631;
  border: 1px solid #49305f;
  border-radius: 11px;
}
.command:active {
  border-color: #c084fc;
}
.name {
  font-weight: 800;
  font-size: 11.5px;
  color: #f0dcff;
}
.code {
  color: #c99bf5;
  font-size: 10.5px;
  margin-top: 2px;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.copy {
  border: 0;
  border-radius: 7px;
  padding: 7px 11px;
  color: white;
  font-weight: 900;
  background: linear-gradient(135deg,#9333ea,#6b21a8);
  font-size: 10px;
  flex-shrink: 0;
  cursor: pointer;
  letter-spacing: 0.8px;
  box-shadow: 0 0 8px #9333ea44;
}
.copy:active {
  background: #a855f7;
}
.back {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 11px;
  border-radius: 11px;
  border: 1px solid #a855f7;
  background: #35194d;
  color: white;
  font-size: 11.5px;
  font-weight: 900;
  cursor: pointer;
  text-align: center;
  letter-spacing: 0.8px;
}
.footer {
  text-align: center;
  color: #a887bd;
  font-size: 9px;
  margin-top: 12px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
#toast {
  display: none;
  text-align: center;
  background: #173d2a;
  color: #69ffad;
  border-radius: 10px;
  padding: 7px;
  margin-top: 8px;
  font-size: 11px;
  font-weight: 800;
  border: 1px solid #22c55e55;
}
</style>

<div class="dl-menu-root">
<div class="menu">
  <div class="header">
    <img class="logo" src="${logoSrc}" alt="${botName}" onerror="this.style.display='none'">
    <div class="brand">${botName}</div>
    <div class="subtitle">MINI BOT • DOWNLOAD MENU</div>
    <div class="online">● ONLINE</div>
  </div>

  <div class="heading">📥 DOWNLOAD COMMANDS</div>

  <div class="command-list">
    <div class="command">
      <div>
        <div class="name">🎵 SONG</div>
        <div class="code">${p}song &lt;title&gt;</div>
      </div>
      <button class="copy" data-copy="${p}song ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🎬 VIDEO</div>
        <div class="code">${p}video &lt;title&gt;</div>
      </div>
      <button class="copy" data-copy="${p}video ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">▶️ PLAY</div>
        <div class="code">${p}play &lt;title&gt;</div>
      </div>
      <button class="copy" data-copy="${p}play ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🔊 AUDIO</div>
        <div class="code">${p}audio &lt;title&gt;</div>
      </div>
      <button class="copy" data-copy="${p}audio ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🔎 YTSEARCH</div>
        <div class="code">${p}ytsearch &lt;query&gt;</div>
      </div>
      <button class="copy" data-copy="${p}ytsearch ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">📁 MEDIAFIRE</div>
        <div class="code">${p}mf &lt;url&gt;</div>
      </div>
      <button class="copy" data-copy="${p}mf ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🎵 TIKTOK</div>
        <div class="code">${p}tt &lt;url&gt;</div>
      </div>
      <button class="copy" data-copy="${p}tt ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">📘 FACEBOOK</div>
        <div class="code">${p}fb &lt;url&gt;</div>
      </div>
      <button class="copy" data-copy="${p}fb ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">📸 INSTAGRAM</div>
        <div class="code">${p}ig &lt;url&gt;</div>
      </div>
      <button class="copy" data-copy="${p}ig ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🐦 TWITTER / X</div>
        <div class="code">${p}twitter &lt;url&gt;</div>
      </div>
      <button class="copy" data-copy="${p}twitter ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">📦 APK</div>
        <div class="code">${p}apk &lt;app&gt;</div>
      </div>
      <button class="copy" data-copy="${p}apk ">COPY</button>
    </div>

    <div class="command">
      <div>
        <div class="name">🎤 LYRICS</div>
        <div class="code">${p}lyrics &lt;song&gt;</div>
      </div>
      <button class="copy" data-copy="${p}lyrics ">COPY</button>
    </div>
  </div>

  <div id="toast">✓ COMMAND COPIED!</div>

  <button class="back" id="backButton">
    ↩ BACK TO PANEL
  </button>

  <div class="footer">
    ⚡ POWERED BY YASHI HALLS ⚡
  </div>
</div>
</div>

<script>
(function() {
  const toast = document.getElementById("toast");
  document.querySelectorAll(".copy").forEach(button => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy;
      let copied = false;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          copied = true;
        }
      } catch (e) {}

      if (!copied) {
        try {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          copied = true;
        } catch (e) {}
      }

      if (toast) {
        toast.textContent = copied ? "✓ COMMAND COPIED!" : "Select command text to copy";
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 1800);
      }
    });
  });

  const backBtn = document.getElementById("backButton");
  if (backBtn && toast) {
    backBtn.addEventListener("click", () => {
      toast.textContent = "Tap ↩ BACK TO PANEL button below";
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 2000);
    });
  }
})();
</script>`;
}

/**
 * Generates the In-Chat Submenu HTML App matching the user's reference screenshots.
 * 
 * Specs:
 * - Dark purple background: #0e0719
 * - Glowing animated top gear/spark icon
 * - Uppercase Bold Header (e.g. TEXT TOOLS MENU)
 * - Subtitle: Tap to copy!
 * - 2-Column Grid of command cards
 * - Monospace capsule badge (.uppertext)
 * - Click-to-copy with animated toast feedback
 * - Footer branding: YASHI HALLS X MINI
 */
export function generateCategorySubmenuHtml(options: {
  title: string;
  cards: CommandCardItem[];
  botName?: string;
  prefix?: string;
  height?: number;
}): string {
  const botName = (options.botName || 'YASHI HALLS').toUpperCase();
  const title = options.title.toUpperCase();
  const height = options.height || 560;
  const p = options.prefix || '.';

  const cardsHtml = options.cards
    .map((item) => {
      // Ensure command has current prefix
      const cmd = item.capsule.startsWith('.')
        ? `${p}${item.capsule.slice(1)}`
        : item.capsule.startsWith(p)
        ? item.capsule
        : `${p}${item.capsule}`;

      return `
    <div class="cmd-card" onclick="copyCmd('${escapeHtml(cmd)}', this)">
      <div class="cmd-title">${escapeHtml(item.name)}</div>
      <div class="cmd-desc">${escapeHtml(item.desc)}</div>
      <div class="cmd-capsule">${escapeHtml(cmd)}</div>
    </div>`;
    })
    .join('\n');

  return `
<style>
  @keyframes toastPop {
    0% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
    15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    85% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
  }
  .app-container {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: #09090b;
    color: #fafafa;
    padding: 16px 12px 18px 12px;
    border: 1px solid rgba(212, 175, 55, 0.28);
    border-radius: 16px;
    position: relative;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .submenu-header {
    text-align: center;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.16);
  }
  .top-icon-wrap {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(212, 175, 55, 0.08);
    border: 1px solid rgba(212, 175, 55, 0.26);
    margin-bottom: 8px;
  }
  .top-icon-svg {
    width: 18px;
    height: 18px;
  }
  .menu-title {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: #fafafa;
    margin: 0 0 3px 0;
  }
  .menu-subtitle {
    font-size: 10.5px;
    font-weight: 500;
    color: #d4af37;
    margin: 0;
    letter-spacing: 0.3px;
  }
  .cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .cmd-card {
    background: #121216;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 11px;
    padding: 11px 9px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .cmd-card:active {
    background: #1c1810;
    border-color: #d4af37;
    transform: scale(0.97);
  }
  .cmd-title {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #fafafa;
    margin-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-desc {
    font-size: 9.5px;
    color: #a1a1aa;
    margin-bottom: 8px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cmd-capsule {
    display: inline-block;
    align-self: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #1b1811;
    border: 1px solid rgba(212, 175, 55, 0.32);
    color: #f3e5ab;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
  }
  .menu-footer {
    text-align: center;
    font-size: 9.5px;
    letter-spacing: 2px;
    color: rgba(212, 175, 55, 0.65);
    margin-top: 14px;
    margin-bottom: 2px;
    font-weight: 700;
    text-transform: uppercase;
  }
  #toast {
    display: none;
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #181611;
    border: 1px solid #d4af37;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
    color: #f3e5ab;
    padding: 7px 15px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  }
</style>

<div class="app-container" id="container">
  <div id="toast">Copied!</div>
  <textarea id="clipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <div class="submenu-header">
    <div class="top-icon-wrap">
      <svg class="top-icon-svg" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    </div>
    <div class="menu-title">${escapeHtml(title)}</div>
    <div class="menu-subtitle">${options.cards.length} commands · Tap any card to copy</div>
  </div>

  <div class="cards-grid">
    ${cardsHtml}
  </div>

  <div class="menu-footer">${escapeHtml(botName)} · EXECUTIVE</div>
</div>

<script>
  var toastTimer = null;

  function showToast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.innerText = text;
    t.style.display = 'block';
    t.style.animation = 'none';
    void t.offsetHeight;
    t.style.animation = 'toastPop 1.6s ease forwards';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      t.style.display = 'none';
    }, 1600);
  }

  function copyCmd(cmd, el) {
    if (el) {
      el.style.borderColor = '#d4af37';
      el.style.background = '#1c1810';
      setTimeout(function() {
        el.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        el.style.background = '#121216';
      }, 280);
    }

    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(function() {
        showToast('Copied: ' + cmd);
      }).catch(function() {
        fallbackCopy(cmd);
      });
    } else {
      fallbackCopy(cmd);
    }
  }

  function fallbackCopy(cmd) {
    try {
      var sink = document.getElementById('clipSink');
      if (sink) {
        sink.value = cmd;
        sink.select();
        sink.setSelectionRange(0, 99999);
        var success = document.execCommand('copy');
        showToast(success ? ('Copied: ' + cmd) : ('Command: ' + cmd));
      } else {
        showToast('Command: ' + cmd);
      }
    } catch(e) {
      showToast('Command: ' + cmd);
    }
  }
</script>
`;
}


/**
 * Cyberpunk HUD Interactive Settings & Configuration Card
 * Ultra-fast sub-second card allowing the bot owner to configure core bot options.
 */
export function generateSettingsCardHtml(data: {
  botName?: string;
  prefix?: string;
  mode?: string;
  smartAutoReply?: boolean;
  voiceAutoReply?: boolean;
  antiLink?: boolean;
  channelAutoReact?: boolean;
  autoReadStatus?: boolean;
  ownerNumber?: string;
  height?: number;
} = {}): string {
  const p = data.prefix || '.';
  const botName = data.botName || 'YASHI HALLS';
  const mode = (data.mode || 'public').toLowerCase();
  const smartAutoReply = data.smartAutoReply !== false;
  const voiceAutoReply = data.voiceAutoReply === true;
  const antiLink = data.antiLink === true;
  const channelAutoReact = data.channelAutoReact === true;
  const autoReadStatus = data.autoReadStatus === true;
  const ownerNumber = data.ownerNumber || '94740712934';
  const height = data.height || 480;

  return `
<style>
  @keyframes cyberGlow {
    0%, 100% { border-color: #38bdf8; box-shadow: 0 0 20px rgba(56, 189, 248, 0.4), inset 0 0 15px rgba(56, 189, 248, 0.15); }
    50% { border-color: #a855f7; box-shadow: 0 0 28px rgba(168, 85, 247, 0.5), inset 0 0 18px rgba(168, 85, 247, 0.2); }
  }
  @keyframes radarGreen {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.5; }
  }
  @keyframes toastAnim {
    0% { opacity: 0; transform: translate(-50%, -10px) scale(0.9); }
    15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    85% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -8px) scale(0.92); }
  }

  .settings-container {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: #090a15;
    background-image: 
      radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.15), transparent 60%),
      linear-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px);
    background-size: 100% 100%, 14px 14px, 14px 14px;
    color: #f8fafc;
    padding: 12px 12px 14px 12px;
    border: 1.5px solid #38bdf8;
    border-radius: 16px;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: cyberGlow 5s ease-in-out infinite;
    user-select: none;
    -webkit-user-select: none;
  }
  .settings-container::-webkit-scrollbar { width: 4px; }
  .settings-container::-webkit-scrollbar-thumb { background: #38bdf8; border-radius: 4px; }

  /* HUD Header */
  .hud-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(56, 189, 248, 0.3);
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .hud-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hud-icon {
    font-size: 18px;
    filter: drop-shadow(0 0 6px #38bdf8);
  }
  .hud-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #38bdf8;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  }
  .hud-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    color: #34d399;
    padding: 2px 7px;
    border-radius: 12px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .dot-green {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    animation: radarGreen 1.5s infinite;
  }

  /* Form Section */
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #94a3b8;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    margin: 8px 2px 5px 2px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(148, 163, 184, 0.2);
  }

  /* Input fields */
  .input-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }
  .input-group {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(56, 189, 248, 0.35);
    border-radius: 10px;
    padding: 6px 8px;
  }
  .input-label {
    font-size: 9px;
    font-weight: 800;
    color: #38bdf8;
    margin-bottom: 3px;
    letter-spacing: 0.4px;
  }
  .hud-input {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 700;
    font-family: inherit;
  }
  .hud-input:focus {
    color: #38bdf8;
  }

  /* Toggle Row Items */
  .toggle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-bottom: 10px;
  }
  .toggle-item {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    padding: 7px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .toggle-item.active {
    background: rgba(56, 189, 248, 0.12);
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }
  .toggle-left {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .toggle-name {
    font-size: 10px;
    font-weight: 800;
    color: #f1f5f9;
  }
  .toggle-desc {
    font-size: 7.5px;
    color: #64748b;
  }
  .toggle-item.active .toggle-desc {
    color: #38bdf8;
  }
  .toggle-pill {
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 8.5px;
    font-weight: 900;
    letter-spacing: 0.4px;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #f87171;
  }
  .toggle-item.active .toggle-pill {
    background: rgba(16, 185, 129, 0.2);
    border-color: #10b981;
    color: #34d399;
  }

  /* Action Buttons */
  .action-wrap {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .btn-save {
    width: 100%;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    border: 1.5px solid #38bdf8;
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-save:active {
    transform: scale(0.97);
    filter: brightness(1.2);
  }
  .btn-reset {
    width: 100%;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #94a3b8;
    padding: 7px 10px;
    border-radius: 10px;
    font-size: 9.5px;
    font-weight: 800;
    cursor: pointer;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .btn-reset:active {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border-color: #ef4444;
  }

  /* Owner Hotline info & Toast */
  .owner-hint {
    margin-top: 6px;
    text-align: center;
    font-size: 8.5px;
    color: #64748b;
    letter-spacing: 0.5px;
  }
  #settingsToast {
    display: none;
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    border: 1.5px solid #38bdf8;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.8);
    color: #ffffff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  }
</style>

<div class="settings-container">
  <div id="settingsToast">Saved!</div>
  <textarea id="settingsClipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <!-- HUD Header -->
  <div class="hud-header">
    <div class="hud-title-wrap">
      <span class="hud-icon">⚙️</span>
      <div class="hud-title">BOT CONFIGURATION PANEL</div>
    </div>
    <div class="hud-badge">
      <span class="dot-green"></span>
      <span>OWNER VERIFIED</span>
    </div>
  </div>

  <!-- Identifiers Section -->
  <div class="section-title">🏷️ BOT IDENTITY &amp; PREFIX</div>
  <div class="input-grid">
    <div class="input-group">
      <div class="input-label">BOT DISPLAY NAME</div>
      <input type="text" id="cfgBotName" class="hud-input" value="${escapeHtml(botName)}" placeholder="eg-yashi halls" maxlength="30">
    </div>
    <div class="input-group">
      <div class="input-label">COMMAND PREFIX</div>
      <input type="text" id="cfgPrefix" class="hud-input" value="${escapeHtml(p)}" placeholder="e.g. ." maxlength="3">
    </div>
  </div>

  <!-- Core Switches Section -->
  <div class="section-title">⚡ CORE TOGGLES &amp; ACCESS</div>
  <div class="toggle-grid">
    <!-- Mode Switch -->
    <div class="toggle-item ${mode === 'public' ? 'active' : ''}" id="toggleMode" onclick="toggleOption('mode')">
      <div class="toggle-left">
        <div class="toggle-name">🤖 Bot Mode</div>
        <div class="toggle-desc" id="lblMode">${mode === 'public' ? 'Public (All Users)' : 'Private (Owner Only)'}</div>
      </div>
      <div class="toggle-pill" id="pillMode">${mode === 'public' ? 'PUBLIC' : 'PRIVATE'}</div>
    </div>

    <!-- Smart Auto Reply -->
    <div class="toggle-item ${smartAutoReply ? 'active' : ''}" id="toggleAutoReply" onclick="toggleOption('smartAutoReply')">
      <div class="toggle-left">
        <div class="toggle-name">💬 Auto Reply</div>
        <div class="toggle-desc">Sinhala &amp; Eng greetings</div>
      </div>
      <div class="toggle-pill" id="pillAutoReply">${smartAutoReply ? 'ON' : 'OFF'}</div>
    </div>

    <!-- Anti Link -->
    <div class="toggle-item ${antiLink ? 'active' : ''}" id="toggleAntiLink" onclick="toggleOption('antiLink')">
      <div class="toggle-left">
        <div class="toggle-name">🛡️ Anti-Link</div>
        <div class="toggle-desc">Auto kick link spammers</div>
      </div>
      <div class="toggle-pill" id="pillAntiLink">${antiLink ? 'ON' : 'OFF'}</div>
    </div>

    <!-- Channel Auto React -->
    <div class="toggle-item ${channelAutoReact ? 'active' : ''}" id="toggleChannelReact" onclick="toggleOption('channelAutoReact')">
      <div class="toggle-left">
        <div class="toggle-name">⚡ Auto-React</div>
        <div class="toggle-desc">Channel emoji reactions</div>
      </div>
      <div class="toggle-pill" id="pillChannelReact">${channelAutoReact ? 'ON' : 'OFF'}</div>
    </div>

    <!-- Voice Note Reply -->
    <div class="toggle-item ${voiceAutoReply ? 'active' : ''}" id="toggleVoiceReply" onclick="toggleOption('voiceAutoReply')">
      <div class="toggle-left">
        <div class="toggle-name">🎙️ Voice Notes</div>
        <div class="toggle-desc">Auto voice replies</div>
      </div>
      <div class="toggle-pill" id="pillVoiceReply">${voiceAutoReply ? 'ON' : 'OFF'}</div>
    </div>

    <!-- Auto Read Status -->
    <div class="toggle-item ${autoReadStatus ? 'active' : ''}" id="toggleAutoRead" onclick="toggleOption('autoReadStatus')">
      <div class="toggle-left">
        <div class="toggle-name">👀 Read Status</div>
        <div class="toggle-desc">Auto view contacts status</div>
      </div>
      <div class="toggle-pill" id="pillAutoRead">${autoReadStatus ? 'ON' : 'OFF'}</div>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="action-wrap">
    <button class="btn-save" onclick="saveConfiguration()">
      <span>💾 SAVE &amp; APPLY CONFIGURATION</span>
    </button>
    <button class="btn-reset" onclick="resetConfiguration()">
      <span>🔄 RESET TO DEFAULTS</span>
    </button>
  </div>

  <div class="owner-hint">
    👑 RESTRICTED TO OWNER: +${escapeHtml(ownerNumber)} • YASHI HALLS ENGINE
  </div>
</div>

<script>
  var currentCfg = {
    botName: ${JSON.stringify(botName)},
    prefix: ${JSON.stringify(p)},
    mode: ${JSON.stringify(mode)},
    smartAutoReply: ${smartAutoReply},
    voiceAutoReply: ${voiceAutoReply},
    antiLink: ${antiLink},
    channelAutoReact: ${channelAutoReact},
    autoReadStatus: ${autoReadStatus}
  };

  var toastTimer = null;
  function showToast(text, color) {
    var t = document.getElementById('settingsToast');
    if (!t) return;
    t.innerText = text;
    t.style.display = 'block';
    if (color) {
      t.style.borderColor = color;
      t.style.boxShadow = '0 0 20px ' + color;
    }
    t.style.animation = 'none';
    void t.offsetHeight;
    t.style.animation = 'toastAnim 2s ease forwards';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      t.style.display = 'none';
    }, 2000);
  }

  function toggleOption(key) {
    if (key === 'mode') {
      currentCfg.mode = currentCfg.mode === 'public' ? 'private' : 'public';
      var item = document.getElementById('toggleMode');
      var pill = document.getElementById('pillMode');
      var lbl = document.getElementById('lblMode');
      if (currentCfg.mode === 'public') {
        item.classList.add('active');
        pill.innerText = 'PUBLIC';
        lbl.innerText = 'Public (All Users)';
      } else {
        item.classList.remove('active');
        pill.innerText = 'PRIVATE';
        lbl.innerText = 'Private (Owner Only)';
      }
    } else {
      currentCfg[key] = !currentCfg[key];
      var elId = 'toggle' + key.charAt(0).toUpperCase() + key.slice(1);
      var pillId = 'pill' + key.charAt(0).toUpperCase() + key.slice(1);
      var el = document.getElementById(elId);
      var pEl = document.getElementById(pillId);
      if (currentCfg[key]) {
        if (el) el.classList.add('active');
        if (pEl) pEl.innerText = 'ON';
      } else {
        if (el) el.classList.remove('active');
        if (pEl) pEl.innerText = 'OFF';
      }
    }
  }

  function saveConfiguration() {
    var nameInput = document.getElementById('cfgBotName');
    var pfxInput = document.getElementById('cfgPrefix');

    var newName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : currentCfg.botName;
    var newPfx = (pfxInput && pfxInput.value.trim()) ? pfxInput.value.trim().charAt(0) : currentCfg.prefix;

    currentCfg.botName = newName;
    currentCfg.prefix = newPfx;

    var payload = {
      botName: currentCfg.botName,
      prefix: currentCfg.prefix,
      mode: currentCfg.mode,
      smartAutoReply: currentCfg.smartAutoReply,
      voiceAutoReplyEnabled: currentCfg.voiceAutoReply,
      antiLink: currentCfg.antiLink,
      channelAutoReact: currentCfg.channelAutoReact,
      autoReadStatus: currentCfg.autoReadStatus
    };

    var b64Payload = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var syncCmd = (payload.prefix || '.') + 'setconfig ' + b64Payload;

    // 1. Always copy the .setconfig command to clipboard for 1-tap instant pasting
    copySyncCmd(syncCmd);

    // 2. Also attempt direct HTTP POST if in supported webview/browser
    try {
      fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(res) {
        if (res.ok) {
          showToast('✓ Saved! Tap send or paste in chat.', '#10b981');
        }
      }).catch(function() {});
    } catch(e) {}
  }

  function copySyncCmd(cmd) {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(function() {
          showToast('✓ Copied! Paste in chat & send to apply', '#10b981');
        }).catch(function() {
          fallbackClipboard(cmd);
        });
      } else {
        fallbackClipboard(cmd);
      }
    } catch(e) {
      fallbackClipboard(cmd);
    }
  }

  function fallbackClipboard(cmd) {
    try {
      var sink = document.getElementById('settingsClipSink');
      if (sink) {
        sink.value = cmd;
        sink.select();
        sink.setSelectionRange(0, 99999);
        document.execCommand('copy');
      }
      showToast('✓ Copied! Paste in chat & send to apply', '#10b981');
    } catch(err) {
      showToast('Command: ' + cmd, '#38bdf8');
    }
  }

  function resetConfiguration() {
    document.getElementById('cfgBotName').value = 'YASHI HALLS';
    document.getElementById('cfgPrefix').value = '.';
    currentCfg.botName = 'YASHI HALLS';
    currentCfg.prefix = '.';
    currentCfg.mode = 'public';
    currentCfg.smartAutoReply = true;
    currentCfg.voiceAutoReply = false;
    currentCfg.antiLink = false;
    currentCfg.channelAutoReact = false;
    currentCfg.autoReadStatus = false;

    // Update UI elements
    document.getElementById('toggleMode').classList.add('active');
    document.getElementById('pillMode').innerText = 'PUBLIC';
    document.getElementById('lblMode').innerText = 'Public (All Users)';

    ['smartAutoReply', 'voiceAutoReply', 'antiLink', 'channelAutoReact', 'autoReadStatus'].forEach(function(k) {
      var elId = 'toggle' + k.charAt(0).toUpperCase() + k.slice(1);
      var pillId = 'pill' + k.charAt(0).toUpperCase() + k.slice(1);
      var el = document.getElementById(elId);
      var pEl = document.getElementById(pillId);
      if (currentCfg[k]) {
        if (el) el.classList.add('active');
        if (pEl) pEl.innerText = 'ON';
      } else {
        if (el) el.classList.remove('active');
        if (pEl) pEl.innerText = 'OFF';
      }
    });

    saveConfiguration();
  }
</script>
`;
}

/**
 * Master In-Chat Interactive Android HTML App Menu
 * Renders complete Multi-Category Animated In-Chat Applet with Tab Switching & 1-Tap Copy
 */
export function generateMasterInteractiveMenuHtml(data: {
  botName?: string;
  prefix?: string;
  plan?: string;
  ownerNumber?: string;
  uptime?: string;
  logoUrl?: string;
  headerBgUrl?: string;
  initialTab?: string;
  height?: number;
  isOwner?: boolean;
} = {}): string {
  const p = data.prefix || '.';
  const botName = (data.botName || 'YASHI HALLS MINI').toUpperCase();
  const plan = (data.plan || 'MINI PLAN').toUpperCase();
  const height = data.height || 980;
  const isOwner = Boolean(data.isOwner);
  const logoSrc = (data.logoUrl && !data.logoUrl.includes('ibb.co')) ? data.logoUrl : EMBEDDED_BRAND_LOGO_BASE64;
  const headerBgSrc = (data.headerBgUrl && !data.headerBgUrl.includes('ibb.co')) ? data.headerBgUrl : EMBEDDED_HEADER_BG_BASE64;
  const initTab = (data.initialTab || 'hub').toLowerCase();

  const categoriesData: Record<string, { name: string; icon: string; shortLabel: string; desc: string; cards: CommandCardItem[] }> = {
    sl: {
      name: '🇱🇰 Sri Lanka Services',
      icon: '🇱🇰',
      shortLabel: 'SL Services',
      desc: 'Ada Derana, Trains, Fuel Rates, CEB & Buses',
      cards: SL_SERVICES_CATALOG
    },
    stickers: {
      name: '🎨 Sticker & Media Studio',
      icon: '🎨',
      shortLabel: 'Stickers',
      desc: 'Sticker Maker, Stealer, Emojimix & HD Enhancer',
      cards: STICKER_CATALOG
    },
    downloads: {
      name: '📥 Downloads',
      icon: '📥',
      shortLabel: 'Downloads',
      desc: 'Music, Videos & Social Media HD Downloaders',
      cards: DOWNLOADS_CATALOG
    },
    ai: {
      name: '🤖 AI Tools',
      icon: '🤖',
      shortLabel: 'AI Tools',
      desc: 'Gemini AI Chat, Voice Understanding & Code',
      cards: AI_CATALOG
    },
    movies: {
      name: '🎬 Movies & Subtitles',
      icon: '🎬',
      shortLabel: 'Movies',
      desc: 'Direct Film Download & Sinhala Subtitles',
      cards: MOVIES_CATALOG
    },
    music: {
      name: '🎵 Music & Audio',
      icon: '🎵',
      shortLabel: 'Music & Audio',
      desc: 'Ultra HQ 320kbps MP3, Spotify & Lyrics',
      cards: MUSIC_CATALOG
    },
    audiofx: {
      name: '🎧 Audio FX & DJ Tools',
      icon: '🎧',
      shortLabel: 'Audio FX',
      desc: 'Slowed + Reverb, Nightcore, Bass & Vocal Remover',
      cards: AUDIO_FX_CATALOG
    },
    group: {
      name: '👥 Group Admin & Security',
      icon: '👥',
      shortLabel: 'Group Admin',
      desc: 'Tagall, Anti-delete, Anti-viewonce, Welcome & Chatbot',
      cards: GROUPS_CATALOG
    },
    games: {
      name: '🎮 Games & Entertainment',
      icon: '🎮',
      shortLabel: 'Games & Fun',
      desc: 'Tic-Tac-Toe, Trivia Quiz, Slot Machine & Jokes',
      cards: GAMES_CATALOG
    },
    astro: {
      name: '🔮 Astrology & Party Fun',
      icon: '🔮',
      shortLabel: 'Astro & Fun',
      desc: 'Daily Lagna Palapala, Love Compatibility & Akinator',
      cards: ASTROLOGY_FUN_CATALOG
    },
    tech: {
      name: '⚡ Tech & Crypto Suite',
      icon: '⚡',
      shortLabel: 'Tech & Crypto',
      desc: 'Temp Email, URL Shortener, Web Screenshot & Binance',
      cards: TECH_WEB_CATALOG
    },
    utilities: {
      name: '🧮 Utilities',
      icon: '🧮',
      shortLabel: 'Utilities',
      desc: 'Scientific Calculators, Forex & Converters',
      cards: UTILITIES_CATALOG
    },
    text: {
      name: '🛠️ Text Tools',
      icon: '🛠️',
      shortLabel: 'Text Tools',
      desc: 'Text Manipulation, Ciphers & Fonts',
      cards: TEXT_TOOLS_CATALOG.slice(0, 24)
    },
    search: {
      name: '🔎 Search & Info',
      icon: '🔎',
      shortLabel: 'Search & Info',
      desc: 'Dictionary, Urban, IP Info & Gold Rates',
      cards: SEARCH_CATALOG
    },
    system: {
      name: '⚙️ System',
      icon: '⚙️',
      shortLabel: 'System Info',
      desc: 'Speed Benchmark, Telemetry & Controls',
      cards: SYSTEM_CATALOG
    }
  };

  const categoriesJson = JSON.stringify(categoriesData).replace(/</g, '\\u003c');

  return `
<style>
  @keyframes cardEntrance {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes toastPop {
    0% { opacity: 0; transform: translate(-50%, -10px) scale(0.95); }
    16% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    84% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
  }
  .app-master {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    min-height: 480px;
    background: #09090b;
    color: #fafafa;
    padding: 12px 11px 14px 11px;
    border: 1px solid rgba(212, 175, 55, 0.28);
    border-radius: 16px;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    overscroll-behavior-y: contain;
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: #3f3f46 #09090b;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.72);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .app-master::-webkit-scrollbar {
    width: 4px;
  }
  .app-master::-webkit-scrollbar-track {
    background: #09090b;
  }
  .app-master::-webkit-scrollbar-thumb {
    background: #3f3f46;
    border-radius: 4px;
  }
  .header-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(16, 16, 20, 0.90) 0%, rgba(10, 10, 13, 0.96) 100%), url('${headerBgSrc}') center/cover no-repeat;
    border: 1px solid rgba(212, 175, 55, 0.25);
    border-radius: 13px;
    padding: 11px 12px;
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 8px;
  }
  .header-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 16px;
    right: 16px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.55), transparent);
  }
  .header-logo {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid #d4af37;
    object-fit: cover;
    background: #121215;
  }
  .header-info {
    flex: 1;
    min-width: 0;
  }
  .header-brand-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .header-brand {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #fafafa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-crown {
    flex-shrink: 0;
    display: inline-flex;
    color: #d4af37;
  }
  .header-meta {
    font-size: 10px;
    color: #a1a1aa;
    font-weight: 600;
    margin-top: 3px;
    letter-spacing: 0.4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .header-meta span.gold {
    color: #e5c158;
    font-weight: 700;
  }
  .stats-row {
    display: flex;
    align-items: stretch;
    background: #111114;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    margin: 0 0 8px 0;
    overflow: hidden;
  }
  .stat-cell {
    flex: 1;
    padding: 7px 4px;
    text-align: center;
    position: relative;
  }
  .stat-cell + .stat-cell::before {
    content: '';
    position: absolute;
    left: 0;
    top: 22%;
    bottom: 22%;
    width: 1px;
    background: rgba(212, 175, 55, 0.16);
  }
  .stat-num {
    font-size: 12px;
    font-weight: 800;
    color: #f3e5ab;
    font-variant-numeric: tabular-nums;
  }
  .stat-lbl {
    font-size: 8.5px;
    color: #71717a;
    margin-top: 1px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .search-box-wrap {
    position: relative;
    margin: 0 0 10px 0;
  }
  .search-icon {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: #d4af37;
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    box-sizing: border-box;
    background: #111115;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 9px 12px 9px 32px;
    font-size: 12px;
    font-weight: 500;
    color: #fafafa;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .search-input::placeholder {
    color: #71717a;
  }
  .search-input:focus {
    border-color: #d4af37;
    box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.15);
  }
  .hub-container {
    margin: 0 0 6px 0;
  }
  .hub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 2px 7px 2px;
  }
  .hub-title {
    font-size: 10.5px;
    font-weight: 800;
    color: #e4e4e7;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .hub-subtitle {
    font-size: 9.5px;
    color: #d4af37;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .hub-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .hub-tile {
    background: #121216;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 11px;
    padding: 8px 9px;
    min-height: 48px;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
    -webkit-tap-highlight-color: transparent;
    animation: cardEntrance 0.25s ease backwards;
  }
  .hub-tile:active {
    background: #1c1810;
    border-color: #d4af37;
    transform: scale(0.97);
  }
  .hub-icon-box {
    width: 31px;
    height: 31px;
    flex-shrink: 0;
    border-radius: 8px;
    background: rgba(212, 175, 55, 0.08);
    border: 1px solid rgba(212, 175, 55, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    line-height: 1;
  }
  .hub-text {
    flex: 1;
    min-width: 0;
  }
  .hub-name {
    font-size: 11.5px;
    font-weight: 700;
    color: #fafafa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.15px;
  }
  .hub-count {
    font-size: 9.5px;
    font-weight: 500;
    color: #a1a1aa;
    margin-top: 1px;
    font-variant-numeric: tabular-nums;
  }
  .hub-chevron {
    flex-shrink: 0;
    color: rgba(212, 175, 55, 0.6);
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
  }
  .hub-tile-wide {
    grid-column: 1 / -1;
  }
  .hub-tile-all {
    grid-column: 1 / -1;
    background: linear-gradient(135deg, rgba(212, 175, 55, 0.14) 0%, rgba(20, 20, 24, 0.96) 100%);
    border: 1px solid rgba(212, 175, 55, 0.45);
    padding: 10px 12px;
  }
  .hub-tile-all .hub-icon-box {
    background: rgba(212, 175, 55, 0.18);
    border-color: rgba(212, 175, 55, 0.4);
    color: #f3e5ab;
  }
  .hub-tile-all .hub-name {
    font-size: 12px;
    font-weight: 800;
    color: #f3e5ab;
    letter-spacing: 0.3px;
  }
  .hub-tile-all .hub-count {
    color: #d4af37;
    font-weight: 600;
  }
  .detail-nav-bar {
    margin: 2px 0 10px 0;
  }
  .detail-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .back-hub-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #141418;
    border: 1px solid rgba(212, 175, 55, 0.35);
    color: #f3e5ab;
    border-radius: 9px;
    padding: 7px 12px;
    min-height: 36px;
    box-sizing: border-box;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
    cursor: pointer;
    transition: transform 0.14s ease, background 0.14s ease, border-color 0.14s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .back-hub-btn:active {
    background: #d4af37;
    color: #09090b;
    transform: scale(0.97);
  }
  .active-page-meta {
    font-size: 10px;
    font-weight: 700;
    color: #a1a1aa;
    font-family: ui-monospace, SFMono-Regular, monospace;
    letter-spacing: 0.5px;
  }
  .active-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding-bottom: 7px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.16);
  }
  .active-title {
    font-size: 13.5px;
    font-weight: 800;
    color: #fafafa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .active-hint {
    font-size: 9.5px;
    color: #d4af37;
    font-weight: 600;
    white-space: nowrap;
  }
  .cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .cmd-card {
    background: #121216;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 11px;
    padding: 11px 9px;
    text-align: left;
    cursor: pointer;
    transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
    -webkit-tap-highlight-color: transparent;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    animation: cardEntrance 0.22s ease backwards;
  }
  .cmd-card:active {
    background: #1c1810;
    border-color: #d4af37;
    transform: scale(0.97);
  }
  .cmd-title {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #fafafa;
    margin-bottom: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-desc {
    font-size: 9.5px;
    font-weight: 400;
    color: #a1a1aa;
    margin-bottom: 8px;
    line-height: 1.32;
    min-height: 25px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .cmd-capsule {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: #1b1811;
    border: 1px solid rgba(212, 175, 55, 0.34);
    color: #f3e5ab;
    font-family: ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
    border-radius: 6px;
    padding: 3.5px 8px;
    font-size: 10.5px;
    font-weight: 600;
  }
  .cmd-card:active .cmd-capsule {
    background: #d4af37;
    border-color: #f3e5ab;
    color: #09090b;
  }
  .pagination-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding: 6px 8px;
    background: #111114;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }
  .page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #18181d;
    border: 1px solid rgba(212, 175, 55, 0.32);
    color: #f3e5ab;
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    cursor: pointer;
    transition: transform 0.14s ease, background 0.14s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .page-btn:active:not(:disabled) {
    background: #d4af37;
    color: #09090b;
    transform: scale(0.96);
  }
  .page-btn:disabled {
    opacity: 0.32;
    border-color: rgba(255, 255, 255, 0.08);
    color: #71717a;
    cursor: not-allowed;
  }
  .page-indicator {
    font-size: 10px;
    font-weight: 600;
    color: #a1a1aa;
    letter-spacing: 0.4px;
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }
  .footer-actions {
    margin-top: 9px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .footer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.4px;
    border: 1px solid;
    transition: transform 0.14s ease, filter 0.14s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .btn-copy-all {
    background: linear-gradient(135deg, #e5c158 0%, #c59b27 100%);
    border-color: #f3e5ab;
    color: #09090b;
    font-weight: 800;
    padding: 10px 14px;
  }
  .btn-row {
    display: flex;
    gap: 6px;
  }
  .btn-ping,
  .btn-owner {
    flex: 1;
    background: #141418;
    border-color: rgba(212, 175, 55, 0.25);
    color: #e4e4e7;
  }
  .btn-settings {
    background: #18140d;
    border-color: rgba(212, 175, 55, 0.45);
    color: #f3e5ab;
    font-weight: 800;
  }
  .footer-btn:active {
    transform: scale(0.98);
    filter: brightness(1.1);
  }
  .footer-branding-wrap {
    text-align: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  .footer-branding {
    font-size: 9px;
    font-weight: 700;
    color: rgba(212, 175, 55, 0.65);
    letter-spacing: 2.2px;
    text-transform: uppercase;
  }
  #toast {
    display: none;
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #181611;
    border: 1px solid #d4af37;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.72);
    color: #f3e5ab;
    padding: 7px 16px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  }
</style>

<div class="app-master" id="masterApp">
  <div id="toast">Copied!</div>
  <textarea id="clipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <div class="header-card">
    <img class="header-logo" src="${logoSrc}" alt="${escapeHtml(botName)}" loading="eager" onerror="this.onerror=null; this.src='${EMBEDDED_BRAND_LOGO_BASE64}';">
    <div class="header-info">
      <div class="header-brand-row">
        <div class="header-brand">${escapeHtml(botName)}</div>
        <span class="header-crown" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 18h20l-2-10-5 4-3-6-3 6-5-4-2 10z"></path>
          </svg>
        </span>
      </div>
      <div class="header-meta"><span class="gold">${escapeHtml(plan)}</span> · 24/7 ONLINE · PREFIX [ ${escapeHtml(p)} ]</div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-cell">
      <div class="stat-num">15</div>
      <div class="stat-lbl">Categories</div>
    </div>
    <div class="stat-cell">
      <div class="stat-num">160+</div>
      <div class="stat-lbl">Commands</div>
    </div>
    <div class="stat-cell">
      <div class="stat-num">1-TAP</div>
      <div class="stat-lbl">Fast Copy</div>
    </div>
  </div>

  <div class="search-box-wrap">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <input type="text" class="search-input" id="searchBox" placeholder="Search 160+ commands (e.g. song, tiktok, ai)..." oninput="filterActiveCommands(this.value)">
  </div>

  <div id="categoryHubView" class="hub-container">
    <div class="hub-header">
      <div class="hub-title">Command Directory</div>
      <div class="hub-subtitle">15 Categories</div>
    </div>
    <div class="hub-grid" id="hubGrid"></div>

    <div class="footer-actions">
      <button class="footer-btn btn-copy-all" onclick="copyAllCommands()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>COPY COMPLETE DIRECTORY</span>
      </button>
      <div class="btn-row">
        <button class="footer-btn btn-ping" onclick="copyCmd('${escapeHtml(p)}ping')">
          <span>SPEED PING (${escapeHtml(p)}ping)</span>
        </button>
        <button class="footer-btn btn-owner" onclick="copyCmd('${escapeHtml(p)}owner')">
          <span>OWNER (${escapeHtml(p)}owner)</span>
        </button>
      </div>
      ${isOwner ? `
      <button class="footer-btn btn-settings" onclick="copyCmd('${escapeHtml(p)}settings')">
        <span>BOT SETTINGS PANEL (${escapeHtml(p)}settings)</span>
      </button>
      ` : ''}
    </div>
  </div>

  <div id="categoryDetailView" style="display:none;">
    <div class="detail-nav-bar">
      <div class="detail-top-row">
        <button class="back-hub-btn" onclick="showCategoryHub()">
          <span>&lsaquo; ALL CATEGORIES</span>
        </button>
        <div class="active-page-meta" id="topPagePill">PAGE 1/1</div>
      </div>
      <div class="active-header">
        <div class="active-title" id="activeCategoryTitle">DOWNLOADS</div>
        <div class="active-hint" id="activeCategoryHint">Tap any card to copy</div>
      </div>
    </div>

    <div class="cards-grid" id="cardsGrid"></div>

    <div class="pagination-bar" id="paginationBar" style="display:none;">
      <button class="page-btn" id="btnPrevPage" onclick="prevCategoryPage()">
        <span>&lsaquo; PREV</span>
      </button>
      <div class="page-indicator" id="pageIndicatorText">
        PAGE 1 OF 1
      </div>
      <button class="page-btn" id="btnNextPage" onclick="nextCategoryPage()">
        <span>NEXT &rsaquo;</span>
      </button>
    </div>

    <div style="margin-top:8px;">
      <button class="back-hub-btn" onclick="showCategoryHub()" style="width:100%; justify-content:center;">
        <span>&lsaquo; RETURN TO CATEGORIES</span>
      </button>
    </div>
  </div>

  <div class="footer-branding-wrap">
    <div class="footer-branding">YASHI HALLS · EXECUTIVE</div>
  </div>
</div>

<script>
  var categories = ${categoriesJson};
  var currentPrefix = "${p}";
  var currentCatKey = "${initTab}";
  var toastTimer = null;
  var currentCategoryPage = 1;
  var pageSize = 8;
  var currentFilteredCards = [];
  var currentQueryText = '';

  function showToast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.innerText = text;
    t.style.display = 'block';
    t.style.animation = 'none';
    void t.offsetHeight;
    t.style.animation = 'toastPop 1.8s ease forwards';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      t.style.display = 'none';
    }, 1800);
  }

  function copyCmd(cmd, el) {
    if (el) {
      el.style.borderColor = '#d4af37';
      el.style.background = '#1c1810';
      setTimeout(function() {
        el.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        el.style.background = '#121216';
      }, 280);
    }

    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(function() {
        showToast('Copied: ' + cmd);
      }).catch(function() {
        fallbackCopy(cmd);
      });
    } else {
      fallbackCopy(cmd);
    }
  }

  function fallbackCopy(cmd) {
    try {
      var sink = document.getElementById('clipSink');
      if (sink) {
        sink.value = cmd;
        sink.select();
        sink.setSelectionRange(0, 99999);
        var success = document.execCommand('copy');
        showToast(success ? ('Copied: ' + cmd) : ('Command: ' + cmd));
      } else {
        showToast('Command: ' + cmd);
      }
    } catch(e) {
      showToast('Command: ' + cmd);
    }
  }

  function copyAllCommands() {
    var text = 'YASHI HALLS MASTER COMMANDS LIST\\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n';
    Object.keys(categories).forEach(function(k) {
      var cat = categories[k];
      text += '\\n' + cat.name.toUpperCase() + ':\\n';
      cat.cards.forEach(function(c) {
        var cmd = c.capsule.indexOf(currentPrefix) === 0 ? c.capsule : currentPrefix + c.capsule.replace(/^\\./, '');
        text += '• ' + cmd + ' - ' + c.name + ' (' + c.desc + ')\\n';
      });
    });
    copyCmd(text);
    showToast('Full directory copied');
  }

  function createCardElement(item, animIdx, categoryBadge) {
    var rawCap = item.capsule || '';
    var cleanCmd = rawCap.indexOf(currentPrefix) === 0 ? rawCap : (rawCap.indexOf('.') === 0 ? currentPrefix + rawCap.slice(1) : currentPrefix + rawCap);

    var card = document.createElement('div');
    card.className = 'cmd-card';
    if (typeof animIdx === 'number') {
      card.style.animationDelay = (Math.min(animIdx, 8) * 25) + 'ms';
    }
    card.onclick = function() { copyCmd(cleanCmd, card); };

    var titleDiv = document.createElement('div');
    titleDiv.className = 'cmd-title';
    titleDiv.innerText = (categoryBadge ? '[' + categoryBadge + '] ' : '') + item.name;

    var descDiv = document.createElement('div');
    descDiv.className = 'cmd-desc';
    descDiv.innerText = item.desc;

    var capDiv = document.createElement('div');
    capDiv.className = 'cmd-capsule';
    capDiv.innerText = cleanCmd;

    card.appendChild(titleDiv);
    card.appendChild(descDiv);
    card.appendChild(capDiv);

    return card;
  }

  function renderPageItems() {
    var grid = document.getElementById('cardsGrid');
    var paginationBar = document.getElementById('paginationBar');
    var topPagePill = document.getElementById('topPagePill');
    var pageIndicator = document.getElementById('pageIndicatorText');
    var btnPrev = document.getElementById('btnPrevPage');
    var btnNext = document.getElementById('btnNextPage');
    var hintEl = document.getElementById('activeCategoryHint');
    if (!grid) return;
    grid.innerHTML = '';

    var totalItems = currentFilteredCards.length;
    var totalPages = Math.ceil(totalItems / pageSize) || 1;

    if (currentCategoryPage > totalPages) currentCategoryPage = totalPages;
    if (currentCategoryPage < 1) currentCategoryPage = 1;

    if (totalItems === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px 12px;color:#a1a1aa;font-size:12px;font-weight:600;">No matching commands found</div>';
      if (paginationBar) paginationBar.style.display = 'none';
      if (topPagePill) topPagePill.style.display = 'none';
      return;
    }

    var startIdx = (currentCategoryPage - 1) * pageSize;
    var endIdx = Math.min(startIdx + pageSize, totalItems);
    var pageItems = currentFilteredCards.slice(startIdx, endIdx);

    pageItems.forEach(function(entry, idx) {
      grid.appendChild(createCardElement(entry.item, idx, entry.catBadge));
    });

    if (topPagePill) {
      topPagePill.style.display = 'inline-block';
      topPagePill.innerText = 'PAGE ' + currentCategoryPage + '/' + totalPages;
    }

    if (hintEl) {
      hintEl.innerText = totalPages > 1
        ? ((startIdx + 1) + '–' + endIdx + ' of ' + totalItems + ' commands')
        : (totalItems + ' commands · Tap to copy');
    }

    if (paginationBar) {
      paginationBar.style.display = totalPages > 1 ? 'flex' : 'none';
      if (pageIndicator) {
        pageIndicator.innerText = 'PAGE ' + currentCategoryPage + ' OF ' + totalPages + ' (' + totalItems + ' CMDS)';
      }
      if (btnPrev) {
        btnPrev.disabled = (currentCategoryPage <= 1);
      }
      if (btnNext) {
        btnNext.disabled = (currentCategoryPage >= totalPages);
      }
    }
  }

  function nextCategoryPage() {
    var totalPages = Math.ceil(currentFilteredCards.length / pageSize) || 1;
    if (currentCategoryPage < totalPages) {
      currentCategoryPage++;
      renderPageItems();
    }
  }

  function prevCategoryPage() {
    if (currentCategoryPage > 1) {
      currentCategoryPage--;
      renderPageItems();
    }
  }

  function renderCategory(catKey, filterText) {
    currentCatKey = catKey;
    currentQueryText = (filterText || '').trim().toLowerCase();
    var titleEl = document.getElementById('activeCategoryTitle');

    currentFilteredCards = [];

    if (catKey === 'all') {
      if (titleEl) {
        titleEl.innerText = currentQueryText ? ('SEARCH: ' + currentQueryText.toUpperCase()) : 'ALL COMMANDS DIRECTORY';
      }
      Object.keys(categories).forEach(function(key) {
        var cat = categories[key];
        cat.cards.forEach(function(item) {
          if (!currentQueryText ||
              (item.name && item.name.toLowerCase().indexOf(currentQueryText) !== -1) ||
              (item.desc && item.desc.toLowerCase().indexOf(currentQueryText) !== -1) ||
              (item.capsule && item.capsule.toLowerCase().indexOf(currentQueryText) !== -1)) {
            currentFilteredCards.push({
              item: item,
              catBadge: cat.shortLabel || cat.name.replace(/^[^\\s]+\\s*/, '')
            });
          }
        });
      });
    } else {
      var cat = categories[catKey];
      if (cat) {
        if (titleEl) {
          titleEl.innerText = cat.name.toUpperCase();
        }
        (cat.cards || []).forEach(function(item) {
          if (!currentQueryText ||
              (item.name && item.name.toLowerCase().indexOf(currentQueryText) !== -1) ||
              (item.desc && item.desc.toLowerCase().indexOf(currentQueryText) !== -1) ||
              (item.capsule && item.capsule.toLowerCase().indexOf(currentQueryText) !== -1)) {
            currentFilteredCards.push({
              item: item,
              catBadge: null
            });
          }
        });
      }
    }

    renderPageItems();
  }

  function renderHubGrid() {
    var hub = document.getElementById('hubGrid');
    if (!hub) return;
    hub.innerHTML = '';

    var keys = Object.keys(categories);
    keys.forEach(function(key, idx) {
      var cat = categories[key];
      var isOddLast = (keys.length % 2 === 1 && idx === keys.length - 1);
      var tile = document.createElement('div');
      tile.className = 'hub-tile' + (isOddLast ? ' hub-tile-wide' : '');
      tile.style.animationDelay = (idx * 20) + 'ms';
      tile.onclick = function() { openCategory(key); };

      var iconBox = document.createElement('div');
      iconBox.className = 'hub-icon-box';
      iconBox.innerText = cat.icon || '⚡';

      var textWrap = document.createElement('div');
      textWrap.className = 'hub-text';

      var name = document.createElement('div');
      name.className = 'hub-name';
      name.innerText = cat.shortLabel || cat.name.replace(/^[^\\s]+\\s*/, '');

      var count = document.createElement('div');
      count.className = 'hub-count';
      count.innerText = (cat.cards ? cat.cards.length : 0) + ' commands';

      textWrap.appendChild(name);
      textWrap.appendChild(count);

      var chevron = document.createElement('div');
      chevron.className = 'hub-chevron';
      chevron.innerHTML = '&rsaquo;';

      tile.appendChild(iconBox);
      tile.appendChild(textWrap);
      tile.appendChild(chevron);
      hub.appendChild(tile);
    });

    var allTile = document.createElement('div');
    allTile.className = 'hub-tile hub-tile-all';
    allTile.style.animationDelay = (keys.length * 20) + 'ms';
    allTile.onclick = function() { openCategory('all'); };

    var allIcon = document.createElement('div');
    allIcon.className = 'hub-icon-box';
    allIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    var allText = document.createElement('div');
    allText.className = 'hub-text';

    var allName = document.createElement('div');
    allName.className = 'hub-name';
    allName.innerText = 'Browse All 160+ Commands';

    var allCount = document.createElement('div');
    allCount.className = 'hub-count';
    allCount.innerText = 'Search & explore complete directory';

    allText.appendChild(allName);
    allText.appendChild(allCount);

    var allChevron = document.createElement('div');
    allChevron.className = 'hub-chevron';
    allChevron.innerHTML = '&rsaquo;';

    allTile.appendChild(allIcon);
    allTile.appendChild(allText);
    allTile.appendChild(allChevron);
    hub.appendChild(allTile);
  }

  function showCategoryHub() {
    currentCatKey = 'hub';
    currentCategoryPage = 1;
    var hubView = document.getElementById('categoryHubView');
    var detailView = document.getElementById('categoryDetailView');
    var search = document.getElementById('searchBox');
    if (search) search.value = '';

    if (hubView) hubView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';

    var master = document.getElementById('masterApp');
    if (master) master.scrollTop = 0;
  }

  function openCategory(catKey) {
    currentCatKey = catKey;
    currentCategoryPage = 1;
    var hubView = document.getElementById('categoryHubView');
    var detailView = document.getElementById('categoryDetailView');
    var search = document.getElementById('searchBox');
    if (search) search.value = '';

    if (hubView) hubView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';

    renderCategory(catKey);

    var master = document.getElementById('masterApp');
    if (master) master.scrollTop = 0;
  }

  function filterActiveCommands(val) {
    var query = (val || '').trim();
    var hubView = document.getElementById('categoryHubView');
    var detailView = document.getElementById('categoryDetailView');

    currentCategoryPage = 1;

    if (query.length > 0) {
      if (hubView) hubView.style.display = 'none';
      if (detailView) detailView.style.display = 'block';
      renderCategory('all', query);
    } else {
      if (currentCatKey === 'hub') {
        showCategoryHub();
      } else {
        renderCategory(currentCatKey);
      }
    }
  }

  // Initial render
  (function init() {
    renderHubGrid();
    if (currentCatKey && currentCatKey !== 'hub' && categories[currentCatKey]) {
      openCategory(currentCatKey);
    } else {
      showCategoryHub();
    }
  })();
</script>
`;
}

let masterMenuCache: {
  cacheKey: string;
  markup: string;
  rawPayload: any;
  timestamp: number;
} | null = null;

/**
 * Returns pre-built, ultra-fast cached master menu payload.
 * Skips 160-command template string concatenation, JSON serialization and base64 re-encoding,
 * allowing .menu card to be transmitted across WebSocket in under a second.
 */
export function getCachedMasterMenuPayload(data: {
  botName?: string;
  prefix?: string;
  plan?: string;
  ownerNumber?: string;
  uptime?: string;
  logoUrl?: string;
  headerBgUrl?: string;
  initialTab?: string;
  height?: number;
  isOwner?: boolean;
} = {}): { markup: string; rawPayload: any } {
  const p = data.prefix || '.';
  const botName = (data.botName || 'YASHI HALLS MINI').toUpperCase();
  const plan = (data.plan || 'MINI PLAN').toUpperCase();
  const height = data.height || 980;
  const isOwner = Boolean(data.isOwner);
  const cacheKey = `${botName}_${p}_${plan}_${height}_${isOwner ? 'owner' : 'user'}`;

  const now = Date.now();
  if (masterMenuCache && masterMenuCache.cacheKey === cacheKey && (now - masterMenuCache.timestamp < 60000)) {
    return masterMenuCache;
  }

  const markup = generateMasterInteractiveMenuHtml(data);
  const rawPayload = buildHtmlAppPayload(markup, {
    title: `👑 ${botName} • OFFICIAL MENU 👑`,
    height,
  });

  masterMenuCache = {
    cacheKey,
    markup,
    rawPayload,
    timestamp: now,
  };

  return masterMenuCache;
}

/**
 * Instantly invalidates master menu cache so changes made via .settings card
 * are immediately reflected when the user opens .menu card without delay.
 */
export function invalidateMasterMenuCache(): void {
  masterMenuCache = null;
}

/**
 * Legacy support for main neon menu
 */
export function generateYashiHallsNeonMenuHtml(data: {
  botName?: string;
  prefix?: string;
  plan?: string;
  ownerNumber?: string;
  uptime?: string;
  serverUrl?: string;
} = {}): string {
  return generateMasterInteractiveMenuHtml(data);
}

/**
 * Interactive In-Chat HTML App Card for Connected / Welcome Event
 * Sent when a user or customer connects to the WhatsApp Bot.
 */
export function generateConnectedWelcomeHtmlApp(data: {
  botName?: string;
  userName?: string;
  phoneNumber?: string;
  prefix?: string;
  plan?: string;
  channelUrl?: string;
  height?: number;
} = {}): string {
  const botName = data.botName || 'YASHI HALLS MINI';
  const userName = data.userName || 'Valued Customer';
  const phoneNumber = data.phoneNumber || 'Connected Number';
  const prefix = data.prefix || '.';
  const plan = data.plan || 'MINI PLAN';
  const channelUrl = data.channelUrl || 'https://whatsapp.com/channel/0029Vb927N4GJP8MS1yurM2Z';
  const totalHeight = data.height || 620;

  const logoSrc = EMBEDDED_BRAND_LOGO_BASE64;
  const headerBgSrc = EMBEDDED_HEADER_BG_BASE64;

  // Curated VIP Starter Commands (Download & AI tools removed as requested)
  const vipCmds = [
    { title: "MASTER MENU", desc: "160+ Commands Hub", cmd: `${prefix}menu`, icon: "📁", badge: "ALL FEATURES" },
    { title: "SPEED PING", desc: "Check Bot Latency", cmd: `${prefix}ping`, icon: "⚡", badge: "ULTRA FAST" },
    { title: "SYSTEM ALIVE", desc: "24/7 Health Check", cmd: `${prefix}alive`, icon: "🟢", badge: "24/7 ACTIVE" },
    { title: "OWNER SUPPORT", desc: "Direct VIP Contact", cmd: `${prefix}owner`, icon: "👑", badge: "VIP HELP" },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${escapeHtml(botName)} - VIP Connected & Welcome</title>
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }
  html, body {
    width: 100%;
    height: 100%;
    background-color: #0c0717;
    color: #ffffff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    user-select: none;
    -webkit-user-select: none;
    overflow-x: hidden;
    overflow-y: hidden;
  }
  @keyframes radarRipple {
    0% { transform: scale(0.9); opacity: 1; }
    50% { transform: scale(1.3); opacity: 0.5; }
    100% { transform: scale(0.9); opacity: 1; }
  }
  @keyframes logoPulse {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.7)); }
    50% { transform: scale(1.03); filter: drop-shadow(0 0 18px rgba(168, 85, 247, 0.85)); }
  }
  @keyframes borderShimmer {
    0% { border-color: #a855f7; box-shadow: 0 0 14px rgba(168, 85, 247, 0.35); }
    50% { border-color: #38bdf8; box-shadow: 0 0 20px rgba(56, 189, 248, 0.5); }
    100% { border-color: #a855f7; box-shadow: 0 0 14px rgba(168, 85, 247, 0.35); }
  }
  @keyframes celebratePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }
  @keyframes greetingShine {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes floatBadge {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .app-welcome {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 9px 10px 11px 10px;
    height: ${totalHeight}px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Header Card with Base64 background */
  .header-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(14, 5, 29, 0.75) 0%, rgba(22, 8, 43, 0.92) 100%), url('${headerBgSrc}') center/cover no-repeat;
    border: 1.5px solid #a855f7;
    border-radius: 14px;
    padding: 10px 10px 8px 10px;
    text-align: center;
    box-shadow: 0 6px 20px rgba(0,0,0,0.65), inset 0 0 20px rgba(139, 92, 246, 0.25);
  }
  .header-logo {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 2px solid #38bdf8;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.75), 0 0 26px rgba(168, 85, 247, 0.45);
    object-fit: cover;
    margin: 0 auto 4px auto;
    display: block;
    background: #110624;
    animation: logoPulse 3.5s ease-in-out infinite;
  }
  .header-brand {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: 0.8px;
    background: linear-gradient(90deg, #ffffff 0%, #f3e8ff 25%, #38bdf8 50%, #f3e8ff 75%, #ffffff 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 10px rgba(192, 132, 252, 0.75));
  }
  .header-sub {
    font-size: 9.5px;
    color: #e9d5ff;
    font-weight: 800;
    margin-top: 1px;
    letter-spacing: 0.5px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95);
  }
  .header-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d281a;
    border: 1.5px solid #22c55e;
    color: #4ade80;
    padding: 2.5px 10px;
    border-radius: 20px;
    font-size: 8.5px;
    font-weight: 800;
    margin-top: 3px;
    letter-spacing: 0.6px;
  }
  .dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    animation: radarRipple 1.6s ease-out infinite;
  }

  /* Animated VIP Customer Welcome Hero Section */
  .welcome-hero-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #2b0b4a 0%, #15062a 50%, #0d1e38 100%);
    border: 1.5px solid #a855f7;
    border-radius: 13px;
    padding: 10px 12px;
    text-align: center;
    animation: borderShimmer 3s ease-in-out infinite, celebratePulse 4s ease-in-out infinite;
    box-shadow: 0 6px 18px rgba(0,0,0,0.55);
  }
  .welcome-hero-card::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 65%);
    pointer-events: none;
  }
  .hero-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid #38bdf8;
    color: #38bdf8;
    border-radius: 14px;
    padding: 2px 9px;
    font-size: 8.5px;
    font-weight: 900;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    margin-bottom: 4px;
    animation: floatBadge 2.5s ease-in-out infinite;
  }
  .hero-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.5px;
    background: linear-gradient(90deg, #fbcfe8, #ffffff, #67e8f9, #ffffff, #fbcfe8);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: greetingShine 4s linear infinite;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
    line-height: 1.25;
  }
  .hero-sinhala-msg {
    font-size: 10px;
    font-weight: 700;
    color: #e2e8f0;
    line-height: 1.35;
    margin-top: 4px;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  }
  .hero-perk-row {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
  }
  .hero-perk-pill {
    background: rgba(14, 7, 25, 0.7);
    border: 1px solid #7c3aed;
    color: #c084fc;
    border-radius: 8px;
    padding: 2px 7px;
    font-size: 8px;
    font-weight: 800;
  }

  /* Connection Info Badges Grid */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
  }
  .info-pill {
    background: #18092d;
    border: 1.2px solid #581c87;
    border-radius: 9px;
    padding: 5px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .info-icon {
    font-size: 12px;
    line-height: 1;
  }
  .info-meta {
    overflow: hidden;
    text-align: left;
  }
  .info-meta-lbl {
    font-size: 7px;
    text-transform: uppercase;
    color: #a855f7;
    font-weight: 800;
    letter-spacing: 0.3px;
  }
  .info-meta-val {
    font-size: 9.5px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  /* VIP Core Command Cards (2x2 Grid) */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 1px 2px 4px 2px;
  }
  .section-title {
    font-size: 10.5px;
    font-weight: 900;
    color: #f3e8ff;
    letter-spacing: 0.8px;
    text-shadow: 0 0 8px rgba(168, 85, 247, 0.6);
  }
  .section-hint {
    font-size: 8px;
    color: #38bdf8;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .cmd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .cmd-card {
    position: relative;
    background: linear-gradient(145deg, #240f44, #130728);
    border: 1.3px solid #7c3aed;
    border-radius: 10px;
    padding: 7px 8px;
    text-align: center;
    cursor: pointer;
    transition: transform 0.14s ease, border-color 0.15s ease, background 0.15s ease;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 3px 10px rgba(0,0,0,0.45);
  }
  .cmd-card:active {
    background: #33155e;
    border-color: #38bdf8;
    transform: scale(0.96);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.6);
  }
  .cmd-title {
    font-size: 10.5px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 0.4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-desc {
    font-size: 8px;
    color: #c084fc;
    font-weight: 600;
    margin: 1px 0 3px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-badge {
    align-self: center;
    background: #130626;
    border: 1px solid #a855f7;
    color: #38bdf8;
    padding: 2px 7px;
    border-radius: 6px;
    font-size: 8px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-weight: 800;
  }

  /* Action Buttons */
  .actions-col {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .action-btn-main {
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.5px;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    border: 1.5px solid #a855f7;
    color: #ffffff;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .action-btn-main:active {
    transform: scale(0.97);
    background: #6d28d9;
  }
  .actions-sub-row {
    display: flex;
    gap: 6px;
  }
  .action-btn-sub {
    flex: 1;
    padding: 7px 10px;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.4px;
    background: linear-gradient(135deg, #1b0a33, #0f051f);
    border: 1.3px solid;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: all 0.15s ease;
  }
  .action-btn-sub:active {
    transform: scale(0.96);
  }
  .btn-ping {
    border-color: #38bdf8;
    color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  }
  .btn-owner {
    border-color: #eab308;
    color: #fde047;
    box-shadow: 0 0 8px rgba(234, 179, 8, 0.25);
  }
  .btn-channel {
    border-color: #22c55e;
    color: #4ade80;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.25);
    text-decoration: none;
    padding: 6px 10px;
    font-size: 9.5px;
  }

  /* Footer Brand */
  .footer-brand {
    text-align: center;
    font-size: 9.5px;
    font-weight: 900;
    letter-spacing: 1.2px;
    color: #38bdf8;
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.75);
    margin-top: 4px;
  }

  /* Toast notification */
  #toast {
    display: none;
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: #3b0764;
    border: 1.5px solid #38bdf8;
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.7);
    color: #ffffff;
    padding: 7px 16px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
    text-shadow: 0 0 6px #38bdf8;
  }
</style>
</head>
<body>
<div class="app-welcome">
  <div id="toast">Copied!</div>
  <textarea id="clipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <!-- Bot Header Card -->
  <div class="header-card">
    <img class="header-logo" src="${logoSrc}" alt="${escapeHtml(botName)}" loading="eager" onerror="this.onerror=null; this.src='${EMBEDDED_BRAND_LOGO_BASE64}';">
    <div class="header-brand">👑 ${escapeHtml(botName)} 👑</div>
    <div class="header-sub">⚡ ${escapeHtml(plan)}</div>
    <div class="header-pill">
      <span class="dot-pulse"></span>
      <span>24/7h ONLINE & ACTIVE</span>
    </div>
  </div>

  <!-- Animated VIP Customer Welcome Hero Showcase -->
  <div class="welcome-hero-card">
    <div class="hero-tag">✨ VIP CUSTOMER WELCOME ✨</div>
    <div class="hero-title">🎉 ආයුබෝවන්, ${escapeHtml(userName)}! 🎉</div>
    <div class="hero-sinhala-msg">
      ඔබගේ WhatsApp Bot සාර්ථකව සම්බන්ධ වී පැය 24 පුරාම සක්‍රිය විය! නිල Channel එකටද ඔබව ස්වයංක්‍රීයව සම්බන්ධ කර ඇත (Auto-Followed). ඔබේ එදිනෙදා වැඩ පහසු කරවන ප්‍රබල පහසුකම් 160+ කට වැඩි ප්‍රමාණයක් දැන් ඔබේ ඇඟිලි තුඩුවලටම සූදානම්!
    </div>
    <div class="hero-perk-row">
      <span class="hero-perk-pill">⚡ 24/7 Ultra-Fast</span>
      <span class="hero-perk-pill">🛡️ 100% Private</span>
      <span class="hero-perk-pill">👑 160+ Features</span>
      <span class="hero-perk-pill">📢 Channel Followed ✅</span>
    </div>
  </div>

  <!-- Connection Meta Grid -->
  <div class="info-grid">
    <div class="info-pill">
      <span class="info-icon">📱</span>
      <div class="info-meta">
        <div class="info-meta-lbl">NUMBER</div>
        <div class="info-meta-val">+${escapeHtml(phoneNumber)}</div>
      </div>
    </div>
    <div class="info-pill">
      <span class="info-icon">👑</span>
      <div class="info-meta">
        <div class="info-meta-lbl">CONNECTED USER</div>
        <div class="info-meta-val">${escapeHtml(userName)}</div>
      </div>
    </div>
    <div class="info-pill">
      <span class="info-icon">🔣</span>
      <div class="info-meta">
        <div class="info-meta-lbl">COMMAND PREFIX</div>
        <div class="info-meta-val">[ ${escapeHtml(prefix)} ]</div>
      </div>
    </div>
    <div class="info-pill">
      <span class="info-icon">⚡</span>
      <div class="info-meta">
        <div class="info-meta-lbl">SYSTEM STATUS</div>
        <div class="info-meta-val">Ready 24/7</div>
      </div>
    </div>
  </div>

  <!-- VIP Starter Command Touch Cards -->
  <div>
    <div class="section-header">
      <div class="section-title">🚀 QUICK START SHORTCUTS</div>
      <div class="section-hint">⚡ 1-TAP TOUCH TO COPY</div>
    </div>
    <div class="cmd-grid">
      ${vipCmds.map(c => `
      <div class="cmd-card" onclick="copyCmd('${c.cmd}')">
        <div class="cmd-title">${c.icon} ${escapeHtml(c.title)}</div>
        <div class="cmd-desc">${escapeHtml(c.desc)}</div>
        <div class="cmd-badge">📋 ${escapeHtml(c.cmd.trim())}</div>
      </div>
      `).join('')}
    </div>
  </div>

  <!-- Actions -->
  <div class="actions-col">
    <button class="action-btn-main" onclick="copyCmd('${prefix}menu')">
      <span>📂</span>
      <span>COPY ${prefix}menu TO OPEN MASTER HUB</span>
    </button>
    <div class="actions-sub-row">
      <button class="action-btn-sub btn-ping" onclick="copyCmd('${prefix}ping')">
        <span>⚡ SPEED PING</span>
      </button>
      <button class="action-btn-sub btn-owner" onclick="copyCmd('${prefix}owner')">
        <span>👑 CONTACT OWNER</span>
      </button>
      <a class="action-btn-sub btn-channel" href="${channelUrl}">
        <span>📢 CHANNEL</span>
      </a>
    </div>
  </div>

  <!-- Footer Branding -->
  <div class="footer-brand">
    ⚡ POWERED BY YASHI HALLS ⚡
  </div>
</div>

<script>
function showToast(text) {
  var t = document.getElementById("toast");
  if (!t) return;
  t.textContent = text;
  t.style.display = "block";
  clearTimeout(window.__tTimer);
  window.__tTimer = setTimeout(function() {
    t.style.display = "none";
  }, 1800);
}

function copyCmd(cmd) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(function() {
      showToast("Copied: " + cmd);
    }).catch(function() {
      fallbackCopy(cmd);
    });
    return;
  }
  fallbackCopy(cmd);
}

function fallbackCopy(text) {
  var sink = document.getElementById("clipSink");
  if (!sink) return;
  sink.value = text;
  sink.select();
  try {
    document.execCommand("copy");
    showToast("Copied: " + text);
  } catch(e) {
    showToast("Copied: " + text);
  }
}
</script>
</body>
</html>`;
}

/**
 * User provided interactive interactive HTML menu for .test1 command
 */
export const YASHI_USER_TEST1_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YASHI HALLS MINI</title>
<style>
* {
margin: 0;
padding: 0;
box-sizing: border-box;
}

body {
font-family: Arial, sans-serif;
background: #10111b;
color: #fff;
padding: 16px 12px;
user-select: none;
-webkit-user-select: none;
}

.container {
max-width: 480px;
margin: auto;
}

.header {
background: linear-gradient(135deg, #242044, #171a31);
border: 1px solid #39315f;
border-radius: 20px;
padding: 20px 14px;
text-align: center;
box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.logo {
width: 80px;
height: 80px;
border-radius: 50%;
object-fit: cover;
border: 3px solid #a78bfa;
margin-bottom: 10px;
box-shadow: 0 0 15px rgba(167, 139, 250, 0.5);
}

.header h1 {
font-size: 20px;
letter-spacing: 1px;
color: #f3e8ff;
}

.header p {
color: #aaa6c7;
font-size: 11.5px;
margin-top: 6px;
}

.status {
display: inline-block;
background: #173d32;
color: #62e6a1;
padding: 6px 14px;
border-radius: 20px;
font-size: 10.5px;
font-weight: bold;
margin-top: 12px;
border: 1px solid #22c55e44;
}

.stats {
display: grid;
grid-template-columns: repeat(3, 1fr);
gap: 9px;
margin: 14px 0;
}

.stat {
background: #1c1d2d;
border: 1px solid #303149;
padding: 12px 4px;
border-radius: 14px;
text-align: center;
}

.stat h2 {
color: #b69aff;
font-size: 18px;
font-weight: bold;
}

.stat p {
font-size: 9.5px;
color: #aaa;
margin-top: 4px;
}

.heading {
font-size: 14px;
margin: 18px 3px 10px;
color: #d6c9ff;
font-weight: bold;
letter-spacing: 0.5px;
}

.categories {
display: grid;
grid-template-columns: repeat(2, 1fr);
gap: 10px;
}

.category {
background: linear-gradient(145deg, #292443, #1b2037);
border: 1px solid #49406d;
border-radius: 15px;
padding: 16px 12px;
text-align: left;
color: white;
cursor: pointer;
transition: 0.2s;
}

.category:active,
.category.active {
background: linear-gradient(145deg, #6341a5, #34306b);
border-color: #b69aff;
transform: scale(0.98);
box-shadow: 0 0 12px rgba(182, 154, 255, 0.4);
}

.category-icon {
font-size: 25px;
margin-bottom: 9px;
}

.category h3 {
font-size: 13.5px;
margin-bottom: 5px;
color: #f5f3ff;
}

.category p {
font-size: 9.5px;
color: #c1badb;
line-height: 1.3;
}

.submenu {
display: none;
background: #1b1c2b;
border: 1px solid #49406d;
border-radius: 16px;
padding: 14px;
margin-top: 14px;
animation: show 0.25s ease;
box-shadow: 0 4px 18px rgba(0,0,0,0.4);
}

.submenu.show {
display: block;
}

@keyframes show {
from {
opacity: 0;
transform: translateY(-7px);
}
to {
opacity: 1;
transform: translateY(0);
}
}

.submenu h3 {
color: #cbb8ff;
font-size: 14px;
margin-bottom: 10px;
font-weight: bold;
}

.command {
background: #27263c;
border: 1px solid #383450;
border-radius: 9px;
padding: 10px 12px;
margin-top: 7px;
font-size: 12.5px;
color: #eee9ff;
font-family: ui-monospace, monospace;
}

.command span {
color: #b69aff;
font-weight: bold;
margin-right: 8px;
}

.footer {
text-align: center;
padding: 20px 5px 12px;
font-size: 9.5px;
color: #8f8aa7;
line-height: 1.7;
font-weight: bold;
}
</style>
</head>
<body>
<div class="container">
<div class="header">
    <img
    src="https://i.ibb.co/n2fYpDV/file-000000007c3c8210ae1b96d28b22c655.png"
    class="logo"
    alt="YASHI HALLS"
    referrerpolicy="no-referrer"
    onerror="this.src='https://i.ibb.co/n2fYpDV/file-000000007c3c8210ae1b96d28b22c655.png'">

    <h1>👑 YASHI HALLS MINI</h1>
    <p>WhatsApp Assistant • MINI PLAN</p>

    <div class="status">● MENU PREVIEW</div>
</div>

<div class="stats">
    <div class="stat">
        <h2>06</h2>
        <p>Categories</p>
    </div>
    <div class="stat">
        <h2>24+</h2>
        <p>Commands</p>
    </div>
    <div class="stat">
        <h2>24/7</h2>
        <p>Assistant</p>
    </div>
</div>

<h3 class="heading">📂 MAIN MENU</h3>

<div class="categories">

    <button class="category" onclick="openMenu('download',this)">
        <div class="category-icon">📥</div>
        <h3>Downloads</h3>
        <p>Music, Videos & Social Media</p>
    </button>

    <button class="category" onclick="openMenu('ai',this)">
        <div class="category-icon">🤖</div>
        <h3>AI Tools</h3>
        <p>Artificial Intelligence</p>
    </button>

    <button class="category" onclick="openMenu('group',this)">
        <div class="category-icon">👥</div>
        <h3>Group Tools</h3>
        <p>Admin & Protection</p>
    </button>

    <button class="category" onclick="openMenu('games',this)">
        <div class="category-icon">🎮</div>
        <h3>Games</h3>
        <p>Fun & Entertainment</p>
    </button>

    <button class="category" onclick="openMenu('profile',this)">
        <div class="category-icon">👤</div>
        <h3>Profile</h3>
        <p>Account & Status</p>
    </button>

    <button class="category" onclick="openMenu('settings',this)">
        <div class="category-icon">⚙️</div>
        <h3>Settings</h3>
        <p>Bot Configuration</p>
    </button>

</div>

<div class="submenu" id="submenu">
    <h3 id="submenuTitle"></h3>
    <div id="submenuCommands"></div>
</div>

<div class="footer">
    👑 YASHI HALLS MINI<br>
    MINI PLAN • WHATSAPP ASSISTANT<br>
    POWERED BY YASHI HALLS
</div>
</div>
<script>
const menus = {
download: {
title: "📥 DOWNLOAD MENU",
commands: [
".song",
".video",
".play",
".audio",
".ytsearch",
".tt",
".fb",
".ig",
".twitter",
".apk",
".lyrics"
]
},

ai: {
title: "🤖 AI TOOLS MENU",
commands: [
".ai",
".gemini",
".imagine",
".translate",
".write",
".code",
".ocr",
".transcribe"
]
},

group: {
title: "👥 GROUP TOOLS MENU",
commands: [
".kick",
".add",
".promote",
".demote",
".mute",
".unmute",
".antilink",
".warn",
".link"
]
},

games: {
title: "🎮 GAMES MENU",
commands: [
".quiz",
".guess",
".slot",
".tictactoe"
]
},

profile: {
title: "👤 PROFILE MENU",
commands: [
".me",
".status",
".setstatus",
".setdp",
".setname",
".setbio"
]
},

settings: {
title: "⚙️ SETTINGS MENU",
commands: [
".menu",
".ping",
".alive",
".owner",
".public",
".private",
".restart"
]
}
};

function openMenu(name, element) {
const submenu = document.getElementById("submenu");
const title = document.getElementById("submenuTitle");
const commands = document.getElementById("submenuCommands");

if (element.classList.contains("active")) {
element.classList.remove("active");
submenu.classList.remove("show");
return;
}

document.querySelectorAll(".category").forEach(card => {
card.classList.remove("active");
});

element.classList.add("active");

title.textContent = menus[name].title;
commands.innerHTML = "";

menus[name].commands.forEach((command, index) => {
const item = document.createElement("div");
item.className = "command";

const number = String(index + 1).padStart(2, "0");
item.innerHTML = "<span>" + number + ".</span> " + command;

commands.appendChild(item);
});

submenu.classList.add("show");
}
</script>
</body>
</html>`;

export interface GroupWelcomeOptions {
  userPhone: string;
  groupName: string;
  botName?: string;
  prefix?: string;
  memberCount?: number;
}

export interface GroupGoodbyeOptions {
  userPhone: string;
  groupName: string;
  botName?: string;
  prefix?: string;
  memberCount?: number;
}

/**
 * Generates interactive Cyberpunk HUD Animated Welcome Card when a new member joins a WhatsApp Group
 */
export function generateGroupWelcomeHtmlApp(options: GroupWelcomeOptions): string {
  const userPhone = escapeHtml(options.userPhone || 'User');
  const groupName = escapeHtml(options.groupName || 'Group Chat');
  const botName = escapeHtml(options.botName || 'YASHI HALLS');
  const memberCount = options.memberCount ? options.memberCount : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Group Welcome</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060913;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      min-height: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
    }

    @keyframes pulseGlow {
      0%, 100% { box-shadow: 0 0 25px rgba(168, 85, 247, 0.45), 0 0 45px rgba(59, 130, 246, 0.35); }
      50% { box-shadow: 0 0 40px rgba(168, 85, 247, 0.75), 0 0 70px rgba(59, 130, 246, 0.65); }
    }

    @keyframes floatParticle {
      0% { transform: translateY(0px) opacity(0.8); }
      50% { transform: translateY(-8px) opacity(1); }
      100% { transform: translateY(0px) opacity(0.8); }
    }

    .card-container {
      width: 100%;
      max-width: 440px;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(168, 85, 247, 0.5);
      border-radius: 24px;
      padding: 24px 20px;
      backdrop-filter: blur(16px);
      animation: pulseGlow 4s infinite ease-in-out;
      position: relative;
      overflow: hidden;
      text-align: center;
    }

    .header-ring {
      width: 78px;
      height: 78px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: linear-gradient(135deg, #a855f7, #3b82f6, #ec4899);
      padding: 3px;
      position: relative;
    }

    .header-icon-inner {
      width: 100%;
      height: 100%;
      background: #0a0e1a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      animation: floatParticle 3s infinite ease-in-out;
    }

    .welcome-title {
      font-size: 20px;
      font-weight: 800;
      background: linear-gradient(90deg, #c084fc, #60a5fa, #f472b6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(168, 85, 247, 0.18);
      border: 1px solid rgba(168, 85, 247, 0.45);
      color: #e9d5ff;
      padding: 6px 16px;
      border-radius: 30px;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 14px;
    }

    .welcome-msg-box {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(59, 130, 246, 0.12));
      border: 1px solid rgba(168, 85, 247, 0.3);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
    }

    .sinhala-text {
      color: #f1f5f9;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .english-text {
      color: #94a3b8;
      font-size: 12px;
    }

    .info-grid {
      background: rgba(2, 6, 23, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 12px 14px;
      text-align: left;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
      font-size: 13px;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: #64748b;
      font-weight: 600;
    }

    .info-val {
      color: #f1f5f9;
      font-weight: 700;
    }

    .footer-brand {
      margin-top: 14px;
      font-size: 11px;
      color: #64748b;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="header-ring">
      <div class="header-icon-inner">🎉</div>
    </div>
    
    <div class="welcome-title">WELCOME TO THE GROUP!</div>

    <div class="user-pill">
      <span>👤</span>
      <span>+${userPhone}</span>
    </div>

    <div class="welcome-msg-box">
      <div class="sinhala-text">🌸 සාදරයෙන් පිළිගනිමු! ඔබව අපගේ ${groupName} සමූහයට ඉතා ආදරයෙන් පිළිගන්නෙමු. 😊</div>
      <div class="english-text">Welcome to our community! We are super thrilled to have you with us.</div>
    </div>

    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">👥 Group Name:</span>
        <span class="info-val">${groupName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">👤 New Member:</span>
        <span class="info-val">+${userPhone}</span>
      </div>
      ${memberCount ? `<div class="info-row"><span class="info-label">📊 Group Size:</span><span class="info-val">${memberCount} Members</span></div>` : ''}
    </div>

    <div class="footer-brand">⚡ POWERED BY ${botName} 24/7 ENGINE ⚡</div>
  </div>
</body>
</html>`;
}

/**
 * Generates interactive Cyberpunk HUD Animated Goodbye Card when a member leaves a WhatsApp Group
 */
export function generateGroupGoodbyeHtmlApp(options: GroupGoodbyeOptions): string {
  const userPhone = escapeHtml(options.userPhone || 'User');
  const groupName = escapeHtml(options.groupName || 'Group Chat');
  const botName = escapeHtml(options.botName || 'YASHI HALLS');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Group Goodbye</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090611;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 16px;
      min-height: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
    }

    @keyframes pulseCrimson {
      0%, 100% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.45), 0 0 45px rgba(245, 158, 11, 0.35); }
      50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.75), 0 0 70px rgba(245, 158, 11, 0.65); }
    }

    @keyframes floatParticle {
      0% { transform: translateY(0px) opacity(0.8); }
      50% { transform: translateY(-8px) opacity(1); }
      100% { transform: translateY(0px) opacity(0.8); }
    }

    .card-container {
      width: 100%;
      max-width: 440px;
      background: rgba(24, 15, 28, 0.88);
      border: 1px solid rgba(239, 68, 68, 0.5);
      border-radius: 24px;
      padding: 24px 20px;
      backdrop-filter: blur(16px);
      animation: pulseCrimson 4s infinite ease-in-out;
      position: relative;
      overflow: hidden;
      text-align: center;
    }

    .header-ring {
      width: 78px;
      height: 78px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ef4444, #f59e0b, #ec4899);
      padding: 3px;
      position: relative;
    }

    .header-icon-inner {
      width: 100%;
      height: 100%;
      background: #150a16;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      animation: floatParticle 3s infinite ease-in-out;
    }

    .goodbye-title {
      font-size: 20px;
      font-weight: 800;
      background: linear-gradient(90deg, #f87171, #fbbf24, #f472b6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(239, 68, 68, 0.18);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
      padding: 6px 16px;
      border-radius: 30px;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 14px;
    }

    .farewell-msg-box {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.12));
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
    }

    .sinhala-text {
      color: #f5f5f4;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .english-text {
      color: #a8a29e;
      font-size: 12px;
    }

    .info-grid {
      background: rgba(15, 6, 18, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 12px 14px;
      text-align: left;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
      font-size: 13px;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: #78716c;
      font-weight: 600;
    }

    .info-val {
      color: #f5f5f4;
      font-weight: 700;
    }

    .footer-brand {
      margin-top: 14px;
      font-size: 11px;
      color: #78716c;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card-container">
    <div class="header-ring">
      <div class="header-icon-inner">👋</div>
    </div>
    
    <div class="goodbye-title">MEMBER LEFT THE GROUP</div>

    <div class="user-pill">
      <span>👤</span>
      <span>+${userPhone}</span>
    </div>

    <div class="farewell-msg-box">
      <div class="sinhala-text">🕊️ නැවත හමුවෙමු! ඔබගේ ඉදිරි ගමනට සුබ පතන්නෙමු. 💔</div>
      <div class="english-text">Goodbye & best wishes on your journey ahead! Hope to see you back soon.</div>
    </div>

    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">👥 Group Name:</span>
        <span class="info-val">${groupName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">👤 Departed Member:</span>
        <span class="info-val">+${userPhone}</span>
      </div>
    </div>

    <div class="footer-brand">⚡ POWERED BY ${botName} 24/7 ENGINE ⚡</div>
  </div>
</body>
</html>`;
}

export interface BusinessCatalogHtmlItem {
  id: string;
  name: string;
  category: string;
  platform: 'android' | 'ios' | 'pc' | 'android_ios' | 'glory_bot' | string;
  price: string;
  packages?: Array<{ id: string; days: string; price: string }>;
  subtitle?: string;
  imageDataUri?: string;
  inStock: boolean;
  verified: boolean;
  command: string;
}

export function calculateBusinessCatalogHtmlHeight(
  categories: string[] = [],
  products: Array<{ category: string }> = []
): number {
  const orderedCats = Array.from(
    new Set([...(categories || []), ...(products || []).map((p) => p.category)])
  ).filter((cat) => (products || []).some((p) => p.category === cat));
  const totalRows = orderedCats.reduce((sum, cat) => {
    const count = (products || []).filter((p) => p.category === cat).length;
    return sum + Math.ceil(count / 2);
  }, 0);
  // Header + filter bar + per-category header + generous per-row card height + footer
  const calc = 230 + orderedCats.length * 50 + totalRows * 295 + 160;
  return Math.max(1600, calc);
}

export function generateBusinessCatalogHtmlApp(options: {
  storeName?: string;
  prefix?: string;
  categories: string[];
  products: BusinessCatalogHtmlItem[];
  height?: number;
}): string {
  const storeName = (options.storeName || 'YASHI BUSINESS STORE').toUpperCase();
  const prefix = options.prefix || '.';
  const products = Array.isArray(options.products) ? options.products : [];
  const height = options.height || calculateBusinessCatalogHtmlHeight(options.categories || [], products);

  const platformBadgeMap: Record<string, { label: string; color: string; bg: string }> = {
    android: { label: '🤖 ANDROID', color: '#4ade80', bg: 'rgba(34,197,94,0.18)' },
    ios: { label: '🍎 iOS', color: '#f472b6', bg: 'rgba(236,72,153,0.18)' },
    pc: { label: '💻 PC', color: '#38bdf8', bg: 'rgba(56,189,248,0.18)' },
    android_ios: { label: '📱 AND+iOS', color: '#c084fc', bg: 'rgba(168,85,247,0.2)' },
    glory_bot: { label: '🔥 GLORY', color: '#fbbf24', bg: 'rgba(245,158,11,0.2)' },
  };

  const hasPlatform = (plat: string) => products.some((p) => p.platform === plat);
  const filterTabs = [
    { id: 'all', label: `🌟 ALL (${products.length})` },
    ...(hasPlatform('android') ? [{ id: 'android', label: '🤖 ANDROID' }] : []),
    ...(hasPlatform('ios') ? [{ id: 'ios', label: '🍎 iOS' }] : []),
    ...(hasPlatform('pc') ? [{ id: 'pc', label: '💻 PC' }] : []),
    ...(hasPlatform('android_ios') ? [{ id: 'android_ios', label: '📱 AND+iOS' }] : []),
    ...(hasPlatform('glory_bot') ? [{ id: 'glory_bot', label: '🔥 GLORY' }] : []),
  ];

  const orderedCats = Array.from(
    new Set([...(options.categories || []), ...products.map((p) => p.category)])
  ).filter((cat) => products.some((p) => p.category === cat));

  const sectionsHtml = orderedCats
    .map((cat) => {
      const catProducts = products.filter((p) => p.category === cat);
      const cardsHtml = catProducts
        .map((p) => {
          const pInfo = platformBadgeMap[p.platform] || {
            label: String(p.platform || 'MOBILE').toUpperCase(),
            color: '#c084fc',
            bg: 'rgba(168,85,247,0.18)',
          };
          const cmdRaw = p.command
            ? p.command.startsWith('.')
              ? `${prefix}${p.command.slice(1)}`
              : p.command.startsWith(prefix)
              ? p.command
              : `${prefix}${p.command}`
            : `${prefix}${p.id}`;
          const cmdAttr = escapeHtml(cmdRaw);
          const pkgCount = Array.isArray(p.packages) ? p.packages.length : 0;
          const priceLine =
            pkgCount > 0
              ? `From ${escapeHtml(p.price)} • ${pkgCount} Plan${pkgCount > 1 ? 's' : ''}`
              : `${escapeHtml(p.price)}`;
          const stockHtml = p.inStock
            ? `<span class="stock-on">● IN STOCK</span>`
            : `<span class="stock-off">● OUT</span>`;
          const thumbHtml = p.imageDataUri
            ? `<div class="card-img-wrap"><img class="card-img" src="${escapeHtml(p.imageDataUri)}" alt="${escapeHtml(p.name)}" /></div>`
            : `<div class="card-img-wrap card-img-empty"><div class="card-img-ph">🛡️</div></div>`;

          return `
        <div class="panel-card${p.inStock ? '' : ' is-oos'}" data-platform="${escapeHtml(p.platform)}" data-cmd="${cmdAttr}" onclick="copyPanelCmd(this)">
          <div class="card-body-top">
            <div class="card-top">
              <span class="plat-pill" style="color:${pInfo.color};background:${pInfo.bg};border:1px solid ${pInfo.color}44;">${pInfo.label}</span>
              ${stockHtml}
            </div>
            ${thumbHtml}
            <div class="panel-name">${p.verified ? '✓ ' : ''}${escapeHtml(p.name)}</div>
            <div class="panel-sub">${p.subtitle ? escapeHtml(p.subtitle) : 'Verified Official Panel'}</div>
          </div>
          <div class="card-body-bottom">
            <div class="panel-price">🏷️ ${priceLine}</div>
            <div class="cmd-badge">📋 ${cmdAttr}</div>
          </div>
        </div>`;
        })
        .join('');

      return `
      <div class="cat-block" data-cat="${escapeHtml(cat)}">
        <div class="cat-header">
          <span class="cat-line"></span>
          <span class="cat-name">${escapeHtml(cat)}</span>
          <span class="cat-line"></span>
        </div>
        <div class="cards-grid">${cardsHtml}</div>
      </div>`;
    })
    .join('');

  const tabsHtml = filterTabs
    .map(
      (t, i) =>
        `<button type="button" class="ftab${i === 0 ? ' active' : ''}" data-filter="${escapeHtml(t.id)}" onclick="filterPlatform('${escapeHtml(t.id)}', this)">${escapeHtml(t.label)}</button>`
    )
    .join('');

  return `
<style>
  @keyframes toastSlide {
    0% { opacity: 0; transform: translate(-50%, -10px) scale(0.92); }
    15% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    85% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
  }
  .biz-wrap {
    box-sizing: border-box;
    width: 100%;
    min-height: ${height}px;
    height: auto;
    background: linear-gradient(165deg, #0b0718 0%, #120d26 55%, #09111f 100%);
    color: #f8fafc;
    padding: 12px 10px 26px 10px;
    border: 1px solid rgba(217, 70, 239, 0.45);
    border-radius: 14px;
    overflow-x: hidden;
    overflow-y: visible;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    position: relative;
  }
  .biz-header {
    text-align: center;
    padding: 8px 6px 10px 6px;
    border-bottom: 1px solid rgba(168, 85, 247, 0.28);
    margin-bottom: 10px;
  }
  .biz-title {
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0.7px;
    color: #f5d0fe;
    text-shadow: 0 0 12px rgba(217, 70, 239, 0.65);
    margin-bottom: 4px;
  }
  .biz-sub {
    font-size: 11px;
    color: #67e8f9;
    font-weight: 600;
    line-height: 1.35;
  }
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    margin-bottom: 14px;
    background: rgba(11, 7, 24, 0.95);
    padding: 7px 5px;
    border-radius: 10px;
    border: 1px solid rgba(139, 92, 246, 0.35);
  }
  .ftab {
    background: #1a1233;
    border: 1px solid #4c1d95;
    color: #cbd5e1;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 10.5px;
    font-weight: 800;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .ftab.active {
    background: linear-gradient(90deg, #c026d3, #7c3aed);
    border-color: #f0abfc;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(217, 70, 239, 0.55);
  }
  .cat-block {
    margin-bottom: 16px;
  }
  .cat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 0 10px 0;
  }
  .cat-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(217, 70, 239, 0.65), transparent);
  }
  .cat-name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #f0abfc;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .panel-card {
    box-sizing: border-box;
    background: linear-gradient(180deg, #1a1333 0%, #130e26 100%);
    border: 1px solid #432b78;
    border-radius: 13px;
    padding: 9px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    overflow: hidden;
  }
  .panel-card.is-oos {
    opacity: 0.72;
    border-color: rgba(244, 63, 94, 0.5);
  }
  .panel-card:active {
    transform: scale(0.97);
    border-color: #22d3ee;
    background: #241947;
  }
  .card-body-top {
    display: flex;
    flex-direction: column;
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    margin-bottom: 7px;
  }
  .plat-pill {
    font-size: 8.5px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stock-on {
    font-size: 8.5px;
    font-weight: 800;
    color: #34d399;
    white-space: nowrap;
  }
  .stock-off {
    font-size: 8.5px;
    font-weight: 800;
    color: #fb7185;
    white-space: nowrap;
  }
  .card-img-wrap {
    width: 100%;
    height: 104px;
    border-radius: 9px;
    overflow: hidden;
    background: #0d081d;
    border: 1px solid rgba(168, 85, 247, 0.32);
    margin-bottom: 8px;
  }
  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .card-img-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1b1138 0%, #100b22 100%);
  }
  .card-img-ph {
    font-size: 28px;
    opacity: 0.55;
  }
  .panel-name {
    font-size: 12.5px;
    font-weight: 900;
    color: #ffffff;
    line-height: 1.28;
    margin-bottom: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .panel-sub {
    font-size: 9.5px;
    color: #94a3b8;
    margin-bottom: 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-body-bottom {
    display: flex;
    flex-direction: column;
    margin-top: auto;
  }
  .panel-price {
    font-size: 11px;
    font-weight: 800;
    color: #34d399;
    margin-bottom: 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cmd-badge {
    display: block;
    text-align: center;
    background: linear-gradient(90deg, rgba(6, 182, 212, 0.16), rgba(168, 85, 247, 0.2));
    border: 1px solid #22d3ee;
    color: #a5f3fc;
    border-radius: 8px;
    padding: 6px 6px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    box-shadow: 0 0 10px rgba(6, 182, 212, 0.22);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tip-box {
    margin-top: 12px;
    padding: 9px 10px;
    border-radius: 10px;
    background: rgba(6, 182, 212, 0.12);
    border: 1px solid rgba(34, 211, 238, 0.38);
    font-size: 10.5px;
    color: #cffafe;
    text-align: center;
    line-height: 1.4;
  }
  .biz-footer {
    text-align: center;
    font-size: 9px;
    letter-spacing: 1.2px;
    color: #a855f7;
    margin-top: 10px;
    font-weight: 800;
  }
  #bizToast {
    display: none;
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1035;
    border: 1px solid #22d3ee;
    box-shadow: 0 0 18px rgba(34, 211, 238, 0.6);
    color: #ecfeff;
    padding: 7px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 800;
    z-index: 9999;
    pointer-events: none;
    white-space: nowrap;
  }
</style>

<div class="biz-wrap">
  <div id="bizToast">Copied!</div>
  <textarea id="bizClipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <div class="biz-header">
    <div class="biz-title">🛍️ ${escapeHtml(storeName)}</div>
    <div class="biz-sub">කැමති Panel එක ටච් කර Command එක Copy කරගෙන Chat එකේ Send කරන්න 👇</div>
  </div>

  <div class="filter-bar">
    ${tabsHtml}
  </div>

  <div id="catalogRoot">
    ${sectionsHtml}
  </div>

  <div class="tip-box">
    💡 Command එක Copy කර Chat එකේ Send කළ විට එම Panel එකේ <b>Days සහ Price</b> වෙනම පෙන්වයි!
  </div>
  <div class="biz-footer">${escapeHtml(storeName)} • OFFICIAL PANEL CATALOG</div>
</div>

<script>
  var bizToastTimer = null;
  function showBizToast(text) {
    var t = document.getElementById('bizToast');
    if (!t) return;
    t.innerText = text;
    t.style.display = 'block';
    t.style.animation = 'none';
    void t.offsetHeight;
    t.style.animation = 'toastSlide 1.8s ease forwards';
    if (bizToastTimer) clearTimeout(bizToastTimer);
    bizToastTimer = setTimeout(function() { t.style.display = 'none'; }, 1800);
  }

  function copyPanelCmd(el) {
    if (!el) return;
    var cmd = el.getAttribute('data-cmd') || '';
    if (!cmd) return;
    el.style.borderColor = '#22d3ee';
    el.style.background = '#24184a';
    setTimeout(function() {
      el.style.borderColor = '';
      el.style.background = '';
    }, 350);

    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(function() {
        showBizToast('Copied: ' + cmd + ' — Send in chat!');
      }).catch(function() {
        bizFallbackCopy(cmd);
      });
    } else {
      bizFallbackCopy(cmd);
    }
  }

  function bizFallbackCopy(cmd) {
    try {
      var sink = document.getElementById('bizClipSink');
      if (sink) {
        sink.value = cmd;
        sink.select();
        sink.setSelectionRange(0, 99999);
        var ok = document.execCommand('copy');
        showBizToast(ok ? ('Copied: ' + cmd + ' — Send in chat!') : ('Send: ' + cmd));
      } else {
        showBizToast('Send: ' + cmd);
      }
    } catch (e) {
      showBizToast('Send: ' + cmd);
    }
  }

  function filterPlatform(plat, btn) {
    var tabs = document.querySelectorAll('.ftab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove('active');
    }
    if (btn) btn.classList.add('active');

    var cats = document.querySelectorAll('.cat-block');
    for (var c = 0; c < cats.length; c++) {
      var cards = cats[c].querySelectorAll('.panel-card');
      var visibleCount = 0;
      for (var j = 0; j < cards.length; j++) {
        var cardPlat = cards[j].getAttribute('data-platform') || '';
        var show = (plat === 'all') || (cardPlat === plat);
        cards[j].style.display = show ? 'flex' : 'none';
        if (show) visibleCount++;
      }
      cats[c].style.display = visibleCount > 0 ? 'block' : 'none';
    }
  }
</script>`;
}

export interface FilmQualityOptionButton {
  label: string;
  size: string;
  copyCommand: string;
}

export interface FilmDetailsCardOptions {
  botName?: string;
  title: string;
  year?: string;
  language?: string;
  genre?: string;
  hasSinhalaSub?: boolean;
  quality?: string;
  fileSize?: string;
  source?: string;
  posterSrc?: string;
  synopsis?: string;
  prefix?: string;
  qualityButtons?: FilmQualityOptionButton[];
  height?: number;
  // Unified downloader customization fields (keeps Film defaults intact)
  brandSection?: string;
  badgeText?: string;
  mediaIcon?: string;
  chip1Text?: string;
  chip2Text?: string;
  chip3Text?: string;
  askTitle?: string;
  askSubtitle?: string;
  showAskBox?: boolean;
}

/**
 * Generates crisp full-width branded SVG banner Data URI when a platform URL lacks an image thumbnail
 */
export function buildPlatformBannerDataUri(platform: string, subtitle = 'YASHI HALLS MEDIA ENGINE'): string {
  const key = (platform || 'MEDIA').toUpperCase();
  let c1 = '#b8860b';
  let c2 = '#18181b';
  let badge = 'YASHI HALLS';
  let glyph = '▶';
  let sub = 'HIGH-SPEED DIRECT DOWNLOAD';

  if (key.includes('TIKTOK') || key === 'TT') {
    c1 = '#fe2c55';
    c2 = '#25f4ee';
    badge = 'TIKTOK REELS';
    glyph = '♪';
    sub = 'NO WATERMARK • HD MP4';
  } else if (key.includes('YOUTUBE') || key === 'YT' || key === 'VIDEO') {
    c1 = '#dc2626';
    c2 = '#7f1d1d';
    badge = 'YOUTUBE STUDIO';
    glyph = '▶';
    sub = 'HD VIDEO & STREAM';
  } else if (key.includes('FACEBOOK') || key === 'FB') {
    c1 = '#1877f2';
    c2 = '#0f3f8a';
    badge = 'FACEBOOK WATCH';
    glyph = 'f';
    sub = 'HD REELS & VIDEOS';
  } else if (key.includes('INSTAGRAM') || key === 'IG') {
    c1 = '#d946ef';
    c2 = '#f97316';
    badge = 'INSTAGRAM REELS';
    glyph = '◎';
    sub = 'REELS • STORIES • HD';
  } else if (key.includes('TWITTER') || key === 'X') {
    c1 = '#38bdf8';
    c2 = '#0f172a';
    badge = 'X / TWITTER HD';
    glyph = '𝕏';
    sub = 'DIRECT VIDEO STREAM';
  } else if (key.includes('SONG') || key.includes('MUSIC') || key.includes('AUDIO')) {
    c1 = '#d4af37';
    c2 = '#10b981';
    badge = 'MUSIC STUDIO';
    glyph = '♫';
    sub = '320KBPS STUDIO AUDIO';
  } else if (key.includes('MEDIAFIRE') || key === 'MF') {
    c1 = '#0284c7';
    c2 = '#0c4a6e';
    badge = 'MEDIAFIRE CLOUD';
    glyph = '☁';
    sub = '2GB DIRECT CLOUD FILE';
  }

  const safeSub = escapeHtml((subtitle || sub).slice(0, 44));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#09090b"/>
        <stop offset="55%" stop-color="${c2}" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="${c1}" stop-opacity="0.88"/>
      </linearGradient>
    </defs>
    <rect width="640" height="240" fill="url(#g1)"/>
    <circle cx="560" cy="40" r="140" fill="${c1}" opacity="0.18"/>
    <circle cx="95" cy="120" r="64" fill="rgba(9,9,11,0.72)" stroke="${c1}" stroke-width="3"/>
    <text x="95" y="138" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-weight="900" font-size="52" fill="#ffffff">${escapeHtml(glyph)}</text>
    <text x="188" y="108" font-family="system-ui,Segoe UI,sans-serif" font-weight="900" font-size="38" letter-spacing="2" fill="#ffffff">${escapeHtml(badge)}</text>
    <text x="190" y="142" font-family="system-ui,Segoe UI,sans-serif" font-weight="700" font-size="16" letter-spacing="1.2" fill="#f3e5ab">${safeSub}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Card 1: Midnight Luxury Full-Width Media/Cinema Banner + Details Below + Optional 2 Quality Copy Buttons
 */
export function generateFilmDetailsCardHtml(options: FilmDetailsCardOptions): string {
  const showAskBox = options.showAskBox !== false;
  const height = options.height || (showAskBox ? 510 : 370);
  const botName = escapeHtml((options.botName || 'YASHI HALLS').toUpperCase());
  const brandSection = escapeHtml((options.brandSection || 'CINEMA').toUpperCase());
  const badgeText = escapeHtml((options.badgeText || (showAskBox ? 'CHOOSE QUALITY' : 'DIRECT STREAM')).toUpperCase());
  const mediaIcon = escapeHtml(options.mediaIcon || '🎬');

  const title = escapeHtml(options.title || 'Media Title');
  const year = escapeHtml(options.year || 'Latest');
  const language = escapeHtml(options.language || 'Original');
  const genre = escapeHtml(options.genre || 'Feature Film');
  const synopsis = escapeHtml(options.synopsis || `${options.title} — Direct WhatsApp Delivery.`);
  const cleanShortTitle = (options.title || '').replace(/\(\d{4}\)/g, '').trim();
  const posterSrc = options.posterSrc ? escapeHtml(options.posterSrc) : '';

  const chip1 = escapeHtml(options.chip1Text || `📅 ${year}`);
  const chip2 = escapeHtml(options.chip2Text || `🗣️ ${language}`);
  const chip3 = options.chip3Text
    ? escapeHtml(options.chip3Text)
    : options.hasSinhalaSub
      ? '📝 Sinhala Sub'
      : `🎞️ ${genre}`;

  const askTitle = escapeHtml(options.askTitle || '🎬 ඔබට මෙම චිත්‍රපටය කුමන Quality එකෙන්ද අවශ්‍ය?');
  const askSubtitle = escapeHtml(
    options.askSubtitle || 'පහත බටන් එකක් Tap කර Copy කර චැට් එකට එවන්න (හෝ 480p / 720p ලෙස Reply කරන්න) 👇'
  );

  const defaultBtns: FilmQualityOptionButton[] = [
    {
      label: options.quality || 'SD 480p',
      size: options.fileSize || 'Fast MP4',
      copyCommand: `${options.prefix || '.'}film ${cleanShortTitle} 480p`,
    },
    {
      label: 'HD 720p',
      size: 'High Quality',
      copyCommand: `${options.prefix || '.'}film ${cleanShortTitle} 720p`,
    },
  ];
  const btns = (options.qualityButtons && options.qualityButtons.length > 0 ? options.qualityButtons : defaultBtns).slice(0, 2);

  const btnsHtml = btns
    .map((btn, idx) => {
      const cmdAttr = escapeHtml(btn.copyCommand);
      const isPrimary = idx === 0;
      return `
      <button class="q-btn ${isPrimary ? 'q-btn-gold' : 'q-btn-silver'}" data-cmd="${cmdAttr}" onclick="copyFilmChoice(this)">
        <span class="q-btn-top">${isPrimary ? '⚡' : '🎬'} ${escapeHtml(btn.label)}</span>
        <span class="q-btn-sub">📋 Copy • ${escapeHtml(btn.size)}</span>
      </button>`;
    })
    .join('');

  return `
<style>
  @keyframes filmToastPop {
    0% { opacity: 0; transform: translate(-50%, -8px) scale(0.96); }
    16% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    84% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -6px) scale(0.96); }
  }
  .film-card {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: radial-gradient(circle at 85% 5%, rgba(212, 175, 55, 0.16), transparent 44%), #09090b;
    color: #fafafa;
    border: 1px solid rgba(212, 175, 55, 0.36);
    border-radius: 16px;
    padding: 11px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.78);
    position: relative;
  }
  #filmToast {
    display: none;
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #f3e5ab, #d4af37);
    color: #09090b;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    z-index: 9999;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.65);
    white-space: nowrap;
  }
  .film-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 7px;
  }
  .film-brand {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #f3e5ab;
  }
  .film-badge {
    font-size: 9px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(212, 175, 55, 0.14);
    border: 1px solid rgba(212, 175, 55, 0.42);
    color: #f7d97e;
    letter-spacing: 0.4px;
  }
  .film-banner-wrap {
    width: 100%;
    height: 186px;
    border-radius: 12px;
    overflow: hidden;
    border: 1.5px solid rgba(212, 175, 55, 0.52);
    background: #141418;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.65);
  }
  .film-banner-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 22%;
    display: block;
  }
  .film-banner-grad {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 54px;
    background: linear-gradient(180deg, transparent, rgba(9, 9, 11, 0.92));
    pointer-events: none;
  }
  .film-banner-fallback {
    font-size: 42px;
    color: #d4af37;
  }
  .film-details {
    margin-top: 9px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .film-title {
    font-size: 15.5px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.22;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .film-subrow {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }
  .film-chip {
    font-size: 9.5px;
    font-weight: 700;
    padding: 2.5px 7px;
    border-radius: 5px;
    background: #18181b;
    border: 1px solid #27272a;
    color: #e4e4e7;
  }
  .film-chip.gold {
    background: rgba(212, 175, 55, 0.14);
    border-color: rgba(212, 175, 55, 0.38);
    color: #f3e5ab;
  }
  .film-chip.sub {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.42);
    color: #6ee7b7;
  }
  .film-synopsis {
    background: rgba(24, 24, 27, 0.85);
    border: 1px solid #27272a;
    border-left: 2.5px solid #d4af37;
    border-radius: 8px;
    padding: 6px 9px;
    font-size: 10.5px;
    line-height: 1.35;
    color: #d4d4d8;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .film-ask-box {
    margin-top: 8px;
    background: rgba(212, 175, 55, 0.08);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 12px;
    padding: 9px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .film-ask-title {
    font-size: 11.5px;
    font-weight: 800;
    color: #f3e5ab;
    line-height: 1.28;
  }
  .film-ask-sub {
    font-size: 9.5px;
    color: #a1a1aa;
    margin-top: 1px;
  }
  .film-btn-row {
    display: grid;
    grid-template-columns: ${btns.length > 1 ? '1fr 1fr' : '1fr'};
    gap: 8px;
  }
  .q-btn {
    border-radius: 10px;
    padding: 8px 9px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    border: 1px solid transparent;
    text-align: center;
    transition: transform 0.12s ease;
  }
  .q-btn:active {
    transform: scale(0.97);
  }
  .q-btn-gold {
    background: linear-gradient(135deg, #f3e5ab, #d4af37);
    color: #09090b;
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.25);
  }
  .q-btn-silver {
    background: #18181b;
    color: #fafafa;
    border-color: rgba(212, 175, 55, 0.45);
  }
  .q-btn-top {
    font-size: 11.5px;
    font-weight: 900;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .q-btn-sub {
    font-size: 9.5px;
    font-weight: 700;
    opacity: 0.9;
    white-space: nowrap;
  }
</style>

<div class="film-card">
  <div id="filmToast">✓ Copied! Send in chat</div>
  <textarea id="filmClipSink" style="position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;"></textarea>

  <div>
    <div class="film-top-bar">
      <div class="film-brand">${mediaIcon} ${botName} • ${brandSection}</div>
      <div class="film-badge">${badgeText}</div>
    </div>

    <div class="film-banner-wrap">
      ${posterSrc
        ? `<img class="film-banner-img" src="${posterSrc}" alt="${title}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span class="film-banner-fallback" style="display:none;">${mediaIcon}</span><div class="film-banner-grad"></div>`
        : `<span class="film-banner-fallback">${mediaIcon}</span>`
      }
    </div>

    <div class="film-details">
      <div class="film-title">${title}</div>
      <div class="film-subrow">
        <span class="film-chip gold">${chip1}</span>
        <span class="film-chip">${chip2}</span>
        <span class="film-chip ${options.hasSinhalaSub ? 'sub' : ''}">${chip3}</span>
      </div>
      <div class="film-synopsis">${synopsis}</div>
    </div>
  </div>

  ${showAskBox ? `
  <div class="film-ask-box">
    <div>
      <div class="film-ask-title">${askTitle}</div>
      <div class="film-ask-sub">${askSubtitle}</div>
    </div>
    <div class="film-btn-row">
      ${btnsHtml}
    </div>
  </div>` : ''}
</div>

<script>
  var filmToastTimer = null;
  function showFilmToast(msg) {
    var t = document.getElementById('filmToast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    t.style.animation = 'none';
    void t.offsetHeight;
    t.style.animation = 'filmToastPop 1.8s ease forwards';
    if (filmToastTimer) clearTimeout(filmToastTimer);
    filmToastTimer = setTimeout(function() { t.style.display = 'none'; }, 1800);
  }
  function copyFilmChoice(el) {
    if (!el) return;
    var cmd = el.getAttribute('data-cmd') || '';
    if (!cmd) return;
    var subEl = el.querySelector('.q-btn-sub');
    var prevText = subEl ? subEl.innerText : '';
    var done = function() {
      if (subEl) {
        subEl.innerText = '✓ Copied! Send in chat';
        setTimeout(function() { subEl.innerText = prevText; }, 2200);
      }
      showFilmToast('✓ Copied: ' + cmd);
    };
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(done).catch(function() { filmFallbackCopy(cmd, done); });
    } else {
      filmFallbackCopy(cmd, done);
    }
  }
  function filmFallbackCopy(cmd, cb) {
    try {
      var sink = document.getElementById('filmClipSink');
      if (sink) {
        sink.value = cmd;
        sink.select();
        sink.setSelectionRange(0, 99999);
        document.execCommand('copy');
      }
    } catch (e) {}
    if (cb) cb();
  }
</script>
`;
}

export interface FilmDownloadCardOptions {
  botName?: string;
  title: string;
  status: 'DOWNLOADING' | 'UPLOADING' | 'COMPLETED' | 'ERROR';
  progress?: number;
  quality?: string;
  fileSize?: string;
  downloadedText?: string;
  fileName?: string;
  errorMessage?: string;
  height?: number;
  mediaIcon?: string;
  transferLabel?: string;
  downloadingHeadline?: string;
  uploadingHeadline?: string;
  completedHeadline?: string;
  failedHeadline?: string;
  completedSubline?: string;
  downloadingSubline?: string;
}

/**
 * Card 2: Live-Updating Media Download -> Complete UI Card (Edited in-place for ALL downloaders)
 */
export function generateFilmDownloadCardHtml(options: FilmDownloadCardOptions): string {
  const height = options.height || 215;
  const botName = escapeHtml((options.botName || 'YASHI HALLS').toUpperCase());
  const transferLabel = escapeHtml((options.transferLabel || 'TRANSFER').toUpperCase());
  const mediaIcon = escapeHtml(options.mediaIcon || '🍿');
  const title = escapeHtml(options.title || 'Media');
  const status = options.status || 'DOWNLOADING';
  const pct = Math.min(100, Math.max(0, Math.round(options.progress ?? (status === 'COMPLETED' ? 100 : status === 'UPLOADING' ? 94 : 18))));
  const quality = escapeHtml(options.quality || 'HD Direct');
  const fileSize = escapeHtml(options.fileSize || 'Streaming');
  const fileName = escapeHtml(options.fileName || '');
  const downloadedText = escapeHtml(options.downloadedText || '');

  const isCompleted = status === 'COMPLETED';
  const isUploading = status === 'UPLOADING';
  const isError = status === 'ERROR';

  const accent = isCompleted ? '#10b981' : isError ? '#ef4444' : '#d4af37';
  const accentSoft = isCompleted
    ? 'rgba(16, 185, 129, 0.16)'
    : isError
      ? 'rgba(239, 68, 68, 0.16)'
      : 'rgba(212, 175, 55, 0.15)';
  const pillText = isCompleted
    ? '✓ DOWNLOAD COMPLETED'
    : isUploading
      ? `⚡ SENDING TO CHAT • ${pct}%`
      : isError
        ? '✕ DOWNLOAD FAILED'
        : `⏳ DOWNLOADING • ${pct}%`;

  const headline = isCompleted
    ? escapeHtml(options.completedHeadline || '✅ චිත්‍රපටය සාර්ථකව Download විය!')
    : isUploading
      ? escapeHtml(options.uploadingHeadline || '🚀 WhatsApp චැට් එකට එවමින් පවතී...')
      : isError
        ? escapeHtml(options.failedHeadline || '❌ බාගත කිරීමට නොහැකි විය')
        : escapeHtml(options.downloadingHeadline || '⏳ Download වෙමින් පවතී...');

  const subline = isCompleted
    ? escapeHtml(options.completedSubline || '👇 පහතින් ඇති ගොනුව Tap කර Download / Play කරන්න')
    : isUploading
      ? (downloadedText ? `Uploading to WhatsApp: ${downloadedText}` : 'ගොනුව Encrypt කර ඔබගේ WhatsApp වෙත Upload වෙමින් පවතී...')
      : isError
        ? escapeHtml(options.errorMessage || 'Mirror unavailable right now.')
        : downloadedText
          ? `Downloaded: ${downloadedText} — කරුණාකර මදක් රැඳී සිටින්න`
          : escapeHtml(options.downloadingSubline || 'වේගවත් Cloud CDN වෙතින් ගොනුව ලබාගනිමින් පවතී...');

  return `
<style>
  @keyframes filmShine {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  .fdl-card {
    box-sizing: border-box;
    width: 100%;
    height: ${height}px;
    max-height: ${height}px;
    background: radial-gradient(circle at 100% 0%, ${accentSoft}, transparent 52%), #09090b;
    color: #fafafa;
    border: 1px solid ${isCompleted ? 'rgba(16, 185, 129, 0.5)' : isError ? 'rgba(239, 68, 68, 0.45)' : 'rgba(212, 175, 55, 0.36)'};
    border-radius: 16px;
    padding: 13px 14px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.72);
  }
  .fdl-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .fdl-brand {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.9px;
    color: #d4d4d8;
  }
  .fdl-pill {
    font-size: 9.5px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 6px;
    background: ${accentSoft};
    border: 1px solid ${accent};
    color: ${isCompleted ? '#6ee7b7' : isError ? '#fca5a5' : '#f7d97e'};
    letter-spacing: 0.4px;
  }
  .fdl-main {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .fdl-movie {
    font-size: 11px;
    font-weight: 700;
    color: ${isCompleted ? '#6ee7b7' : '#f3e5ab'};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fdl-headline {
    font-size: 14.5px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.25;
  }
  .fdl-sub {
    font-size: 11px;
    color: #d4d4d8;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fdl-bar-wrap {
    width: 100%;
    height: 9px;
    border-radius: 999px;
    background: #18181b;
    border: 1px solid #27272a;
    overflow: hidden;
    margin-top: 3px;
  }
  .fdl-bar-fill {
    height: 100%;
    width: ${pct}%;
    border-radius: 999px;
    background: ${isCompleted
      ? 'linear-gradient(90deg, #059669, #34d399)'
      : isError
        ? '#ef4444'
        : 'linear-gradient(90deg, #b8860b, #f3e5ab, #d4af37)'};
    background-size: 200% 100%;
    animation: ${isCompleted || isError ? 'none' : 'filmShine 1.6s linear infinite'};
    transition: width 0.35s ease;
  }
  .fdl-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 10px;
    color: #a1a1aa;
    font-weight: 700;
  }
  .fdl-specs {
    display: flex;
    gap: 10px;
    color: #e4e4e7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

<div class="fdl-card">
  <div class="fdl-top">
    <div class="fdl-brand">⚡ ${botName} ${transferLabel}</div>
    <div class="fdl-pill">${pillText}</div>
  </div>

  <div class="fdl-main">
    <div class="fdl-movie">${mediaIcon} ${title}${fileName && isCompleted ? ` • ${fileName}` : ''}</div>
    <div class="fdl-headline">${headline}</div>
    <div class="fdl-sub">${subline}</div>
    <div class="fdl-bar-wrap">
      <div class="fdl-bar-fill"></div>
    </div>
  </div>

  <div class="fdl-foot">
    <div class="fdl-specs">
      <span>🎞️ ${quality}</span>
      <span>📦 ${fileSize}</span>
    </div>
    <span>${isCompleted ? 'READY BELOW 👇' : `${pct}%`}</span>
  </div>
</div>
`;
}


