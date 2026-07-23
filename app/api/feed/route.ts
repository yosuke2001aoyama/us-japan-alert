import { collect } from "../../../lib/feeds";
import { collectDirectOfficial } from "../../../lib/official-pages";
import { canonicalHeadline } from "../../../lib/policy";

export const dynamic = "force-dynamic";

const observationPattern = /調整|検討|見通し|予定|方向|政府筋|関係者|複数の関係者|sources?|officials?|expected|planning|considering|likely|may visit|visit planned|in talks/i;

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
    .map((item) => {
      const text = `${item.title} ${item.summary}`;
      const observation = !item.official && observationPattern.test(text);
      return {
        ...item,
        verification: item.official ? "official" : observation ? "reported-observation" : "media-report",
        verificationLabel: item.official ? "一次情報" : observation ? "報道・観測" : "報道",
        verificationNote: item.official
          ? "政府・公的機関の一次情報です。"
          : observation
            ? "公式発表前の観測・関係者情報を含む可能性があります。"
            : "報道機関による記事です。一次情報の有無を継続確認します。",
      };
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
    const csv = [
      "published_at,priority,japan_related,official,verification,category,source,title,url",
      ...data.items.map((x) => [x.publishedAt, x.priority, x.japanRelated, x.official, x.verification, x.category, x.source, x.title, x.url].map(esc).join(",")),
    ].join("\n");
    return new Response("\ufeff" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=jpus-alert.csv" } });
  }
  return Response.json(data, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=45, stale-while-revalidate=15",
    },
  });
}
