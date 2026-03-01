# 1Password Setup for DoorDash (Fully Automated)

See [DOORDASH_AUTH.md](./DOORDASH_AUTH.md) for all auth options.

One-time setup. After this, the agent handles login + 2FA automatically — you do nothing.

**Requirement:** DoorDash must use **authenticator app** (TOTP) for 2FA, not email or SMS.

---

## Step 1: Add DoorDash to 1Password

1. Open 1Password → create or open a vault (e.g. "Browser Use").
2. Add a **Login** item:
   - **Title:** DoorDash
   - **Username:** your DoorDash email (e.g. dishagupta830@gmail.com)
   - **Password:** your DoorDash password
3. Add **One-Time Password** (TOTP):
   - In DoorDash: Account → Security → 2-Step Verification
   - Choose **Authenticator app** (Google Authenticator, etc.)
   - When you see the QR code, in 1Password click **+** → **One-Time Password**
   - Scan the QR code (or enter the secret manually)
   - 1Password will now generate the same 6-digit codes

---

## Step 2: Create 1Password Service Account

1. Go to [1Password Developer → Service Accounts](https://my.1password.com/developer-tools/active/service-accounts)
2. Click **New Service Account**
3. Name it "Browser Use" (or similar)
4. Grant **read** access to the vault with your DoorDash login
5. Copy the **service account token** (starts with `ops_`)

---

## Step 3: Connect to Browser Use Cloud

1. Go to [cloud.browser-use.com/settings?tab=secrets](https://cloud.browser-use.com/settings?tab=secrets)
2. Click **Create Integration** → **1Password**
3. Paste your service account token
4. Save

---

## Step 4: Get Your Vault ID

- **1Password CLI:** `op vault list` (shows vault IDs)
- **Or** in 1Password.com: Vault → Settings → copy the vault ID (long alphanumeric string)

---

## Step 5: Add to .env.doordash

```
BROWSER_USE_API_KEY=bu_your_key
BROWSER_USE_OP_VAULT_ID=your_vault_id_here
```

Restart your dev server. Click **Order on DoorDash** — the agent logs in and enters 2FA automatically.
