import { openAlertToken, requestIsSameOrigin, requestRateLimited } from "../../../../lib/alert-security";
import { confirmAlertSubscriber, emailServiceReady } from "../../../../lib/resend-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) return Response.json({ ok: false }, { status: 403, headers: noStore });
  if (requestRateLimited(request, "alert-confirm", 10, 15 * 60_000)) {
    return Response.json({ ok: false }, { status: 429, headers: noStore });
  }
  let token = "";
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4_096) return Response.json({ ok: false }, { status: 413, headers: noStore });
    const body = JSON.parse(raw) as { token?: unknown };
    if (typeof body.token === "string") token = body.token;
  } catch {
    return Response.json({ ok: false }, { status: 400, headers: noStore });
  }
  const payload = openAlertToken(token, "confirm");
  if (!payload || !emailServiceReady()) return Response.json({ ok: false }, { status: 400, headers: noStore });
  try {
    await confirmAlertSubscriber(payload.email);
    return Response.json({ ok: true }, { headers: noStore });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: noStore });
  }
}
