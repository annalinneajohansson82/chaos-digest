/**
 * Translates the human-readable SCHEDULE in config.js into a cron expression
 * and writes it into .github/workflows/daily-digest.yml.
 *
 * Usage:  node scripts/update-schedule.js
 * Requires: OPENROUTER_API_KEY environment variable
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.js";
import { callModel, requiredApiKeyVar } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = path.resolve(__dirname, "../.github/workflows/daily-digest.yml");

/**
 * Convert a human-readable schedule description into a cron expression.
 *
 * Uses the configured LLM to translate natural language into a standard
 * 5-field cron expression. The result is not validated here; validation
 * happens when the workflow file is used by GitHub Actions.
 *
 * @param {string} schedule - Human-readable schedule description.
 * @returns {Promise<string>} A 5-field cron expression.
 */
async function scheduleToCron(schedule) {
  const prompt = `Convert the following human-readable schedule description into a valid cron expression (5 fields: minute hour day month weekday). Reply with ONLY the cron expression — no explanation, no backticks, no extra text.

Schedule: "${schedule}"`;

  const cron = await callModel(prompt);
  if (!/^\S+ \S+ \S+ \S+ \S+$/.test(cron)) {
    throw new Error(`Unexpected model response (not a cron expression): "${cron}"`);
  }
  return cron;
}

/**
 * Entry point. Reads config.SCHEDULE, asks the model for a cron expression,
 * then patches .github/workflows/daily-digest.yml.
 */
async function main() {
  const apiKeyVar = requiredApiKeyVar();
  if (apiKeyVar && !process.env[apiKeyVar]) {
    console.error(`Error: ${apiKeyVar} environment variable is not set.`);
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
