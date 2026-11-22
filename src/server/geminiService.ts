import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

export interface ChatMemoryItem {
  senderName: string;
  senderJid: string;
  text: string;
  timestamp: number;
  hasLink?: string;
  isBot?: boolean;
}

const DEFAULT_MODEL = "gemini-4-hydrogen";
const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    return null;
  }
  return key.trim();
}

function getClient(): GoogleGenAI | null {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function normalizeMimeType(mimeType: string | undefined, fallback: string): string {
  const base = (mimeType || fallback).split(";")[0].trim().toLowerCase();
  if (!base) return fallback;
  if (base === "audio/oga") return "audio/ogg";
  return base;
}

function formatGeminiError(error: any): string {
  const msg = error?.message || String(error || "");
  if (msg.includes("NO_API_KEY")) {
    return "⚠️ GEMINI_API_KEY සකසා නැත. කරුණාකර Settings > Secrets හි GEMINI_API_KEY එක් කරන්න.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("PERMISSION_DENIED") || msg.includes("403") || msg.includes("401")) {
    return "⚠️ Gemini API Key එක වලංගු නැත හෝ අවසර නැත. කරුණාකර Settings > Secrets හි API Key එක පරීක්ෂා කරන්න.";
  }
  if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
    return "⏳ Gemini API භාවිත සීමාව ඉක්මවා ඇත (429). මඳ වේලාවකින් නැවත උත්සාහ කරන්න.";
  }
  if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand")) {
    return "⏳ YASHI HALLS AI සේවාවේ තදබදයක් පවතී. මොහොතකින් නැවත උත්සාහ කරන්න.";
  }
  return msg.slice(0, 140);
}

export async function askGemini(prompt: string, context?: string): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ YASHI HALLS AI Engine key is not configured on the server. Please add GEMINI_API_KEY in the Settings > Secrets panel to enable AI responses.",
      success: false,
    };
  }

  try {
    const systemInstruction = context
      ? `You are YASHI HALLS, a smart and friendly WhatsApp Assistant powered by YASHI HALLS. Keep responses concise, clear, and easy to read on mobile. Context: ${context}`
      : "You are YASHI HALLS, an advanced WhatsApp bot assistant powered by YASHI HALLS. Keep responses helpful, well-formatted, and concise for chat.";

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "No response generated from YASHI HALLS AI.",
      success: true,
    };
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    return {
      text: formatted.startsWith("⚠️") || formatted.startsWith("⏳")
        ? formatted
        : `❌ YASHI HALLS AI Notice: Unable to generate response (${formatted})`,
      success: false,
    };
  }
}

export async function analyzeAudioWithGemini(
  audioBuffer: Buffer,
  mimeType = "audio/ogg",
  caption?: string
): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "🎙️ *හඬ පණිවිඩය ලැබුණා!* (Voice note received)\n_AI Voice Analysis සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY සකසන්න._",
      success: false,
    };
  }

  try {
    const cleanMime = normalizeMimeType(mimeType, "audio/ogg");
    const base64Data = audioBuffer.toString("base64");
    const promptText = caption?.trim()
      ? `User sent this audio note with note/caption: "${caption}". Listen carefully, understand what the user said in Sinhala, Singlish, or English, and reply helpfully and warmly in the same language.`
      : "Listen carefully to this WhatsApp voice message. First briefly mention what you understood, then give an accurate, warm, helpful reply in the user's language (Sinhala, Singlish, or English). Keep it concise and mobile-friendly.";

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: base64Data,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction:
          "You are YASHI HALLS, an advanced WhatsApp assistant with native audio listening capabilities. You accurately understand spoken Sinhala, Singlish, Tamil, and English voice notes and respond naturally in the same language.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "හඬ පණිවිඩය සාර්ථකව විශ්ලේෂණය විය.",
      success: true,
    };
  } catch (error: any) {
    console.warn("[GeminiService] analyzeAudio error:", error?.message || error);
    const formatted = formatGeminiError(error);
    return {
      text: formatted.startsWith("⚠️") || formatted.startsWith("⏳")
        ? formatted
        : `🎙️ *හඬ පණිවිඩය තේරුම් ගැනීමේ දෝෂයක් සිදුවිය.*\n_${formatted}_`,
      success: false,
    };
  }
}

