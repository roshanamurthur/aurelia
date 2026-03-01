import { Db, MongoClient } from "mongodb";

let client: MongoClient;
let db: Db;

export async function connectDB(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (db) return db;
  client = new MongoClient(uri);
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
    .catch(() => {}); // ignore if index exists
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
}
