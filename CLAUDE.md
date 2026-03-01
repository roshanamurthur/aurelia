# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server on port 3005
npx convex dev       # Start Convex dev server (run in separate terminal, must be running)
npm run build        # Production build
npm run lint         # Run ESLint (flat config, ESLint 9)
```

No test framework is configured.

## Architecture

Aurelia is a **meal planning web app** built with Next.js 16 (App Router) + Convex (real-time backend). An LLM orchestration agent handles user conversations via tool calling — it manages dietary preferences, generates meal plans via Spoonacular, and has integration points for DoorDash/Instacart/OpenTable ordering.

### System Flow

```
User → POST /api/chat → Orchestration Agent (while loop)
                              ↕ Tool calls
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              Convex DB   Spoonacular   Order Events
              (prefs,     (recipes)     (future: Browser
               plans,                    Use agent)
               grocery)
                    ▼
              Real-time subscriptions → Frontend auto-updates
```

### Orchestration Agent (`server/`)

A generic while loop with zero business logic. Three files:

- `server/orchestrationAgent.ts` — The loop: sends conversation + tool definitions to OpenAI (gpt-4o-mini via `AURELIA_LLM_API_KEY`), executes tool calls, feeds results back, repeats until text response.
- `server/toolDefinitions.ts` — 13 tool schemas in OpenAI function-calling format. The LLM reads these to decide which tool to call.
- `server/toolHandlers.ts` — Factory function `createToolHandlers(authToken)` that creates an authenticated `ConvexHttpClient` and returns handler functions. Three categories: Convex handlers (preferences, plans, grocery), Spoonacular handlers (recipe search/details), ordering handlers (DoorDash/Instacart/OpenTable stubs).

**Key rule:** Tool handlers never pass `userId` explicitly — auth flows from the frontend cookie through `convexAuthNextjsToken()`, into `ConvexHttpClient.setAuth()`, and Convex functions use `getAuthUserId(ctx)` internally.

### Convex Backend (`convex/`)

All data lives in Convex. Schema defined in `convex/schema.ts`.

**Tables:**
- `preferences` — Dietary restrictions, allergies, cuisine preferences, macro targets, household size, budget. Indexed on `userId`.
- `mealPlans` — Weekly plans with status ("active"/"archived"). Indexed on `(userId, weekStartDate)` and `(userId, status)`.
- `plannedMeals` — Individual recipe assignments per day/meal slot. Has `isManualOverride` boolean (protects from preference propagation) and `isSkipped`. Indexed on `(mealPlanId, day, mealType)`.
- `groceryLists` — Consolidated ingredient lists per plan. Indexed on `mealPlanId`.
- `orderEvents` — Audit log for DoorDash/Instacart/OpenTable orders. Indexed on `mealPlanId` and `userId`.

**Function files:** `convex/preferences.ts`, `convex/mealPlans.ts`, `convex/groceryList.ts`, `convex/orderEvents.ts`. All use public queries/mutations with `getAuthUserId()` auth checks and ownership verification.

### Auth

Convex Auth (`@convex-dev/auth`) with Password provider (email/password). Configured in `convex/auth.ts`. HTTP routes in `convex/http.ts`. Route protection in `proxy.ts` (Next.js 16 proxy convention) — protects all routes except `/login`, `/signup`, and `/api/auth(.*)`.

Frontend providers: `ConvexAuthNextjsServerProvider` (layout.tsx) + `ConvexAuthNextjsProvider` (providers.tsx).

### Two Data Layers (LLM Behavioral Rule)

The LLM system prompt encodes this critical distinction:
- **Preference changes** ("I'm going vegetarian") → update preferences, then re-evaluate plan meals (skip `isManualOverride: true` meals)
- **One-time plan edits** ("swap Thursday dinner") → modify plan directly, do NOT touch preferences

### API Endpoint

`POST /api/chat` — Accepts `{ message, sessionId? }`. Auth token extracted from cookies via `convexAuthNextjsToken()`. Conversation history stored in-memory with TTL (30min) and max-size (100 sessions) cleanup.

### Environment Variables

In `.env.local`:
- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL (set by `npx convex dev`)
- `CONVEX_DEPLOYMENT` — Convex deployment ID
- `AURELIA_LLM_API_KEY` — OpenAI API key for gpt-4o-mini
- `SPOONACULAR_API_KEY` — Recipe search API

In Convex (set via `npx convex env set` or dashboard):
- `JWT_PRIVATE_KEY`, `JWKS` — Auth signing keys (set by `npx @convex-dev/auth`)
- `SITE_URL` — App URL for auth callbacks

### Styling

Tailwind CSS 4 with custom color palette (rust-*, stone-*). Fonts: Geist Sans/Mono (body), Playfair Display (headings via `font-display` class).

### Path Alias

`@/*` maps to the project root (configured in `tsconfig.json`).

### Key Design Doc

`docs/orchestration_agent_build_doc.md` — Complete build spec for the orchestration agent architecture, including tool definitions, handler patterns, data flow examples, and Browser Use agent integration points.
