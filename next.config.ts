import { config } from "dotenv";
import type { NextConfig } from "next";
import path from "path";

// Explicitly load .env.local (fixes loading when run from iCloud or non-standard paths)
const envPath = path.resolve(process.cwd(), ".env.local");
config({ path: envPath, override: true });

const nextConfig: NextConfig = {
  env: {
    AURELIA_LLM_API_KEY: process.env.AURELIA_LLM_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.spoonacular.com" }],
  },
};

export default nextConfig;
