# Why Sign-In Fails: JWT_PRIVATE_KEY

## What's happening

When you click "Sign in", your app calls Convex Auth. Convex Auth runs **in the Convex cloud** (not on your machine). To create a session token, it needs `JWT_PRIVATE_KEY` and `JWKS` from the **Convex deployment's environment variables**.

Your `.env.local` has:
```
CONVEX_DEPLOYMENT=dev:wonderful-anaconda-567
NEXT_PUBLIC_CONVEX_URL=https://wonderful-anaconda-567.convex.cloud
```

So your app talks to the `wonderful-anaconda-567` deployment. That deployment does **not** have `JWT_PRIVATE_KEY` set. Hence the error.

## Important: Two different places for env vars

| Variable | Where it goes | Why |
|----------|---------------|-----|
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | `.env.local` (your machine) | Tells your Next.js app which Convex deployment to use |
| `JWT_PRIVATE_KEY`, `JWKS` | **Convex Dashboard** (cloud) | Convex Auth runs in the cloud and reads these there |

**Putting JWT_PRIVATE_KEY in .env.local does nothing** — Convex never reads your local .env file.

## Fix (choose one)

### Option A: Run the setup wizard (recommended)

```bash
cd aurelia-prehack
npx @convex-dev/auth
```

1. When asked for SITE_URL, enter: `http://localhost:3005`
2. When asked to overwrite keys, say Yes
3. Finish the wizard — it will set JWT_PRIVATE_KEY and JWKS in your Convex deployment

### Option B: Set manually in Convex Dashboard

1. Go to https://dashboard.convex.dev
2. Select your deployment (wonderful-anaconda-567)
3. Settings → Environment Variables
4. Add `JWT_PRIVATE_KEY` and `JWKS`

To generate the values:
```bash
npm install jose
node scripts/generate-jwt-keys.mjs
```
Copy the output and paste into the dashboard.

### Option C: Use convex env set

After generating keys (Option B), run:
```bash
npx convex env set JWT_PRIVATE_KEY "-----BEGIN PRIVATE KEY----- ..."
npx convex env set JWKS '{"keys":[...]}'
```

## After setting the keys

Restart `npx convex dev` so it picks up the new env vars. Sign-in should work.
