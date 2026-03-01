/**
 * TikTok Recipe Extraction – Browser Use agent for extracting recipes from TikTok videos.
 * Uses the same profile as DoorDash/Instacart (BROWSER_USE_PROFILE_ID).
 * Log into TikTok in Chrome, then re-sync your profile.
 */
import { BrowserUse } from "browser-use-sdk";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export const maxDuration = 180;

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, "utf-8");
    const env: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (key) env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const envLocal = loadEnvFile(path.resolve(process.cwd(), ".env.local"));
const envDoordash = loadEnvFile(path.resolve(process.cwd(), ".env.doordash"));

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("SSL") ||
    msg.includes("tlsv1") ||
    msg.includes("EPROTO") ||
    msg.includes("ECONNRESET") ||
    msg.includes("socket hang up")
  );
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const apiKey =
    process.env.BROWSER_USE_API_KEY || envLocal.BROWSER_USE_API_KEY || envDoordash.BROWSER_USE_API_KEY;
  const profileId =
    process.env.BROWSER_USE_PROFILE_ID || envLocal.BROWSER_USE_PROFILE_ID || envDoordash.BROWSER_USE_PROFILE_ID;

  if (!apiKey || !profileId) {
    return NextResponse.json(
      { error: "Missing BROWSER_USE_API_KEY or BROWSER_USE_PROFILE_ID." },
      { status: 500 }
    );
  }

  let videoUrl: string;
  try {
    const body = await req.json();
    videoUrl = body.videoUrl;
    if (!videoUrl || !videoUrl.includes("tiktok.com")) {
      return NextResponse.json(
        { error: "videoUrl must be a TikTok link." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const client = new BrowserUse({
    apiKey,
    timeout: 120_000,
    maxRetries: 3,
  });

  const task = `You are on a TikTok video page. Your goal is to extract the recipe shown in this video.

Read everything visible on the page:
1. The video caption/description text below the video
2. Any on-screen text overlays showing ingredients or cooking steps
3. The pinned comment or top comments (creators often post the full recipe there)
4. The creator's username (@handle)

Extract and return ONLY a JSON object (no other text):
{
  "dishName": "the name of the dish",
  "ingredients": [
    {"name": "ingredient name", "amount": 2, "unit": "cups"},
    ...
  ],
  "instructions": "step by step cooking instructions as a single string",
  "calories": number or null,
  "protein": number or null,
  "carbs": number or null,
  "fat": number or null,
  "creator": "@username"
}

Rules:
- If ingredient amounts aren't specified, estimate reasonable portions for 2 servings.
- For calories/protein/carbs/fat, only include if explicitly mentioned in the video or caption. Otherwise use null.
- If this is NOT a recipe/food video, return: {"dishName": null}
- Return ONLY the JSON, no markdown formatting or extra text.`;

  const startMs = Date.now();
  let sessionLiveUrl: string | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const session = await client.sessions.create({
        profileId,
        startUrl: videoUrl,
      });
      sessionLiveUrl = session.liveUrl ?? null;

      const result = await client.run(task, {
        sessionId: session.id,
        allowedDomains: ["tiktok.com", "www.tiktok.com"],
      });

      const elapsedMs = Date.now() - startMs;
      const output = result.output ?? "";

      // Parse the JSON from the agent's response
      let extracted: any;
      try {
        // Try to find JSON in the output (agent may wrap in markdown code blocks)
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : { dishName: null };
      } catch {
        extracted = { raw: output, dishName: null, parseError: true };
      }

      if (!extracted.dishName) {
        return NextResponse.json({
          success: false,
          error: "No recipe found in this video.",
          raw: output,
          liveUrl: sessionLiveUrl,
          elapsedMs,
        });
      }

      return NextResponse.json({
        success: true,
        dishName: extracted.dishName,
        ingredients: extracted.ingredients ?? [],
        instructions: extracted.instructions ?? null,
        calories: extracted.calories ?? null,
        protein: extracted.protein ?? null,
        carbs: extracted.carbs ?? null,
        fat: extracted.fat ?? null,
        creator: extracted.creator ?? null,
        videoUrl,
        taskId: result.id,
        liveUrl: sessionLiveUrl,
        elapsedMs,
      });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await sleep(RETRY_DELAY_MS);
      } else {
        break;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown error";
  return NextResponse.json(
    {
      error: "TikTok recipe extraction failed",
      details: message,
      liveUrl: sessionLiveUrl,
    },
    { status: 500 }
  );
}
