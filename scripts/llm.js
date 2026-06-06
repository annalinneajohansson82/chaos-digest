import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import config from "./config.js";

const { LLM_PROVIDER, LLM_MODEL } = config;

/**
 * Send a prompt to the configured LLM and return the response text.
 * Provider is controlled by LLM_PROVIDER in config.js ("gemini" | "anthropic").
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generateText(prompt) {
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

/** Returns the name of the required API key env var for the current provider. */
export function requiredApiKeyVar() {
  if (LLM_PROVIDER === "gemini") return "GEMINI_API_KEY";
  if (LLM_PROVIDER === "anthropic") return "ANTHROPIC_API_KEY";
  return null;
}
