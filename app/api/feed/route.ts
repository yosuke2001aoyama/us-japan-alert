import { collect } from "../../../lib/feeds";
import { collectDirectOfficial } from "../../../lib/official-pages";
import { canonicalHeadline } from "../../../lib/policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const [base, direct] = await Promise.all([collect(), collectDirectOfficial()]);
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const items = [...direct.items, ...base.items]
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt) || b.priority - a.priority)
    .filter((item) => {
      const urlKey = item.url.replace(/[?&](utm_[^=]+|oc)=[^&]+/g, "");
      const titleKey = canonicalHeadline(item.title);
      if (seenUrls.has(urlKey) || (titleKey.length > 20 && seenTitles.has(titleKey))) return false;
      seenUrls.add(urlKey);
      if (titleKey) seenTitles.add(titleKey);
      return true;
    })
    .slice(0, 500);

  const data = {
    ...base,
    generatedAt: new Date().toISOString(),
    items,
    sources: {
      ...base.sources,
      ok: base.sources.ok + direct.ok,
      failed: base.sources.failed + direct.failed,
      total: base.sources.total + direct.total,
      failedNames: [...(base.sources.failedNames || []), ...direct.failedNames],
      coverage: [
        ...(base.sources.coverage || []),
        { id: "direct-official", label: "一次情報・直接巡回", ok: direct.ok, total: direct.total },
      ],
    },
  };

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = ["published_at,priority,japan_related,official,category,source,title,url", ...data.items.map((x) => [x.publishedAt, x.priority, x.japanRelated, x.official, x.category, x.source, x.title, x.url].map(esc).join(","))].join("\n");
    return new Response("\ufeff" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=jpus-alert.csv" } });
  }
  return Response.json(data, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=45, stale-while-revalidate=15",
    },
  });
}
