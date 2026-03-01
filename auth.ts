import fs from "fs";
import path from "path";

// Load AUTH_SECRET directly from .env.local (bypasses dotenv only loading 2 vars in some Next.js/Turbopack contexts)
function loadAuthSecret(): string | undefined {
  const envPath = path.resolve(process.cwd(), ".env.local");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/^AUTH_SECRET=(.+)$/m);
    return match?.[1]?.trim() || process.env.AUTH_SECRET?.trim();
  } catch {
    return process.env.AUTH_SECRET?.trim();
  }
}

const AUTH_SECRET_VALUE = loadAuthSecret() || (process.env.NODE_ENV === "development" ? "dev-fallback-secret-change-in-production" : undefined);

import client from "@/lib/db";
import { connectDB } from "@/lib/mongodb";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const AUTH_USERS = "auth_users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: AUTH_SECRET_VALUE,
  trustHost: true,
  adapter: process.env.MONGODB_URI ? MongoDBAdapter(client, { databaseName: "aurelia" }) : undefined,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        if (!email || !password) return null;

        const db = await connectDB();
        const user = await db.collection(AUTH_USERS).findOne({ email });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: String(user._id),
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string) ?? (token.email as string)?.split("@")[0] ?? null;
      }
      return session;
    },
  },
});
