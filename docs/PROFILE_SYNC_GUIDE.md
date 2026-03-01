# Browser Use Profile Sync – Step-by-Step Guide

Use this to avoid 2FA when the DoorDash agent runs. The script **uploads your existing Chrome profile** (cookies, logins) to Browser Use Cloud. You must be logged into DoorDash in Chrome *before* running it.

**Other options:** [1Password](./1PASSWORD_SETUP.md) (fully automated) | [2FA options](./2FA_OPTIONS.md) | [Overview](./DOORDASH_AUTH.md)

---

## Step 0: Log into DoorDash in Chrome first

1. Open **Chrome** (the script only syncs Chrome profiles)
2. Go to [doordash.com](https://www.doordash.com)
3. Log in with your email and password
4. Complete 2FA (SMS or authenticator)
5. Confirm you're fully logged in (you see your account)
6. Leave Chrome open or at least don't clear cookies

---

## Step 1: Get your Browser Use API key

1. Go to [cloud.browser-use.com](https://cloud.browser-use.com)
2. Sign in or create an account
3. Open **Settings** → **API Keys**
4. Copy your API key (starts with `bu_`)

---

## Step 2: Run the profile sync script

In Terminal, run (put your real API key in the same line):

```bash
export BROWSER_USE_API_KEY=bu_your_actual_key_here && curl -fsSL https://browser-use.com/profile.sh | sh
```

Replace `bu_your_actual_key_here` with your real key.

**What happens:**
- Downloads the profile-use tool
- Lets you **select which Chrome profile** to sync (it reads your existing Chrome data)
- Uploads that profile's cookies to Browser Use Cloud
- Prints a **Profile ID** at the end (e.g. `profile_abc123xyz`)

**Note:** The script uses your existing Chrome – it doesn't open a new browser. Make sure you're logged into DoorDash in Chrome before running it.

---

## Step 3: Get your Profile ID

**Option A:** Check the script output – it should print the Profile ID when done.

**Option B:** If you didn't see it, go to [cloud.browser-use.com/settings?tab=profiles](https://cloud.browser-use.com/settings?tab=profiles) – your synced profiles and their IDs are listed there.

---

## Step 4: Add the Profile ID to your project

Add to `.env.doordash` (or `.env.local`):

```
BROWSER_USE_PROFILE_ID=profile_your_id_here
```

Replace with your actual Profile ID.

---

## Step 5: Test the DoorDash button

1. Restart your dev server
2. Open the meal plan and click **Order on DoorDash** on a takeout day
3. The agent should use your synced session and skip login/2FA

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Script used my browser, no Profile ID | Check [cloud.browser-use.com/settings?tab=profiles](https://cloud.browser-use.com/settings?tab=profiles) – the profile may have been created |
| No instructions from script | The tool may run in the background; wait for it to finish and check the terminal output |
| Script fails or hangs | Ensure Chrome is installed and you've logged into DoorDash in Chrome first |
| Agent still asks for login | Profile may have expired; re-sync (log in again in Chrome, then run the script again) |

---

## Alternative: Create profile via API, then warm up

If the script doesn't work, you can create a profile via the Browser Use API and "warm it up" by running a login task once. You'd complete 2FA manually in the live view. See the Browser Use docs for `profiles.create()`.
