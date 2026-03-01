import fs from "fs";
import path from "path";

function loadEnvLocal(): {
  env: Record<string, string>;
  debug: {
    tried: string[];
    found: string;
    exists: Record<string, boolean>;
    parsedKeys?: string[];
    contentLength?: number;
    lineCount?: number;
    contentHas?: Record<string, boolean>;
    rawLines?: string[];
  };
} {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "aurelia-prehack", ".env.local"),
    ...(typeof __dirname !== "undefined"
      ? [
          path.resolve(__dirname, "..", "..", "..", ".env.local"),
          path.resolve(__dirname, "..", "..", "..", "..", "..", ".env.local"),
        ]
      : []),
  ];

  const exists: Record<string, boolean> = {};
  for (const p of candidates) {
    try {
      exists[p] = fs.existsSync(p);
    } catch {
      exists[p] = false;
    }
  }

  for (const envLocalPath of candidates) {
    try {
      if (!exists[envLocalPath]) continue;
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const env: Record<string, string> = {};
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
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
      const keys = ["BROWSER_USE_API_KEY", "BROWSER_USE_PROFILE_ID", "BROWSER_USE_SKILL_ID", "DOORDASH_EMAIL", "DOORDASH_PASSWORD"];
      const found = keys.filter((k) => env[k]).join(", ");
      const contentHas = {
        BROWSER_USE_API_KEY: content.includes("BROWSER_USE_API_KEY"),
        DOORDASH_EMAIL: content.includes("DOORDASH_EMAIL"),
        DOORDASH_PASSWORD: content.includes("DOORDASH_PASSWORD"),
      };
      return {
        env,
        debug: {
          tried: candidates,
          found: found || "(none)",
          exists,
          parsedKeys: Object.keys(env),
          contentLength: content.length,
          lineCount: lines.length,
          contentHas,
          rawLines: lines.map((l) => {
            const eq = l.indexOf("=");
            return eq > 0 ? l.slice(0, eq).trim() : l.slice(0, 30);
          }),
        },
      };
    } catch {
      continue;
    }
  }
  return {
    env: {},
    debug: { tried: candidates, found: "(file not found or unreadable)", exists },
  };
}

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

const { env: envLocal, debug: envDebug } = loadEnvLocal();

// Fallback: .env.doordash (avoids iCloud sync issues with .env.local)
const envDoordash = loadEnvFile(path.resolve(process.cwd(), ".env.doordash"));

/**
 * DoorDash API – Browser Use agent for ordering.
 * Auth priority: Profile sync > 1Password > Credentials (manual 2FA or Gmail auto).
 */
