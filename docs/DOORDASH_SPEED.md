# DoorDash Agent Speed

## Current optimizations

- **Flash mode** — Skips evaluation, next-goal, and thinking; uses memory only. Enabled by default.
- **Faster model** — Uses `gemini-2.5-flash` instead of the default for lower latency.

## Skills (fastest path)

Skills are pre-trained flows that run faster than the general agent. When the skill succeeds, you see `(skill · Xs)` instead of `(agent · Xs)`.

### Setup

1. Add `BROWSER_USE_SKILL_ID` to `.env.local` with your DoorDash skill ID.
2. Use **profile sync** (`BROWSER_USE_PROFILE_ID`) — the skill path only runs with a profile session (already logged in).

### If the skill fails

The skill may expect cookie params (`authState`, `ddweb_session_id`, etc.) that aren’t available with a profile session. To make those optional:

```bash
npm run refine-skill
```

This runs `scripts/refine-doordash-skill.mjs`, which asks the Browser Use API to make cookie params optional when a session with a profile is used. Refinement takes ~30 seconds; check status at https://cloud.browser-use.com/skills.

### Creating a new skill

1. Go to https://cloud.browser-use.com/skills
2. Create a skill with goal: “Search DoorDash for a query, open first restaurant, add one matching item to cart, return summary. Do NOT checkout.”
3. Add `query` (string) and optionally `session_id` as parameters.
4. Copy the skill ID into `BROWSER_USE_SKILL_ID`.
