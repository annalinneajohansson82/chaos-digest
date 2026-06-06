/**
 * Translates the human-readable SCHEDULE in config.js into a cron expression
 * and writes it into .github/workflows/daily-digest.yml.
 *
 * Usage:  node scripts/update-schedule.js
 * Requires: GEMINI_API_KEY environment variable
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import config from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, "../.github/workflows/daily-digest.yml");

async function scheduleToCron(schedule) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `Convert the following human-readable schedule description into a valid cron expression (5 fields: minute hour day month weekday). Reply with ONLY the cron expression — no explanation, no backticks, no extra text.

Schedule: "${schedule}"`;

  const response = await ai.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: prompt,
  });

  const cron = (response.text || "").trim();
  if (!/^\S+ \S+ \S+ \S+ \S+$/.test(cron)) {
    throw new Error(`Unexpected model response (not a cron expression): "${cron}"`);
  }
  return cron;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  console.log(`Translating schedule: "${config.SCHEDULE}"`);
  const cron = await scheduleToCron(config.SCHEDULE);
  console.log(`Cron expression: ${cron}`);

  const yaml = await fs.readFile(WORKFLOW_PATH, "utf8");
  const updated = yaml.replace(
    /^(\s*-\s*cron:\s*')[^']*(')/m,
    `$1${cron}$2`
  );

  if (updated === yaml) {
    console.warn("Warning: cron line not found in workflow file — no changes written.");
    process.exit(1);
  }

  await fs.writeFile(WORKFLOW_PATH, updated, "utf8");
  console.log(`Updated ${WORKFLOW_PATH}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
