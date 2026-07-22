import { collect } from "../../../lib/feeds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await collect();
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = ["published_at,priority,japan_related,official,category,source,title,url", ...data.items.map((x) => [x.publishedAt, x.priority, x.japanRelated, x.official, x.category, x.source, x.title, x.url].map(esc).join(","))].join("\n");
    return new Response("\ufeff" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=jpus-alert.csv" } });
  }
  return Response.json(data, { headers: { "cache-control": "public, max-age=300, s-maxage=600" } });
}
