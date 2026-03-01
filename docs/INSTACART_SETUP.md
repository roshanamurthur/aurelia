# Instacart + Browser Use Setup

This guide explains how to give your Browser Use profile access to Instacart so the agent can add grocery list items to your cart.

---

## How It Works (Same as DoorDash)

**One profile, multiple sites.** Your Browser Use profile is a snapshot of your Chrome profile — it includes cookies for *all* sites you're logged into. So:

- If you're logged into **DoorDash** in Chrome → profile has DoorDash cookies
- If you're logged into **Instacart** in Chrome → profile has Instacart cookies
- **Same profile, same `BROWSER_USE_PROFILE_ID`** — no extra config

---

## Step 1: Log into Instacart in Chrome

1. Open **Chrome** (the same profile you use for DoorDash)
2. Go to [instacart.com](https://www.instacart.com)
3. Log in with your email and password
4. Complete any 2FA if prompted
5. Confirm you're fully logged in (you see your account, saved address, etc.)
6. Leave Chrome open or don't clear cookies

---

## Step 2: Re-sync Your Profile (If Needed)

If you already ran the profile sync for DoorDash *before* logging into Instacart, you need to re-sync so the profile picks up Instacart cookies:

```bash
export BROWSER_USE_API_KEY=bu_your_actual_key_here && curl -fsSL https://browser-use.com/profile.sh | sh
```

- Select the **same Chrome profile** you used before
- The script will overwrite/update the existing profile with the new cookies
- Your Profile ID stays the same — no need to change `.env`

**If you logged into Instacart before your first sync:** You're done. The profile already has Instacart cookies.

---

## Step 3: Verify Your Env

Your `.env.local` or `.env.doordash` should have:

```
BROWSER_USE_API_KEY=bu_...
BROWSER_USE_PROFILE_ID=profile_...
```

No separate Instacart env vars — the same profile works for both.

---

## Step 4: Test the Instacart Button

1. Restart your dev server
2. Generate a meal plan and grocery list
3. Click **Order on Instacart** in the grocery list section
4. The agent will open Instacart (already logged in), search each item, and add to cart
5. You can watch the live browser at the URL returned in the response

---

## Flow: Grocery List → Instacart Cart

1. **User** clicks "Order on Instacart" (or chat: "order my groceries on Instacart")
2. **API** receives the grocery list items (name, amount, unit)
3. **Browser Use** creates a session with your profile → Instacart opens, already logged in
4. **Agent** for each item: search → add first/best match to cart
5. **Agent** does NOT proceed to checkout — cart is ready for you to review
6. **User** goes to Instacart, reviews cart, chooses delivery time, checks out

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Agent asks for Instacart login | Re-sync profile after logging into Instacart in Chrome |
| Wrong delivery address | Instacart uses your saved address; update it at instacart.com/account |
| Items not found | Agent adds first search result; some items may need manual adjustment |
| Session timeout | Profile sessions can expire; re-sync if it keeps asking for login |

---

## Optional: Instacart Skill (Future)

Like DoorDash, you can record a **skill** for "add item to Instacart cart" to make the flow faster and more reliable. That would require:

1. Recording a skill at [cloud.browser-use.com](https://cloud.browser-use.com)
2. Refining it to work with profile sessions (skip login)
3. Adding `BROWSER_USE_INSTACART_SKILL_ID` to env

For now, the agent-based flow works without a skill.
