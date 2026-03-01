# Aurelia Authentication Setup

This app uses **Auth.js (NextAuth v5)** with **Credentials** (email/password) and **MongoDB** for user storage. Here’s how to get it working.

---

## 1. Generate AUTH_SECRET

Auth.js needs a secret to sign and encrypt JWTs. Generate one:

```bash
openssl rand -base64 32
```

Copy the output and add it to `.env.local`:

```
AUTH_SECRET=paste_your_generated_secret_here
```

**Why this matters:** Without `AUTH_SECRET`, Auth.js cannot create secure sessions. Login will fail or redirect incorrectly.

---

## 2. Required Environment Variables

Add these to `.env.local`:

```env
# Required for auth
AUTH_SECRET=your_32_char_base64_secret
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/aurelia

# Optional: for local dev, Auth.js will trust the host
# AUTH_TRUST_HOST=true
```

- **AUTH_SECRET** – Required. Used to sign JWTs.
- **MONGODB_URI** – Required. Used for `auth_users` and preferences.
- **AUTH_TRUST_HOST** – Optional. Set to `true` if you see “Host must be trusted” errors (e.g. with `ngrok` or custom domains).

---

## 3. MongoDB Collections

The app uses these collections in the `aurelia` database:

| Collection       | Purpose                                      |
|------------------|----------------------------------------------|
| `auth_users`     | User accounts (email, passwordHash, name)    |
| `user_preferences` | Meal preferences per user                 |
| `meal_plans`     | Saved meal plans                             |

**Auth.js adapter collections** (created automatically when used):

- `users`, `accounts`, `sessions`, `verification_tokens`

With **Credentials**, we use our own `auth_users` collection. The adapter is configured but mainly used for OAuth if you add providers later.

---

## 4. User Document Format (`auth_users`)

Each user document:

```json
{
  "_id": ObjectId("..."),
  "email": "user@example.com",
  "passwordHash": "$2a$12$...",
  "name": "Jane",
  "createdAt": ISODate("...")
}
```

- `email` – Unique, lowercase
- `passwordHash` – bcrypt hash (cost 12)
- `name` – Display name
- `createdAt` – Registration time

---

## 5. Auth Flow

1. **Sign up** – `POST /api/auth/register` creates a user in `auth_users`.
2. **Sign in** – `signIn("credentials", { email, password })` checks `auth_users` and creates a JWT session.
3. **Session** – JWT stored in a cookie; `session.user.id` is the MongoDB `_id` string.
4. **Meal plan** – Uses `session.user.id` as `userId` for preferences and plans.

---

## 6. Why Auth.js + JWT Instead of “Traditional” Auth?

| Traditional (e.g. session in DB) | Auth.js + JWT (this app) |
|----------------------------------|---------------------------|
| Session stored in database      | Session in signed JWT cookie |
| DB lookup on every request      | No DB lookup for session validation |
| Need Redis/DB for sessions       | Stateless; works without extra infra |
| Harder to scale horizontally    | Easy to scale (no shared session store) |
| More moving parts               | Fewer dependencies |

**Benefits of this setup:**

- **Stateless** – No session table; JWT is self-contained.
- **MongoDB-friendly** – Uses your existing MongoDB for users; no Redis.
- **Standard** – Auth.js is the standard for Next.js auth.
- **Flexible** – Easy to add OAuth (Google, GitHub) later.

---

## 7. Quick Checklist

- [ ] `AUTH_SECRET` set in `.env.local` (from `openssl rand -base64 32`)
- [ ] `MONGODB_URI` set and reachable
- [ ] Restart dev server after changing env vars
- [ ] Create a user via `/signup`
- [ ] Sign in at `/login`

---

## 8. Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid email or password" | Check user exists in `auth_users`; verify password hash. |
| Redirect loops | Ensure `AUTH_SECRET` is set and restart the server. |
| "Host must be trusted" | Add `AUTH_TRUST_HOST=true` or set `AUTH_URL` to your app URL. |
| Session is null | Ensure `SessionProvider` wraps the app (see `app/providers.tsx`). |
