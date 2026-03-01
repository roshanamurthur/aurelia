/**
 * OpenTable API – Browser Use agent for making restaurant reservations.
 * Uses the same profile as DoorDash/Instacart (BROWSER_USE_PROFILE_ID).
 * Log into OpenTable in Chrome, then re-sync your profile.
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
          "Missing BROWSER_USE_API_KEY or BROWSER_USE_PROFILE_ID. OpenTable requires profile sync. Log into OpenTable in Chrome and sync your profile.",
      },
      { status: 500 }
    );
  }

  let restaurantName = "";
  let location = "San Francisco";
  let date = "";
  let time = "19:00";
  let partySize = 2;

  let streamProgress = false;
  try {
    const body = await req.json();
    if (body?.restaurantName && typeof body.restaurantName === "string") {
      restaurantName = body.restaurantName.trim();
    }
    if (body?.location && typeof body.location === "string") {
      location = body.location.trim() || location;
    }
    if (body?.date && typeof body.date === "string") {
      date = body.date.trim();
    }
    if (body?.time && typeof body.time === "string") {
      time = body.time.trim() || time;
    }
    if (typeof body?.partySize === "number" && body.partySize >= 1) {
      partySize = Math.round(body.partySize);
    }
    if (body?.stream === true) streamProgress = true;
  } catch {
    // use defaults
  }

  if (!restaurantName) {
    return NextResponse.json(
      { error: "No restaurant provided. Pass { restaurantName: \"...\" }" },
      { status: 400 }
    );
  }

  const client = new BrowserUse({
    apiKey,
    timeout: 180_000,
    maxRetries: 3,
  });

  const startMs = Date.now();

  const task = `You are on OpenTable (already logged in). Your goal:
1. Search for "${restaurantName}" in "${location}".
2. Click on the first matching restaurant result.
3. Make a reservation for ${date ? `date ${date}` : "the next available date"} for ${partySize} ${partySize === 1 ? "person" : "people"}. Prefer around ${time} if available, but accept ANY available time that evening — do not insist on a specific time.
4. Complete the reservation flow. Do NOT proceed to pay if there is a deposit or payment step — stop after confirming the reservation.
5. CRITICAL - Return format:
   - If you SUCCESSFULLY made a reservation: "SUCCESS: Reservation confirmed at [restaurant name] for [date] at [time] for [party size]."
   - If you FAILED (no availability, no times, restaurant closed, error on page, etc.): "FAILED: [exact reason from the page, e.g. No availability for that date and time]"`;

  let sessionLiveUrl: string | null = null;

  const FAILURE_PHRASES = [
    "no availability",
    "no times available",
    "no reservation",
    "couldn't find",
    "could not find",
    "unavailable",
    "no slots",
    "no openings",
    "fully booked",
    "no tables",
    "not available",
    "nothing available",
  ];

  function isOutputFailure(output: string | undefined): boolean {
    if (!output?.trim()) return false;
    const lower = output.toLowerCase();
    if (lower.startsWith("failed:")) return true;
    return FAILURE_PHRASES.some((p) => lower.includes(p));
  }

  function stepsIndicateFailure(
    steps: Array<{ nextGoal?: string; evaluationPreviousGoal?: string; memory?: string }>
  ): boolean {
    for (const step of steps) {
      const text = [step.nextGoal, step.evaluationPreviousGoal, step.memory]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (FAILURE_PHRASES.some((p) => text.includes(p))) return true;
    }
    return false;
  }

  try {
    const session = await client.sessions.create({
      profileId,
      startUrl: "https://www.opentable.com",
    });

    sessionLiveUrl = session.liveUrl ?? null;

    const runOptions = {
      sessionId: session.id,
      allowedDomains: ["opentable.com", "www.opentable.com"],
      judge: true,
      judgeGroundTruth: `Reservation confirmed at ${restaurantName} for ${date || "the requested date"} (any time that evening is acceptable) for ${partySize} people. The OpenTable page shows a confirmation message.`,
    };

    if (streamProgress) {
      const runHandle = client.run(task, runOptions);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const lastSteps: Array<{
            nextGoal?: string;
            evaluationPreviousGoal?: string;
            memory?: string;
          }> = [];
          try {
            for await (const step of runHandle) {
              const s = step as {
                nextGoal?: string;
                evaluationPreviousGoal?: string;
                memory?: string;
                number?: number;
              };
              lastSteps.push({
                nextGoal: s.nextGoal,
                evaluationPreviousGoal: s.evaluationPreviousGoal,
                memory: s.memory,
              });
              if (lastSteps.length > 5) lastSteps.shift();
              const msg = s.nextGoal ?? `Step ${s.number ?? "?"}`;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "step", message: msg })}\n\n`)
              );
            }
            const result = runHandle.result;
            const output = result?.output ?? "Task completed.";
            const judgeSaysFail = (result as { judgeVerdict?: boolean | null }).judgeVerdict === false;
            const stepsSayFail = stepsIndicateFailure(lastSteps);
            const outputSaysFail = isOutputFailure(output);
            const failed = judgeSaysFail || stepsSayFail || outputSaysFail;
            const elapsedMs = Date.now() - startMs;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: failed ? "error" : "done",
                  success: !failed,
                  output,
                  taskId: result?.id,
                  liveUrl: sessionLiveUrl,
                  elapsedMs,
                  error: failed ? output : undefined,
                  judgeVerdict: (result as { judgeVerdict?: boolean | null }).judgeVerdict,
                  stepsIndicatedFailure: stepsSayFail,
                })}\n\n`
              )
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`)
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const result = await client.run(task, runOptions);
    const output = result.output ?? "Task completed.";
    const steps = (result as { steps?: Array<{ nextGoal?: string; evaluationPreviousGoal?: string; memory?: string }> })
      .steps ?? [];
    const judgeSaysFail = (result as { judgeVerdict?: boolean | null }).judgeVerdict === false;
    const stepsSayFail = stepsIndicateFailure(steps);
    const outputSaysFail = isOutputFailure(output);
    const failed = judgeSaysFail || stepsSayFail || outputSaysFail;
    const elapsedMs = Date.now() - startMs;

    if (failed) {
      return NextResponse.json(
        {
          success: false,
          error: output,
          output,
          taskId: result.id,
          liveUrl: sessionLiveUrl,
          elapsedMs,
          judgeVerdict: (result as { judgeVerdict?: boolean | null }).judgeVerdict,
          stepsIndicatedFailure: stepsSayFail,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      output,
      taskId: result.id,
      liveUrl: sessionLiveUrl,
      elapsedMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "OpenTable agent failed",
        details: message,
        liveUrl: sessionLiveUrl,
      },
      { status: 500 }
    );
  }
}
