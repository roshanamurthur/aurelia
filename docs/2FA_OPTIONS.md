# Overcoming DoorDash 2FA

See [DOORDASH_AUTH.md](./DOORDASH_AUTH.md) for the full auth overview.

DoorDash requires two-factor authentication (2FA) at login. The Browser Use agent cannot complete 2FA prompts (SMS, authenticator app) when you pass plain email/password. Use one of these methods instead:

---

## Option 1: Profile Sync (Recommended)

**Best for:** One-time setup, no 1Password needed.

1. Log into DoorDash in Chrome (complete 2FA manually).
2. Run the profile sync script to upload your cookies to Browser Use Cloud.
3. The agent uses your synced session — no login or 2FA needed.

**Setup:** See [PROFILE_SYNC_GUIDE.md](./PROFILE_SYNC_GUIDE.md).

**Note:** Profiles can expire (cookies). Re-sync every ~7 days or when login is required again.

---

## Option 2: 1Password Integration

**Best for:** Automatic 2FA — store your TOTP in 1Password and the agent uses it during login.

### Prerequisites

- 1Password account
- DoorDash credentials + TOTP stored in 1Password (add a "One-Time Password" field to your DoorDash login item)

### Setup

1. **Create a dedicated vault** in 1Password (e.g. "Browser Use").
2. **Add your DoorDash login** to that vault:
   - Username (email)
   - Password
   - **One-Time Password** (TOTP) — add the 2FA secret from DoorDash so 1Password can generate codes
3. **Create a 1Password Service Account**:
   - Go to [1Password Developer Tools → Service Accounts](https://my.1password.com/developer-tools/active/service-accounts)
   - Create a new service account
   - Grant **read** access to your "Browser Use" vault
   - Copy the service account token
4. **Connect to Browser Use Cloud**:
   - Go to [cloud.browser-use.com/settings?tab=secrets](https://cloud.browser-use.com/settings?tab=secrets)
   - Click "Create Integration" → 1Password
   - Paste your service account token
   - Save
5. **Get your vault ID**:
   - With 1Password CLI: `op vault list` (shows vault IDs)
   - Or in 1Password.com: Vault → Settings → copy the vault ID
6. **Add to `.env.doordash` or `.env.local`**:

   ```
   BROWSER_USE_API_KEY=bu_your_key
   BROWSER_USE_OP_VAULT_ID=your_1password_vault_id
   ```

7. Restart your dev server and use **Order on DoorDash**. The agent will log in using 1Password and auto-fill the TOTP when 2FA is prompted.

---

## Option 3: Manual Code Entry (No Gmail App Password Needed)

**Best for:** When you can't create a Gmail App Password (work/school account, Advanced Protection, etc.).

1. Add to `.env.doordash`:
   ```
   BROWSER_USE_API_KEY=bu_your_key
   DOORDASH_EMAIL=your_email@example.com
   DOORDASH_PASSWORD=your_doordash_password
   ```

2. Click **Order on DoorDash** (or "Try with login").

3. The agent logs in. When it hits 2FA, a prompt appears: **"Check your email for the 6-digit code."**

4. Open your email, copy the code from DoorDash, paste it in the box, click **Submit**.

5. The agent enters the code and completes the order flow.

No Gmail API or App Password required — you just type the code when asked.

---

## Option 4: Gmail + Email 2FA (Automated)

**Best for:** DoorDash accounts that use **email** for 2FA (not SMS or authenticator). The agent logs in, DoorDash sends a code to your email, and we fetch it via Gmail IMAP.

### Prerequisites

- DoorDash account with **email** as the 2FA method (not SMS)
- Gmail account that receives the DoorDash 2FA codes (usually the same as `DOORDASH_EMAIL`)

### Setup

1. **Enable 2FA via email on DoorDash** (if not already):
   - DoorDash → Account → Security
   - Choose "Email" as your verification method

2. **Create a Gmail App Password**:
   - Go to [Google Account → Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if needed
   - Go to "App passwords" → Generate one for "Mail"
   - Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

3. **Add to `.env.doordash`**:

   ```
   BROWSER_USE_API_KEY=bu_your_key
   DOORDASH_EMAIL=your_email@gmail.com
   DOORDASH_PASSWORD=your_doordash_password
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

4. Restart your dev server. Click **Order on DoorDash** (or "Try with login" to force this flow).

**How it works:** The agent logs in → DoorDash sends a 6-digit code to your email → we poll Gmail via IMAP and extract the code → the agent enters it and completes the order flow.

---

## Option 5: Plain Credentials (Not Recommended)

Without manual code entry or Gmail, the agent will fail at 2FA. Use Option 1, 2, 3, or 4 instead.

---

## Summary

| Method        | 2FA handling              | Setup effort |
|---------------|---------------------------|--------------|
| Profile sync  | Already logged in         | Low          |
| 1Password     | Auto TOTP from vault      | Medium       |
| Manual code   | You type the code when prompted | None   |
| Gmail + email | Auto-fetch code from inbox| Low (if app passwords work) |
