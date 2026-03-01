# Connect Your Recorded Skill to an Already-Logged-In Profile

You recorded a skill: sign in → search "chicken bowl" → add to cart. To make it work when the user is **already logged in** (profile sync), follow these steps.

---

## Step 1: Get your skill ID

1. Go to https://cloud.browser-use.com/skills
2. Find the skill you just recorded (the one with login → search → add to cart)
3. Click it and copy the **Skill ID** (a UUID like `d21775fb-e6d3-42f8-b0b6-c4340be3a375`)

---

## Step 2: Add the skill ID to `.env.local`

Open `.env.local` in the project root and add:

```
BROWSER_USE_SKILL_ID=your-skill-uuid-here
```

Replace `your-skill-uuid-here` with the actual UUID from Step 1.

**Example:**
```
BROWSER_USE_SKILL_ID=d21775fb-e6d3-42f8-b0b6-c4340be3a375
```

You must also have:
```
BROWSER_USE_API_KEY=bu_...
BROWSER_USE_PROFILE_ID=...
```

(The profile is the one with your DoorDash login — see [PROFILE_SYNC_GUIDE.md](./PROFILE_SYNC_GUIDE.md) if needed.)

---

## Step 3: Refine the skill so it skips login when already logged in

From the project root, run:

```bash
npm run refine-skill
```

Or:

```bash
node scripts/refine-doordash-skill.mjs
```

This sends feedback to Browser Use to:
- Skip the login step when the session has a profile with DoorDash cookies
- Make cookie params optional
- Accept `query` as the main parameter

Refinement takes ~30 seconds. Check status at https://cloud.browser-use.com/skills — the skill will show "generating" or similar while it runs.

---

## Step 4: Test

1. Restart your dev server if it’s running
2. Go to the meal plan page
3. Click "Order from DoorDash" or "Random Chipotle bowl"
4. The app will create a session with your profile (already logged in) and run the skill

If the skill succeeds, you’ll see `(skill · Xs)` in the success message. If it falls back to the agent, you’ll see `[Skill skipped: ...]` — check the reason and run the refine script again with adjusted feedback if needed.
