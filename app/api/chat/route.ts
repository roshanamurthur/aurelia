// app/api/chat/route.ts
//
// The single endpoint the frontend calls for the orchestration agent.
// Auth token is extracted from cookies via Convex Auth's Next.js integration.

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { handleUserMessage } from "../../../server/orchestrationAgent";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

interface Session {
  history: ChatCompletionMessageParam[];
  lastAccess: number;
}

const MAX_SESSIONS = 100;
const MAX_SESSION_AGE_MS = 30 * 60 * 1000; // 30 minutes

const sessions = new Map<string, Session>();

function cleanSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastAccess > MAX_SESSION_AGE_MS) {
      sessions.delete(key);
    }
  }
  if (sessions.size > MAX_SESSIONS) {
    // Delete oldest sessions
    const sorted = [...sessions.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (let i = 0; i < sorted.length - MAX_SESSIONS; i++) {
      sessions.delete(sorted[i][0]);
    }
  }
}

export async function POST(req: Request) {
  const token = await convexAuthNextjsToken();

  if (!token) {
    return Response.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  cleanSessions();

  const { message, sessionId } = await req.json();

  if (!message) {
    return Response.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  // Use sessionId if provided, otherwise derive from token (server-side memory only)
  const sessionKey = sessionId || token;
  const session = sessions.get(sessionKey);
  const history = session?.history || [];

  try {
    const { reply, conversationHistory, action } = await handleUserMessage(
      token,
      message,
      history
    );

    // Save updated history with timestamp
    sessions.set(sessionKey, {
      history: conversationHistory,
      lastAccess: Date.now(),
    });

    return Response.json({
      reply,
      ...(action && { navigateTo: action.to }),
    });
  } catch (error: any) {
    console.error("Orchestration agent error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