import { fetchDoorDash2FACode } from "@/lib/fetch-2fa-code";
import { BrowserUse } from "browser-use-sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 180;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const apiKey =
    process.env.BROWSER_USE_API_KEY || envLocal.BROWSER_USE_API_KEY || envDoordash.BROWSER_USE_API_KEY;
  const profileId =
    process.env.BROWSER_USE_PROFILE_ID || envLocal.BROWSER_USE_PROFILE_ID || envDoordash.BROWSER_USE_PROFILE_ID;
  const rawSkillId =
    process.env.BROWSER_USE_SKILL_ID || envLocal.BROWSER_USE_SKILL_ID || envDoordash.BROWSER_USE_SKILL_ID;
  const skillId = rawSkillId?.split("?")[0]?.trim() || undefined;
  const opVaultId =
    process.env.BROWSER_USE_OP_VAULT_ID || envLocal.BROWSER_USE_OP_VAULT_ID || envDoordash.BROWSER_USE_OP_VAULT_ID;
  const email =
    process.env.DOORDASH_EMAIL || envLocal.DOORDASH_EMAIL || envDoordash.DOORDASH_EMAIL;
  const password =
    process.env.DOORDASH_PASSWORD || envLocal.DOORDASH_PASSWORD || envDoordash.DOORDASH_PASSWORD;
  const gmailAppPassword =
    process.env.GMAIL_APP_PASSWORD ||
    envLocal.GMAIL_APP_PASSWORD ||
    envDoordash.GMAIL_APP_PASSWORD;

  const useProfile = !!profileId;
  const use1Password = !!opVaultId;
  const useCredentials = !!email && !!password;


  if (!apiKey || (!useProfile && !use1Password && !useCredentials)) {
    const debug = {
      processCwd: process.cwd(),
      __dirname: typeof __dirname !== "undefined" ? __dirname : "(undefined)",
      processEnvHas: {
        BROWSER_USE_API_KEY: !!process.env.BROWSER_USE_API_KEY,
        DOORDASH_EMAIL: !!process.env.DOORDASH_EMAIL,
        DOORDASH_PASSWORD: !!process.env.DOORDASH_PASSWORD,
      },
      envLocalHas: {
        BROWSER_USE_API_KEY: !!envLocal.BROWSER_USE_API_KEY,
        DOORDASH_EMAIL: !!envLocal.DOORDASH_EMAIL,
        DOORDASH_PASSWORD: !!envLocal.DOORDASH_PASSWORD,
      },
      envLocalDebug: envDebug,
    };
    return NextResponse.json(
      {
        error:
          "Missing BROWSER_USE_API_KEY. Also need one of: BROWSER_USE_PROFILE_ID (profile sync), BROWSER_USE_OP_VAULT_ID (1Password + 2FA), or DOORDASH_EMAIL + DOORDASH_PASSWORD.",
        debug,
      },
      { status: 500 }
    );
  }

  let searchIntent = "healthy dinner";
  let forceCredentials = false;
  let phase: "login" | "2fa" | undefined;
  let twoFACode: string | undefined;
  let sessionIdFromClient: string | undefined;
  let useChipotleCsv = false;
  try {
    const body = await req.json();
    if (body?.searchIntent && typeof body.searchIntent === "string") {
      searchIntent = body.searchIntent.trim() || searchIntent;
    }
    if (body?.useChipotleCsv === true) useChipotleCsv = true;
    if (body?.forceCredentials === true) forceCredentials = true;
    if (body?.phase === "2fa") {
      phase = "2fa";
      twoFACode = typeof body?.code === "string" ? body.code.trim() : undefined;
      sessionIdFromClient = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    }
  } catch {
    // use default
  }

  // If useChipotleCsv: read sf-meals.csv, randomly pick one meal, use its name as searchIntent
  if (useChipotleCsv) {
    const csvPath = path.resolve(process.cwd(), "data", "sf-meals.csv");
    try {
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const lines = csvContent.split(/\r?\n/).filter((l) => l.trim());
      const headers = lines[0]?.toLowerCase().split(",").map((h) => h.trim()) ?? [];
      const nameIdx = headers.indexOf("name");
      const calIdx = headers.indexOf("calories");
      const dataRows = lines.slice(1).filter((l) => l.trim());
      if (dataRows.length > 0 && nameIdx >= 0) {
        const row = dataRows[Math.floor(Math.random() * dataRows.length)]!;
        const cols = row.split(",").map((c) => c.trim());
        const itemName = cols[nameIdx] ?? "";
        const calories = calIdx >= 0 ? cols[calIdx] ?? "" : "";
        searchIntent = itemName;
        console.log(`[DoorDash] Picked from CSV: ${itemName}${calories ? ` (${calories} cal)` : ""}`);
      }
    } catch (e) {
      console.warn("[DoorDash] Could not read sf-meals.csv, using default:", e);
    }
  }

  // Profile first (already logged in) > 1Password > Credentials
  const effectiveUseProfile = useProfile && !forceCredentials;
  const effectiveUse1Password = use1Password && !effectiveUseProfile && !forceCredentials;
  const willUseCredentials = !effectiveUseProfile && !effectiveUse1Password && useCredentials;
  const useGmailAuto2FA = willUseCredentials && !!gmailAppPassword;
  const useManual2FA = willUseCredentials && !gmailAppPassword;

  // Manual 2FA: phase 2 requires code + sessionId from phase 1
  if (phase === "2fa") {
    if (!twoFACode || !sessionIdFromClient) {
      return NextResponse.json(
        { error: "Phase 2fa requires code and sessionId from the login phase." },
        { status: 400 }
      );
    }
  } else if (useManual2FA) {
    phase = "login";
  }

  const client = new BrowserUse({
    apiKey,
    timeout: 120_000,
    maxRetries: 5,
  });

  const startMs = Date.now();

  const taskProfile = `You are on DoorDash (already logged in). Your goal:
1. Search for "${searchIntent}".
2. Click on the first restaurant result.
3. Add one menu item to the cart that matches the search (e.g. a main dish).
4. Do NOT proceed to checkout.
5. Return a short message: "Added [item name] to cart from [restaurant name]. Cart is ready for checkout."`;

  const task1Password = `You are on DoorDash. Your goal:
1. Log in using credentials from the connected vault. Use the TOTP/2FA code from the vault when prompted.
2. Search for "${searchIntent}".
3. Click on the first restaurant result.
4. Add one menu item to the cart that matches the search (e.g. a main dish).
5. Do NOT proceed to checkout.
6. Return a short message: "Added [item name] to cart from [restaurant name]. Cart is ready for checkout."`;

  const taskLoginOnly = `You are on DoorDash. Log in:
1. In the email/username field, type exactly: ${email}
2. In the password field, type exactly: ${password}
3. Click the sign-in/login button.
4. Wait for the next page to load. If you see a verification code field, stop and return "Waiting for 2FA code."`;

  const taskCredentialsFull = `You are on DoorDash. Your goal:
1. Log in: In the email field type exactly: ${email}. In the password field type exactly: ${password}. Submit.
2. Search for "${searchIntent}".
3. Click on the first restaurant result.
4. Add one menu item to the cart that matches the search.
5. Do NOT proceed to checkout.
6. Return: "Added [item name] to cart from [restaurant name]. Cart is ready for checkout."`;

  const runOptions: Record<string, unknown> = {
    allowedDomains: ["doordash.com", "www.doordash.com"],
    startUrl: "https://www.doordash.com",
  };

  let effectiveTask = effectiveUseProfile
    ? taskProfile
    : effectiveUse1Password
      ? task1Password
      : (willUseCredentials && (useGmailAuto2FA || phase === "login"))
        ? taskLoginOnly
        : taskCredentialsFull;

  if (effectiveUse1Password) {
    runOptions.opVaultId = opVaultId;
  }

  let sessionLiveUrl: string | null = null;

  if (effectiveUseProfile) {
    try {
      const session = await client.sessions.create({
        profileId,
        startUrl: "https://www.doordash.com",
      });
      runOptions.sessionId = session.id;
      sessionLiveUrl = session.liveUrl ?? null;
      delete runOptions.startUrl;
    } catch (sessionErr) {
      console.error("DoorDash: session create failed, falling back:", sessionErr);
      runOptions.startUrl = "https://www.doordash.com";
      effectiveTask = effectiveUse1Password ? task1Password : (willUseCredentials ? taskLoginOnly : taskCredentialsFull);
      if (effectiveUse1Password) runOptions.opVaultId = opVaultId;
    }
  }

  // Skill path: use trained skill with profile session (faster, more reliable)
  let skillSkipReason: string | undefined;
  if (skillId && effectiveUseProfile && runOptions.sessionId) {
    try {
      const result = await client.skills.execute(skillId, {
        sessionId: runOptions.sessionId as string,
        parameters: {
          query: searchIntent,
          session_id: runOptions.sessionId,
        },
      });
      if (result.success) {
        const elapsedMs = Date.now() - startMs;
        return NextResponse.json({
          success: true,
          output: typeof result.result === "string" ? result.result : JSON.stringify(result.result ?? "Task completed."),
          taskId: skillId,
          liveUrl: sessionLiveUrl,
          method: "skill",
          elapsedMs,
          latencyMs: result.latencyMs ?? undefined,
        });
      }
      skillSkipReason = result.error ?? result.stderr ?? "Skill returned success: false";
      console.warn("[DoorDash] Skill failed, falling back to run:", skillSkipReason);
    } catch (skillErr) {
      const errMsg = skillErr instanceof Error ? skillErr.message : String(skillErr);
      skillSkipReason = errMsg;
      console.warn("[DoorDash] Skill execute error, falling back to run:", skillErr);
    }
  } else if (skillId && !runOptions.sessionId) {
    skillSkipReason = "No session (profile/session create failed)";
  } else if (skillId && !effectiveUseProfile) {
    skillSkipReason = "Profile not used (forceCredentials or no BROWSER_USE_PROFILE_ID)";
  } else if (!skillId) {
    skillSkipReason = "No BROWSER_USE_SKILL_ID in env";
  }

  // Phase 2fa: user entered code from previous login phase
  if (phase === "2fa" && sessionIdFromClient) {
    try {
      const task2FA = `You are on DoorDash's 2FA page. Your goal:
1. Enter the verification code exactly: ${twoFACode}
2. Submit/verify.
3. Search for "${searchIntent}".
4. Click on the first restaurant result.
5. Add one menu item to the cart that matches the search.
6. Do NOT proceed to checkout.
7. Return: "Added [item name] to cart from [restaurant name]. Cart is ready for checkout."`;

      const result = await client.run(task2FA, {
        sessionId: sessionIdFromClient,
        allowedDomains: ["doordash.com", "www.doordash.com"],
      });

      const elapsedMs = Date.now() - startMs;
      return NextResponse.json({
        success: true,
        output: result.output ?? "Task completed.",
        taskId: result.id,
        method: "run",
        elapsedMs,
        skillSkipReason: skillSkipReason ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: "DoorDash agent failed", details: message },
        { status: 500 }
      );
    }
  }

  // Credentials flow: login phase (manual or Gmail auto)
  if (willUseCredentials && !effectiveUseProfile && !effectiveUse1Password) {
    try {
      const session = await client.sessions.create({
        startUrl: "https://www.doordash.com",
      });
      runOptions.sessionId = session.id;
      sessionLiveUrl = session.liveUrl ?? null;
      delete runOptions.startUrl;

      // Phase 1: Login (agent will hit 2FA and stop)
      await client.run(taskLoginOnly, runOptions);

      if (useGmailAuto2FA) {
        // Auto: Fetch 2FA code from Gmail
        const code = await fetchDoorDash2FACode(email, gmailAppPassword, {
          maxWaitMs: 60_000,
          pollIntervalMs: 4_000,
        });

        if (!code) {
          return NextResponse.json(
            {
              error: "Could not find 2FA code in email. Check Gmail and ensure DoorDash sends codes to this address.",
              liveUrl: sessionLiveUrl,
            },
            { status: 500 }
          );
        }

        const task2FA = `You are on DoorDash's 2FA page. Your goal:
1. Enter the verification code exactly: ${code}
2. Submit/verify.
3. Search for "${searchIntent}".
4. Click on the first restaurant result.
5. Add one menu item to the cart that matches the search.
6. Do NOT proceed to checkout.
7. Return: "Added [item name] to cart from [restaurant name]. Cart is ready for checkout."`;

        const result = await client.run(task2FA, runOptions);

        const elapsedMs = Date.now() - startMs;
        return NextResponse.json({
          success: true,
          output: result.output ?? "Task completed.",
          taskId: result.id,
          liveUrl: sessionLiveUrl,
          method: "run",
          elapsedMs,
          skillSkipReason: skillSkipReason ?? undefined,
        });
      }

      // Manual: Return sessionId so user can enter code
      return NextResponse.json({
        needs2FA: true,
        sessionId: session.id,
        liveUrl: sessionLiveUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: "DoorDash agent failed", details: message, liveUrl: sessionLiveUrl },
        { status: 500 }
      );
    }
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await client.run(effectiveTask, runOptions);

      const elapsedMs = Date.now() - startMs;
      return NextResponse.json({
        success: true,
        output: result.output ?? "Task completed.",
        taskId: result.id,
        liveUrl: sessionLiveUrl,
        method: "run",
        elapsedMs,
        skillSkipReason: skillSkipReason ?? undefined,
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

  const message =
    lastError instanceof Error ? (lastError as Error).message : "Unknown error";
  return NextResponse.json(
    { error: "DoorDash agent failed", details: message, liveUrl: sessionLiveUrl },
    { status: 500 }
  );
}
