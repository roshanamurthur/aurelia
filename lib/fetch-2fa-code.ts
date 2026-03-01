/**
 * Fetches DoorDash 2FA verification code from Gmail via IMAP.
 * Requires: Gmail with IMAP enabled, App Password (not regular password).
 * Create at: Google Account → Security → 2-Step Verification → App passwords
 */

import { ImapFlow } from "imapflow";

const CODE_REGEX = /\b(\d{6})\b/;

export async function fetchDoorDash2FACode(
  email: string,
  appPassword: string,
  options?: { maxWaitMs?: number; pollIntervalMs?: number }
): Promise<string | null> {
  const maxWaitMs = options?.maxWaitMs ?? 60_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + maxWaitMs;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
  });

  try {
    await client.connect();

    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        await client.mailboxOpen("INBOX");

        // Search for recent emails (DoorDash sends verification to same email)
        const since = new Date(Date.now() - 10 * 60 * 1000);
        const uids = await client.search({ since }, { uid: true });

        if (!uids || uids.length === 0) {
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          continue;
        }

        // Fetch most recent first (limit to 10 to avoid slow fetch)
        const sorted = [...uids].sort((a, b) => b - a);
        const messages = await client.fetchAll(
          sorted.slice(0, 10),
          { source: true },
          { uid: true }
        );

        for (const msg of messages) {
          if (!msg?.source) continue;
          const raw = String(msg.source);
          // Only consider emails from DoorDash (verification codes)
          if (!/doordash|noreply.*doordash/i.test(raw)) continue;
          const match = raw.match(CODE_REGEX);
          if (match) return match[1];
        }
      } finally {
        lock.release();
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return null;
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
