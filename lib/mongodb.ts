import crypto from "crypto";
import { Db, MongoClient } from "mongodb";
import tls from "tls";

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (db) return db;

  // SSL alert 80 fix: Node 24 + OpenSSL 3 + MongoDB Atlas need legacy server connect
  const secureContext = tls.createSecureContext({
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  });

  client = new MongoClient(uri, {
    autoSelectFamily: false,
    serverSelectionTimeoutMS: 5000,
    tls: true,
    secureContext,
  });
  await client.connect();
  db = client.db("aurelia");
  await ensureIndexes(db);
  return db;
}

/** Indexes for fast lookups. Run on first connect. */
async function ensureIndexes(db: Db): Promise<void> {
  await db
    .collection("user_preferences")
    .createIndex({ userId: 1 }, { unique: true })
    .catch(() => {});

  // Drop the old strict-unique index if it exists from a previous deploy.
  // Multiple plan documents per (userId, weekStart) are valid — one active + archived history.
  await db
    .collection("meal_plans")
    .dropIndex("userId_1_weekStart_1")
    .catch(() => {}); // ignore if already dropped or never existed

  await db
    .collection("meal_plans")
    .createIndex({ userId: 1, weekStart: 1 }) // non-unique: supports versioned history
    .catch(() => {});
  await db
    .collection("meal_plans")
    .createIndex({ userId: 1, status: 1 })
    .catch(() => {});

  await db
    .collection("auth_users")
    .createIndex({ email: 1 }, { unique: true })
    .catch(() => {});
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
}
