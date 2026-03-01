# Plan: Browser Use Feature Expansion

## Context

Aurelia already has DoorDash (full) and Instacart (full) Browser Use integrations, plus an OpenTable stub. The goal is to add 3 new Browser Use features that push the limits of browser automation, solve real user problems, and create visible demo moments that wow judges. Branch: `browser-use-feature`.

---

## Features (3, ordered by implementation priority)

### Feature 1: OpenTable Smart Reservation (two-phase: search → book)

**Trigger**: User says "Book a restaurant for Friday dinner for 2" or "Find me a nice Italian place."

**What happens**:
1. Orchestrator calls `search_opentable_restaurants` with cuisine/location/date/time/partySize
2. Browser Use opens opentable.com, searches, extracts top 5 results (name, rating, price range, available times, booking URL) as structured data
3. Orchestrator presents options in chat, user picks one
4. Orchestrator calls `confirm_opentable_reservation` with the chosen restaurant
5. Browser Use completes the booking (stops before credit card entry)
6. Meal plan slot updates in real-time with restaurant name

**Files to create**:
- `app/api/opentable/route.ts` — Two-phase Browser Use route (search + book). Follows exact pattern of `app/api/doordash/route.ts`: env loading, `BrowserUse` client, `sessions.create({ profileId, startUrl })`, `client.run(task, options)`, retry logic. ~130 lines.

**Files to modify**:
- `server/toolDefinitions.ts` — Replace `initiate_opentable_reservation` with two tools: `search_opentable_restaurants` (returns restaurant list) and `confirm_opentable_reservation` (books selected restaurant, accepts `sessionId` from search step for session reuse)
- `server/toolHandlers.ts` — Replace OpenTable stub with two handlers. Search handler calls `/api/opentable` with `phase: "search"`, returns restaurants + sessionId. Confirm handler calls with `phase: "book"`, logs orderEvent with action `"confirmed"`
- `server/orchestrationAgent.ts` — Add rule 17: multi-step OpenTable flow (search → present options → user picks → book). Mark slot as `isTakeout: true, takeoutService: "opentable"`
- `app/meal-plan/page.tsx` — When `meal.isTakeout && meal.takeoutService === "opentable"`, show restaurant name + "Reserved" badge instead of Order Takeout button

### Feature 2: Restaurant Menu Intelligence (novel — scrape real menus)

**Trigger**: User says "What's on the menu at Flour + Water?" or "I'm eating at Kokkari tonight, what should I order?"

**What happens**:
1. Orchestrator calls `scrape_restaurant_menu` with restaurant name + location
2. Browser Use googles the restaurant, navigates to their official website menu page, scrolls through entire menu, extracts all items with prices/descriptions/dietary flags
3. Handler enriches with user's dietary preferences from Convex + taste memories from SuperMemory
4. Orchestrator recommends specific dishes matching preferences, estimates meal cost, flags dietary conflicts
5. If user picks a dish, orchestrator updates the meal slot with the actual dish name and price

**Why this wows judges**: No meal planner reads actual restaurant websites. DoorDash shows delivery menus with inflated prices. This reads the source of truth. Combined with OpenTable, it creates a full "discover menu → pick dish → book table" pipeline.

**Files to create**:
- `app/api/menu-scrape/route.ts` — Browser Use route. Searches Google for "[restaurant] menu [location]", navigates to official site, extracts structured menu data (items, prices, categories, dietary flags, daily specials). ~100 lines.

**Files to modify**:
- `server/toolDefinitions.ts` — Add `scrape_restaurant_menu` tool: `restaurantName` (required), `restaurantUrl` (optional, skips search), `location`, `dietaryFilters`, `mealPlanId`
- `server/toolHandlers.ts` — Handler calls `/api/menu-scrape`, auto-loads user's dietary preferences from Convex if `dietaryFilters` not provided, computes price range summary, returns structured menu to LLM
- `server/orchestrationAgent.ts` — Add rule 18: when user mentions a specific restaurant, call `scrape_restaurant_menu`. Use results to recommend dishes, estimate cost, flag restrictions. Combine with `search_opentable_restaurants` for full discover→decide→book flow

### Feature 3: YouTube Recipe Coach (find cooking tutorials)

**Trigger**: User clicks "Watch Tutorial" on a meal card, or says "Show me how to make the Mediterranean Egg Scramble."

