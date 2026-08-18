import { alertHash, dashboardOrigin, sealAlertToken } from "./alert-security";

const apiBase = "https://api.resend.com";
const segmentName = "JPUS速報";
let segmentPromise: Promise<string> | null = null;

function credentials() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.ALERT_FROM_EMAIL || "";
  if (!apiKey || !from) throw new Error("Alert email service is not configured");
  return { apiKey, from };
}

async function resend(path: string, init: RequestInit = {}) {
  const { apiKey } = credentials();
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Never include the provider response: it can echo an address or request data.
    throw new Error(`Email provider request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

async function findSegment() {
  const result = await resend("/segments?limit=100") as { data?: Array<{ id?: string; name?: string }> };
  return result.data?.find((segment) => segment.name === segmentName)?.id || null;
}

export async function ensureAlertSegment() {
  if (process.env.RESEND_ALERT_SEGMENT_ID) return process.env.RESEND_ALERT_SEGMENT_ID;
  if (!segmentPromise) {
    segmentPromise = (async () => {
      const existing = await findSegment();
      if (existing) return existing;
      try {
        const created = await resend("/segments", {
          method: "POST",
          body: JSON.stringify({ name: segmentName }),
        }) as { id?: string };
        if (created.id) return created.id;
      } catch {
        const raced = await findSegment();
        if (raced) return raced;
      }
      throw new Error("Unable to prepare alert subscriber segment");
    })().catch((error) => {
      segmentPromise = null;
      throw error;
    });
  }
  return segmentPromise;
}

export function emailServiceReady() {
  const tokenSecret = process.env.ALERT_SIGNING_SECRET || process.env.RESEND_API_KEY || "";
  return Boolean(
    process.env.RESEND_API_KEY
    && process.env.ALERT_FROM_EMAIL
    && tokenSecret.length >= 32,
  );
}

export async function sendSubscriptionConfirmation(email: string) {
  const { from } = credentials();
  const token = sealAlertToken(email, "confirm", 30 * 60);
  const confirmUrl = `${dashboardOrigin()}/alerts/confirm?token=${encodeURIComponent(token)}`;
  const bucket = Math.floor(Date.now() / 600_000);
  await resend("/emails", {
    method: "POST",
    headers: { "Idempotency-Key": `confirm-${alertHash(email)}-${bucket}` },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "JPUS速報メールの登録確認",
      html: `<p>JPUS速報メールへの登録を確認します。</p><p><a href="${confirmUrl}">登録を確定する</a></p><p>このリンクは30分間有効です。心当たりがなければ、このメールは破棄してください。</p>`,
      text: `JPUS速報メールへの登録を確認します。\n\n${confirmUrl}\n\nこのリンクは30分間有効です。心当たりがなければ、このメールは破棄してください。`,
    }),
  });
}

export async function confirmAlertSubscriber(email: string) {
  const segmentId = await ensureAlertSegment();
  try {
    await resend("/contacts", {
      method: "POST",
      body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: segmentId }] }),
    });
    return;
  } catch {
    // A contact can already exist globally in Resend while not belonging to this
    // product segment. Restore only after the user has proved mailbox control.
    await resend(`/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ unsubscribed: false }),
    });
    await resend(`/contacts/${encodeURIComponent(email)}/segments/${segmentId}`, { method: "POST" });
  }
}

export async function unsubscribeAlertSubscriber(email: string) {
  const segmentId = await ensureAlertSegment();
  try {
    await resend(`/contacts/${encodeURIComponent(email)}/segments/${segmentId}`, { method: "DELETE" });
  } catch {
    // Continue to the global unsubscribe flag even when segment membership was
    // already absent. The endpoint intentionally remains idempotent.
  }
  try {
    await resend(`/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ unsubscribed: true }),
    });
  } catch {
    // A nonexistent contact is already effectively unsubscribed.
  }
}
