import { openAlertToken, requestRateLimited } from "../../../../lib/alert-security";
import { unsubscribeAlertSubscriber } from "../../../../lib/resend-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store, max-age=0" };

export async function POST(request: Request) {
  if (requestRateLimited(request, "alert-unsubscribe", 30, 15 * 60_000)) {
    return new Response(null, { status: 429, headers: noStore });
  }
  const url = new URL(request.url);
  let token = url.searchParams.get("token") || "";
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await request.json() as { token?: unknown };
      if (typeof body.token === "string") token = body.token;
    } catch {
      return new Response(null, { status: 400, headers: noStore });
    }
  }
  const payload = openAlertToken(token, "unsubscribe");
  if (!payload) return new Response(null, { status: 400, headers: noStore });
  try {
    await unsubscribeAlertSubscriber(payload.email);
    return new Response(null, { status: 200, headers: noStore });
  } catch {
    return new Response(null, { status: 503, headers: noStore });
  }
}
