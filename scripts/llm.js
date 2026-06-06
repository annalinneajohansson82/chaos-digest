import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import config from "./config.js";

const { LLM_PROVIDER, LLM_MODEL } = config;

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

function isTransient(err) {
  // Gemini: ApiError with status 503; Anthropic: APIStatusError with status 503
  return err?.status === 503;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callProvider(prompt) {
  if (LLM_PROVIDER === "gemini") {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: LLM_MODEL,
      contents: prompt,
    });
    return (response.text || "").trim();
  }

  if (LLM_PROVIDER === "anthropic") {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content.find((b) => b.type === "text");
    return (block?.text || "").trim();
  }

  throw new Error(
    `Unknown LLM_PROVIDER "${LLM_PROVIDER}". Supported values: "gemini", "anthropic".`
  );
}

/**
 * Send a prompt to the configured LLM and return the response text.
 * Retries up to 3 times (after 30s, 60s, 120s) on transient 503 errors.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generateText(prompt) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callProvider(prompt);
    } catch (err) {
      if (!isTransient(err) || attempt === RETRY_DELAYS_MS.length) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`  LLM 503 — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})...`);
      lastErr = err;
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Returns the name of the required API key env var for the current provider. */
export function requiredApiKeyVar() {
  if (LLM_PROVIDER === "gemini") return "GEMINI_API_KEY";
  if (LLM_PROVIDER === "anthropic") return "ANTHROPIC_API_KEY";
  return null;
}
