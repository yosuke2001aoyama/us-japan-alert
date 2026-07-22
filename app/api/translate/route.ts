export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let text = "";
  try { text = String((await request.json() as { text?: string }).text || "").trim().slice(0, 3000); } catch { /* invalid body */ }
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", "ja");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  try {
    const response = await fetch(url, { headers: { "user-agent": "JPUS-Alert/2.0" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`translation ${response.status}`);
    const data = await response.json() as [Array<[string]>];
    const translation = data[0]?.map((part) => part[0]).join("").trim();
    if (!translation) throw new Error("empty translation");
    return Response.json({ translation }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "translation unavailable" }, { status: 502 });
  }
}
