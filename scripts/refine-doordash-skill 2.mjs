#!/usr/bin/env node
/**
 * One-off script to refine the DoorDash skill so it works with profile sessions.
 * Run from project root: node scripts/refine-doordash-skill.mjs
 *
 * Refinement takes ~30 seconds. Check cloud.browser-use.com/skills for status.
 */

import { BrowserUse } from "browser-use-sdk";
import { config } from "dotenv";

config({ path: ".env.local" });

const skillId = process.env.BROWSER_USE_SKILL_ID;
const apiKey = process.env.BROWSER_USE_API_KEY;

if (!skillId || !apiKey) {
  console.error(
    "Missing env vars. Ensure .env.local has BROWSER_USE_SKILL_ID and BROWSER_USE_API_KEY."
  );
  process.exit(1);
}

const client = new BrowserUse({ apiKey });

console.log("Refining skill", skillId, "...");
await client.skills.refine(skillId, {
  feedback: `REMOVE STORE_ID, MENU_ID, and ITEM_ID as required parameters. Per Browser Use docs, cookies are automatically injected from the session — you do NOT need DoorDash IDs.

The skill should accept ONLY:
- query (required, string) — the search term, e.g. "chicken bowl" or "Chicken Rice Bowl"
- session_id (optional) — when provided, run in that browser session (cookies are already there)

Flow: Search DoorDash for the query → click first restaurant → add one matching menu item to cart → return "Added [item] to cart from [restaurant]. Cart is ready for checkout."

Do NOT require STORE_ID, MENU_ID, ITEM_ID, or any cookie parameters. The session's browser already has the state.`,
});

console.log("Refinement started successfully.");
console.log("Check status at: https://cloud.browser-use.com/skills");
console.log("Refinement typically takes ~30 seconds.");
