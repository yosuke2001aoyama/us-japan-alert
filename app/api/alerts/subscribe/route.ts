import { normalizeAlertEmail, requestIsSameOrigin, requestRateLimited } from "../../../../lib/alert-security";
import { emailServiceReady, sendSubscriptionConfirmation } from "../../../../lib/resend-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return Response.json({ ok: false }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false }, { status: 415, headers: noStore });
  }
  if (Number(request.headers.get("content-length") || 0) > 4_096) {
    return Response.json({ ok: false }, { status: 413, headers: noStore });
  }
  if (requestRateLimited(request, "alert-subscribe", 5, 15 * 60_000)) {
    return Response.json({ ok: true }, { status: 202, headers: noStore });
  }

  let body: { email?: unknown; company?: unknown } = {};
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4_096) return Response.json({ ok: false }, { status: 413, headers: noStore });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false }, { status: 400, headers: noStore });
  }
  // Invisible honeypot. Return the same generic success as a real request.
  if (body.company) return Response.json({ ok: true }, { status: 202, headers: noStore });
  const email = normalizeAlertEmail(body.email);
  if (!email) return Response.json({ ok: false }, { status: 400, headers: noStore });
  if (!emailServiceReady()) return Response.json({ ok: false }, { status: 503, headers: noStore });

  try {
    await sendSubscriptionConfirmation(email);
    return Response.json({ ok: true }, { status: 202, headers: noStore });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: noStore });
  }
}
