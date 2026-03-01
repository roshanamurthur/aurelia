import { ImapFlow } from "imapflow";

const DOORDASH_2FA_REGEX = /\b(\d{6})\b/;

/**
 * Poll Gmail via IMAP for a DoorDash verification (2FA) code.
 * Uses BROWSER_USE credentials or GMAIL_APP_PASSWORD with the given email.
 */
export async function fetchDoorDash2FACode(
  email: string,
  gmailAppPassword: string,
  options: { maxWaitMs?: number; pollIntervalMs?: number } = {}
): Promise<string | null> {
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 4_000;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: gmailAppPassword,
    },
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn("[fetch-2fa] IMAP connect failed:", err instanceof Error ? err.message : err);
    return null;
  }

  const deadline = Date.now() + maxWaitMs;

  try {
    while (Date.now() < deadline) {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uids = await client.search(
          { from: "doordash", since: new Date(Date.now() - 10 * 60 * 1000) },
          { uid: true }
        );
        if (uids && uids.length > 0) {
          const sorted = [...uids].sort((a, b) => b - a);
          for (const uid of sorted.slice(0, 5)) {
            const list = await client.fetchAll(
              [uid],
              { source: { maxLength: 30_000 } },
              { uid: true }
            );
            for (const msg of list) {
              const raw = msg.source?.toString("utf-8") ?? "";
              const match = raw.match(DOORDASH_2FA_REGEX);
              if (match?.[1]) return match[1];
            }
          }
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