**What happens**:
1. Orchestrator calls `find_recipe_video` with recipe name
2. Browser Use opens YouTube, searches "[recipe name] recipe tutorial", extracts top 3-5 results (title, channel, views, duration, URL, thumbnail)
3. Clicks into the best match, extracts timestamps/steps from description or chapter markers
4. Returns structured video data with cooking timeline
5. Video URL saved to the meal's `sourceUrl` field; UI shows "Watch Tutorial" link

**Why this wows judges**: Bridges "here's a recipe" and "here's how to cook it." YouTube is the world's largest recipe resource but has no structured API. Browser Use extracts what APIs can't.

**Files to create**:
- `app/api/recipe-video/route.ts` — Browser Use route. Searches YouTube, extracts video metadata, enters top result, extracts timestamps. ~90 lines.

**Files to modify**:
- `server/toolDefinitions.ts` — Add `find_recipe_video` tool: `recipeName` (required), `ingredients` (optional, helps refine search)
- `server/toolHandlers.ts` — Handler calls `/api/recipe-video`, returns video data (URL, title, channel, timestamps). If video found and `mealPlanId`/`day`/`mealType` provided, updates meal's `sourceUrl`
- `app/meal-plan/page.tsx` — Add "Watch Tutorial" button to expanded recipe cards. When `sourceUrl` contains "youtube.com", show a YouTube icon link

---

## Implementation Order

1. **OpenTable** — Lowest risk (stub exists, follows DoorDash pattern exactly, completes the ordering trifecta)
2. **Menu Scrape** — Highest novelty (pairs with OpenTable for full dining flow, results flow through chat with no new UI components)
3. **Recipe Video** — Most relatable (quick to implement, visible UI impact)

## Files Summary

| File | Action | Features |
|------|--------|----------|
| `app/api/opentable/route.ts` | Create | OpenTable |
| `app/api/menu-scrape/route.ts` | Create | Menu Intelligence |
| `app/api/recipe-video/route.ts` | Create | Recipe Video |
| `server/toolDefinitions.ts` | Modify | All 3 (add 4 new tools, replace 1 stub) |
| `server/toolHandlers.ts` | Modify | All 3 (add 4 new handlers, replace 1 stub) |
| `server/orchestrationAgent.ts` | Modify | All 3 (add rules 17-19) |
| `app/meal-plan/page.tsx` | Modify | OpenTable badge + Recipe Video link |

## No Schema Changes Required

All features use existing Convex fields:
- `isTakeout` / `takeoutService` / `takeoutDetails` for restaurant meals
- `sourceUrl` for YouTube video links
- `orderEvents` table for audit logging

## Environment Requirements

No new env vars. All features use the same `BROWSER_USE_API_KEY` and `BROWSER_USE_PROFILE_ID` as DoorDash/Instacart. User just needs to also log into OpenTable in their Chrome profile before syncing.

## Verification

1. `npm run build` — no TypeScript errors
2. OpenTable: "Find me Italian near Mission SF for Friday, party of 2" → search returns restaurants → user picks → booking completes → meal plan updates with reservation badge
3. Menu Scrape: "What's on the menu at Flour + Water?" → Browser Use navigates to restaurant site → structured menu returned → LLM recommends dishes with prices
4. Recipe Video: "Show me how to make [recipe name]" → YouTube search → video details returned → sourceUrl updated → "Watch Tutorial" link appears on meal card
5. Full dining flow: Menu scrape → pick dish → OpenTable book → meal plan shows dish name + "Reserved" badge

## Demo Script (Judge Wow Moments)

**Moment 1 — The Trifecta** (30s): "Aurelia can order DoorDash delivery, fill your Instacart cart, AND book OpenTable reservations — all through natural conversation."

**Moment 2 — Menu Intelligence** (60s): "I'm thinking about Flour + Water for Saturday. What should I order?" → Browser navigates to the real restaurant website, extracts 40+ menu items with prices → personalized recommendations based on dietary preferences + taste memory.

**Moment 3 — Full Pipeline** (90s): Menu scrape → "The pappardelle sounds great" → OpenTable search → "Book Flour + Water at 7:30" → reservation confirmed → Saturday dinner shows "Pappardelle with Pork Sugo - Flour + Water ($28)" with a Reserved badge.

**Moment 4 — Recipe Coach** (30s): Click any home-cooked meal → "Watch Tutorial" → Browser Use finds the best YouTube cooking video with step-by-step timestamps.
