# DoorDash Integration — Files to Copy to a New Version

Use this when moving DoorDash to a new codebase (different UI, different database). The DoorDash logic is **self-contained** and does not depend on MongoDB, meal planning, or Aurelia-specific UI.

---

## Required Files (copy these)

| File | Purpose |
|------|---------|
| `app/api/doordash/route.ts` | API route — all DoorDash/Browser Use logic (profile, skill, agent, 2FA flows) |
| `lib/fetch-2fa-code.ts` | Fetches DoorDash 2FA code from Gmail via IMAP (only needed if using Gmail auto-2FA) |

---

## Optional Files

| File | Purpose |
|------|---------|
| `scripts/refine-doordash-skill.mjs` | Refines skill to work with profile sessions (run `npm run refine-skill`) |
| `data/chipotle-bowls.csv` | CSV for "Random Chipotle bowl" — name + calories per row |

---

## Dependencies (add to package.json)

```json
{
  "dependencies": {
    "browser-use-sdk": "^3.1.0"
  },
  "devDependencies": {},
  "optionalDependencies": {
    "imapflow": "^1.2.10"
  }
}
```

- **browser-use-sdk** — required for DoorDash
- **imapflow** — only if using Gmail auto-2FA (`fetch-2fa-code.ts`)

---

## Environment Variables

Add to `.env.local` (or `.env.doordash` as fallback):

```
BROWSER_USE_API_KEY=bu_...          # Required — get at cloud.browser-use.com
BROWSER_USE_PROFILE_ID=...          # Profile sync (recommended — no 2FA)
BROWSER_USE_SKILL_ID=...            # Optional — faster than agent when used with profile

# If not using profile: pick one auth method
BROWSER_USE_OP_VAULT_ID=...         # 1Password — auto TOTP
DOORDASH_EMAIL=...                  # Credentials + manual or Gmail 2FA
DOORDASH_PASSWORD=...
GMAIL_APP_PASSWORD=...              # If using Gmail auto-2FA
```

---

## Config Changes

**next.config.ts** — expose API key for client (optional):

```ts
env: {
  BROWSER_USE_API_KEY: process.env.BROWSER_USE_API_KEY,
},
```

**package.json** — add script (optional):

```json
"refine-skill": "node scripts/refine-doordash-skill.mjs"
```

---

## API Contract

**POST** `/api/doordash`

**Request body:**
```json
{
  "searchIntent": "healthy dinner",   // optional, default "healthy dinner"
  "useChipotleCsv": false,            // optional — pick random from data/chipotle-bowls.csv
  "forceCredentials": false,          // optional — skip profile, use email/password
  "phase": "2fa",                     // optional — for manual 2FA flow
  "code": "123456",                   // required when phase=2fa
  "sessionId": "uuid"                 // required when phase=2fa
}
```

**Success response (200):**
```json
{
  "success": true,
  "output": "Added Chicken Bowl to cart from Chipotle. Cart is ready for checkout.",
  "liveUrl": "https://...",
  "method": "skill" | "run",
  "elapsedMs": 45000
}
```

**2FA required (200):**
```json
{
  "needs2FA": true,
  "sessionId": "uuid",
  "liveUrl": "https://..."
}
```

**Error (500):**
```json
{
  "error": "DoorDash agent failed",
  "details": "...",
  "liveUrl": "https://..."
}
```

---

## UI Component — What You Need

Your new app needs a component that:

1. Calls `POST /api/doordash` with `{ searchIntent?, useChipotleCsv?, forceCredentials? }`
2. If `needs2FA` → show 6-digit input, then call again with `{ phase: "2fa", code, sessionId }`
3. If success → show `output` (status, item, restaurant) and `liveUrl` link
4. If error → show error message

You can copy `app/meal-plan/components/TakeoutCard.tsx` and adapt it — it contains the full logic, state, and parsing. Or build a minimal version that only does the fetch and displays the result.

---

## What Does NOT Need to Change

- **Database** — DoorDash uses Browser Use Cloud only; no DB
- **Auth** — Your app’s auth is separate; DoorDash uses its own session/profile
- **Meal plan** — DoorDash is independent; you just need a button to trigger it

---

## Summary Checklist

- [ ] Copy `app/api/doordash/route.ts`
- [ ] Copy `lib/fetch-2fa-code.ts` (if using Gmail 2FA)
- [ ] Copy `scripts/refine-doordash-skill.mjs` (optional)
- [ ] Copy `data/chipotle-bowls.csv` (optional)
- [ ] Add `browser-use-sdk` (and `imapflow` if Gmail 2FA)
- [ ] Add env vars to `.env.local`
- [ ] Add a UI component that calls `/api/doordash` and displays results
