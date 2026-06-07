import config from "./config.js";

const { OPENROUTER_BASE_URL, MODELS } = config;

/**
 * Call OpenRouter's OpenAI-compatible API with a prompt and optional model fallback chain.
 * @param {string} prompt
 * @param {string[]} [models]
 * @returns {Promise<string>}
 */
export async function callModel(prompt, models = MODELS) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable not set");
  }

  const body = {
    model: models[0],
    models: models,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("Empty response from model");
  }

  // Log which model actually handled the request (useful for maintenance signal)
  if (data.model) {
    console.log(`  Model used: ${data.model}`);
  }

  return text;
}

/**
 * Returns the name of the required API key environment variable.
 *
 * @returns {string} The environment variable name used by {@link callModel}.
 */
export function requiredApiKeyVar() {
  return "OPENROUTER_API_KEY";
}
