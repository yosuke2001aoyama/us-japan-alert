import { emailServiceReady } from "../../../../lib/resend-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { enabled: emailServiceReady() },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
