/**
 * Thin wrapper around transport.ts for consistent send behaviour.
 * Never throws — callers receive { ok, error } and decide on anomaly recording.
 *
 * Note on `from`: transport.ts hardcodes from = "csnl-ops" <GMAIL_USER>.
 * The effective sender displayed to recipients is therefore always GMAIL_USER.
 * GMAIL_FROM is documented here for future use if transport.ts is extended.
 *
 * Note on `text`: transport.ts accepts html only. Plain-text body is included
 * in the template functions (templates.ts) for reference / logging but is not
 * forwarded to nodemailer — Gmail renders the html part for all clients.
 */

import { sendEmail } from "@/lib/mail/transport";

export const DEFAULT_FROM =
  process.env.GMAIL_FROM ?? "CSNL Lab <vnilab@gmail.com>";

export const DEFAULT_REPLY_TO = process.env.GMAIL_USER ?? "";

export interface SendOneOptions {
  /** Primary recipient(s). Pass an array to join as comma-separated. */
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  /** Defaults to GMAIL_USER. */
  replyTo?: string;
  subject: string;
  /** Plain-text body (kept for logging / spec compliance; not forwarded to transport). */
  text: string;
  html: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single email.
 * Returns { ok: true, messageId } on success or { ok: false, error } on failure.
 * Never throws.
 */
export async function sendOne(options: SendOneOptions): Promise<SendResult> {
  const {
    to,
    cc,
    bcc,
    subject,
    html,
    replyTo = DEFAULT_REPLY_TO,
  } = options;

  const result = await sendEmail({
    to: Array.isArray(to) ? to.join(", ") : to,
    cc,
    bcc,
    replyTo: replyTo || undefined,
    subject,
    html,
  });

  if (result.success) {
    return { ok: true, messageId: result.messageId };
  }
  return { ok: false, error: result.error ?? "Unknown send error" };
}

/**
 * Send a batch of emails sequentially.
 * Returns per-message results in the same order as the input array.
 */
export async function sendBatch(
  messages: SendOneOptions[]
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const msg of messages) {
    results.push(await sendOne(msg));
  }
  return results;
}
