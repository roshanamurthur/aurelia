/**
 * Instacart API – Browser Use agent for adding grocery list items to cart.
 * Uses the same profile as DoorDash (BROWSER_USE_PROFILE_ID). Log into Instacart
 * in Chrome, then re-sync your profile. See docs/INSTACART_SETUP.md.
 */
import { BrowserUse } from "browser-use-sdk";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

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

export async function POST(req: NextRequest) {
  const apiKey =
    process.env.BROWSER_USE_API_KEY || envLocal.BROWSER_USE_API_KEY || envDoordash.BROWSER_USE_API_KEY;
  const profileId =
    process.env.BROWSER_USE_PROFILE_ID || envLocal.BROWSER_USE_PROFILE_ID || envDoordash.BROWSER_USE_PROFILE_ID;

  if (!apiKey || !profileId) {
    return NextResponse.json(
      {
        error:
          "Missing BROWSER_USE_API_KEY or BROWSER_USE_PROFILE_ID. Instacart requires profile sync. See docs/INSTACART_SETUP.md.",
      },
      { status: 500 }
    );
  }

  let items: { name: string; amount?: number; unit?: string }[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.items)) {
      items = body.items
        .filter((i: any) => i?.name && typeof i.name === "string")
        .map((i: any) => ({
          name: String(i.name).trim(),
          amount: typeof i.amount === "number" ? i.amount : undefined,
          unit: typeof i.unit === "string" ? i.unit : undefined,
        }));
    } else if (body?.mealPlanId) {
      // Server-side: fetch from Convex (caller would need to pass items or we'd need Convex here)
      return NextResponse.json(
        { error: "Pass items array in body. mealPlanId is for server-side only." },
        { status: 400 }
      );
    }
  } catch {
    // use default
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No items provided. Pass { items: [{ name: \"...\" }, ...] }" },
      { status: 400 }
    );
  }

  const itemList = items
    .map((i) => (i.amount != null && i.unit ? `${i.name} (${i.amount} ${i.unit})` : i.name))
    .join(", ");

  const client = new BrowserUse({
    apiKey,
    timeout: 180_000,
    maxRetries: 3,
  });

  const startMs = Date.now();

  const task = `You are on Instacart (already logged in). Your goal:
1. Add these grocery items to your cart. For EACH item, search for it, then add the first/best matching product to the cart. Do NOT skip any item.
2. Items to add: ${itemList}
3. After adding all items, do NOT proceed to checkout. Stop when the cart contains all items.
4. Return a short message listing what you added, e.g. "Added: [item1], [item2], ... Cart is ready for checkout."`;

  let sessionLiveUrl: string | null = null;

  try {
    const session = await client.sessions.create({
      profileId,
      startUrl: "https://www.instacart.com",
    });

    const result = await client.run(task, {
      sessionId: session.id,
      allowedDomains: ["instacart.com", "www.instacart.com"],
    });

    sessionLiveUrl = session.liveUrl ?? null;
    const elapsedMs = Date.now() - startMs;

    return NextResponse.json({
      success: true,
      output: result.output ?? "Task completed.",
      taskId: result.id,
      liveUrl: sessionLiveUrl,
      itemCount: items.length,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Instacart agent failed",
        details: message,
        liveUrl: sessionLiveUrl,
      },
      { status: 500 }
    );
  }
}
