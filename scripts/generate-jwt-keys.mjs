#!/usr/bin/env node
/**
 * Generate JWT keys for Convex Auth.
 * Run: node scripts/generate-jwt-keys.mjs
 * Then set the output in Convex dashboard: Settings > Environment Variables
 * Or: npx convex env set JWT_PRIVATE_KEY "..." JWKS "..."
 */
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

const jwtPrivateKey = privateKey.trimEnd().replace(/\n/g, " ");
console.log("Add these to Convex dashboard (Settings > Environment Variables):\n");
console.log("JWT_PRIVATE_KEY=" + JSON.stringify(jwtPrivateKey));
console.log("\nJWKS=" + JSON.stringify(jwks));
console.log("\nOr run:");
console.log(`npx convex env set JWT_PRIVATE_KEY ${JSON.stringify(jwtPrivateKey)}`);
console.log(`npx convex env set JWKS ${JSON.stringify(jwks)}`);
