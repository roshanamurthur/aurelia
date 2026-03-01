#!/usr/bin/env node
/**
 * Test the DoorDash API route.
 * Usage: node scripts/test-doordash.mjs [baseUrl]
 * Default baseUrl: http://localhost:3005
 *
 * Make sure the dev server is running first: npm run dev
 */

const baseUrl = process.argv[2] || "http://localhost:3005";
const code = process.argv[3];
const sessionId = process.argv[4];
const url = `${baseUrl}/api/doordash`;

const body = {
  searchIntent: "healthy dinner",
  useChipotleCsv: false,
  ...(code && sessionId ? { phase: "2fa", code, sessionId } : {}),
};

console.log("POST", url);
console.log("Body:", JSON.stringify(body, null, 2));
console.log("");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.log("Response (raw):", text.slice(0, 500));
  process.exit(1);
}

console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data, null, 2));

if (data.needs2FA) {
  console.log("\n--- Next step: send the 2FA code (phase 2) ---");
  console.log("  node scripts/test-doordash.mjs", baseUrl, "<CODE>", data.sessionId);
  console.log("  Live session (enter code in browser):", data.liveUrl || "(see response)");
}

process.exit(res.ok ? 0 : 1);