export async function transcribeAudioWithGemini(
  audioBuffer: Buffer,
  mimeType = "audio/ogg"
): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ GEMINI_API_KEY සකසා නැත. Voice transcription සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY එක් කරන්න.",
      success: false,
    };
  }

  const cleanMime = normalizeMimeType(mimeType, "audio/ogg");
  const base64Data = audioBuffer.toString("base64");
  const audioPart = {
    inlineData: {
      mimeType: cleanMime,
      data: base64Data,
    },
  };
  const instructionText =
    "Transcribe this audio message word-for-word accurately. If spoken in Sinhala, output clean Sinhala script text. If spoken in English, output clean English text. Output only the transcription without extra commentary.";

  try {
    const response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: { parts: [audioPart, { text: instructionText }] },
    });

    const out = (response.text || "").trim();
    if (out) {
      return { text: out, success: true };
    }
  } catch (primaryErr: any) {
    console.warn("[GeminiService] gemini-3.5-transcribe fallback check:", primaryErr?.message || primaryErr);
  }

  try {
    const fallbackRes = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: { parts: [audioPart, { text: instructionText }] },
      config: {
        systemInstruction: "You are an accurate speech-to-text transcriber. Output only the verbatim transcript.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    return {
      text: (fallbackRes.text || "").trim() || "No clear speech detected in audio.",
      success: true,
    };
  } catch (error: any) {
    return {
      text: "❌ Transcription error: " + formatGeminiError(error),
      success: false,
    };
  }
}

export async function translateAudioWithGemini(
  audioBuffer: Buffer,
  mimeType = "audio/ogg",
  targetLang = "English"
): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ GEMINI_API_KEY සකසා නැත. Voice translation සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY එක් කරන්න.",
      success: false,
    };
  }

  try {
    const cleanMime = normalizeMimeType(mimeType, "audio/ogg");
    const base64Data = audioBuffer.toString("base64");
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          {
            text: `Listen to this voice message, write the original transcript briefly, and provide an accurate natural translation into ${targetLang}.`,
          },
        ],
      },
      config: {
        systemInstruction: "You are a multilingual WhatsApp speech translator supporting Sinhala, English, Tamil, and global languages.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "හඬ පණිවිඩය පරිවර්තනය කරන ලදී.",
      success: true,
    };
  } catch (error: any) {
    return {
      text: "❌ Voice translation error: " + formatGeminiError(error),
      success: false,
    };
  }
}

export async function analyzeVideoWithGemini(
  videoBuffer: Buffer,
  mimeType = "video/mp4",
  caption?: string
): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "📹 *වීඩියෝව ලැබුණා!* (Video received)\n_AI Video Analysis සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY සකසන්න._",
      success: false,
    };
  }

  try {
    const cleanMime = normalizeMimeType(mimeType, "video/mp4");
    const base64Data = videoBuffer.toString("base64");
    const promptText = caption?.trim()
      ? `User sent this video with caption/question: "${caption}". Watch the video scenes, understand the content, and answer the question in Sinhala or English.`
      : "Watch this video carefully. Describe what is happening in the video, highlight key moments, and explain it clearly in friendly Sinhala with English terms.";

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction: "You are YASHI HALLS, an advanced WhatsApp bot assistant with video vision analysis. Describe video content clearly in friendly Sinhala/English.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "වීඩියෝව සාර්ථකව විශ්ලේෂණය විය.",
      success: true,
    };
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    return {
      text: formatted.startsWith("⚠️") || formatted.startsWith("⏳")
        ? formatted
        : "📹 *වීඩියෝව විශ්ලේෂණය කිරීමේ දෝෂයක් සිදුවිය.* කරුණාකර නැවත උත්සාහ කරන්න.",
      success: false,
    };
  }
}

export async function analyzeImageWithGemini(
  imageBuffer: Buffer,
  mimeType = "image/jpeg",
  prompt = "Analyze this image"
): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ GEMINI_API_KEY සකසා නැත. Image analysis සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY එක් කරන්න.",
      success: false,
    };
  }

  try {
    const cleanMime = normalizeMimeType(mimeType, "image/jpeg");
    const base64Data = imageBuffer.toString("base64");
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction: "You are YASHI HALLS AI Vision Engine. Analyze the image, solve math/physics problems, split bills, or analyze food calories as requested in clear Sinhala and English.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "Image processed successfully.",
      success: true,
    };
  } catch (error: any) {
    return {
      text: "❌ Image Analysis error: " + formatGeminiError(error),
      success: false,
    };
  }
}

export async function generateCVWithGemini(promptText: string): Promise<{ text: string; success: boolean }> {
  const ai = getClient();
  if (!ai) {
    return {
      text: "⚠️ GEMINI_API_KEY සකසා නැත. CV Generator සක්‍රිය කිරීමට Settings > Secrets හි GEMINI_API_KEY එක් කරන්න.",
      success: false,
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: `Create a professional, highly structured Curriculum Vitae (CV) / Resume based on these details: "${promptText}". Format it beautifully with sections: CONTACT INFORMATION, EXECUTIVE SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS & CERTIFICATIONS, and REFERENCES. Use clean text formatting with emojis and bullet points for mobile reading on WhatsApp.`,
      config: {
        systemInstruction: "You are YASHI HALLS AI Resume Builder. Create professional, elegant CVs.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      text: (response.text || "").trim() || "CV generated successfully.",
      success: true,
    };
  } catch (error: any) {
    return {
      text: "❌ CV generation error: " + formatGeminiError(error),
      success: false,
    };
  }
}

export async function chatAsYashiHallsAI(params: {
  userText: string;
  senderName: string;
  recentMessages?: ChatMemoryItem[];
  imageBuffer?: Buffer;
  imageMime?: string;
}): Promise<{
  replyText: string;
  action?: "send_mp3" | "send_video" | "send_sticker" | "none";
  targetQuery?: string;
  success: boolean;
}> {
  const ai = getClient();
  if (!ai) {
    return {
      replyText: "",
      action: "none",
      success: false,
    };
  }

  try {
    const contextFormatted = (params.recentMessages || [])
      .slice(-6)
      .map((m) => `${m.isBot ? "YASHI HALLS (You)" : m.senderName}: ${m.text}${m.hasLink ? ` [Link: ${m.hasLink}]` : ""}`)
      .join("\n");

    const systemInstruction = `You are YASHI HALLS (යශී හෝල්ස්), the absolute smartest, friendliest, funniest, and most empathetic Sri Lankan WhatsApp AI bot companion.
You are chatting with Sri Lankan friends on WhatsApp.

CRITICAL PERSONALITY & LANGUAGE GUIDELINES:
1. Speak in natural, colloquial everyday Sri Lankan Sinhala (මිත්‍රශීලී කතාබහ කරන සිංහල).
   - Use warm, authentic Sri Lankan friend words where appropriate: "බං", "මචං", "යාලුවා", "පට්ට", "සුපිරි", "ආනේ", "සිරාවටම", "අඩෝ", "හරිම කියුට්", "නියමයිනේ", "මම මේ දැන්ම එවන්නම්".
   - You MUST sound like a real, beloved friend texting on WhatsApp, NEVER like a robot or formal translation!
2. Address the user directly by their name: "${params.senderName || "යාලුවා"}" with genuine warmth and peer energy!
3. Use lively, natural emojis (😍, ❤️, 😎, 🎵, 🎬, ✨, 🔥, 😂, 🙌, 🥳, 💡).
4. KEEP REPLIES CONCISE AND NATURAL (1 to 2 short sentences max, exactly like human WhatsApp texting!).
5. IF THE USER SENDS AN IMAGE (like baby photos, pets, selfies, memes, food):
   - Notice the visual details with emotional intelligence and give a sweet, funny, or admiring reaction in Sinhala.
6. IF THE USER SENDS A VIDEO OR YOUTUBE LINK:
   - React excitedly like a buddy.
7. ACTION DETECTION:
   - If user asks for song/mp3: set action to "send_mp3" and targetQuery to the song name.
   - If user asks for video: set action to "send_video" and targetQuery to the video link.
   - If user asks for sticker: set action to "send_sticker".
   - Otherwise action is "none".`;

    const parts: any[] = [];
    if (params.imageBuffer) {
      parts.push({
        inlineData: {
          mimeType: normalizeMimeType(params.imageMime, "image/jpeg"),
          data: params.imageBuffer.toString("base64"),
        },
      });
    }

    const userPrompt = `Chat History Context:
${contextFormatted || "(No previous messages)"}

New message from ${params.senderName}: "${params.userText || "(Sent an image)"}"`;

    parts.push({ text: userPrompt });

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            replyText: { type: Type.STRING },
            action: { type: Type.STRING },
            targetQuery: { type: Type.STRING },
          },
          required: ["replyText", "action"],
        },
      },
    });

    const parsed = JSON.parse((response.text || "{}").trim());
    const validActions = ["send_mp3", "send_video", "send_sticker", "none"];
    const action = validActions.includes(parsed.action) ? parsed.action : "none";

    return {
      replyText: parsed.replyText || `පට්ට නේ ${params.senderName}! 😎❤️`,
      action,
      targetQuery: parsed.targetQuery || "",
      success: true,
    };
  } catch {
    return {
      replyText: `පට්ට නේ ${params.senderName}! මම ඔයාට උදව් කරන්න ලෑස්තියි ❤️`,
      action: "none",
      success: false,
    };
  }
}
