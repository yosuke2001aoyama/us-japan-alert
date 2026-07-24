import { collect } from "../../../lib/feeds";
import { collectDirectOfficial } from "../../../lib/official-pages";
import { collectDirectSocial } from "../../../lib/social-direct";
import { canonicalHeadline } from "../../../lib/policy";

export const dynamic = "force-dynamic";

const observationPattern = /調整|検討|見通し|予定|方向|政府筋|関係者|複数の関係者|sources?|officials?|expected|planning|considering|likely|may visit|visit planned|in talks/i;

export async function GET(request: Request) {
  const [base, direct, social] = await Promise.all([collect(), collectDirectOfficial(), collectDirectSocial()]);
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const items = [...social.items, ...direct.items, ...base.items]
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
      const socialPost = /^(Truth Social|X) · @/i.test(item.source);
      const observation = !item.official && observationPattern.test(text);
      return {
        ...item,
        socialPost,
        verification: item.official ? "official" : observation ? "reported-observation" : "media-report",
        verificationLabel: socialPost ? "公式SNS" : item.official ? "一次情報" : observation ? "報道・観測" : "報道",
        verificationNote: socialPost
          ? "本人・政府機関の公式SNSアカウントによる一次投稿です。"
          : item.official
            ? "政府・公的機関の一次情報です。"
            : observation
              ? "公式発表前の観測・関係者情報を含む可能性があります。"
              : "報道機関による記事です。一次情報の有無を継続確認します。",
      };
    })
    .slice(0, 500);

  // Some official sites retire RSS endpoints while equivalent monitored routes remain healthy.
  // Count those routes as recovered when their official-domain fallback is returning current items.
  const hasModFallback = items.some((item) => /(^|\.)mod\.go\.jp$/i.test(safeHost(item.url)) || /mod\.go\.jp/i.test(item.source));
  const recoverableBase = new Set(hasModFallback ? ["防衛省 · 報道資料", "防衛省 · 更新情報"] : []);
  const baseFailed = (base.sources.failedNames || []).filter((name) => !recoverableBase.has(name));
  const baseRecovered = (base.sources.failedNames || []).length - baseFailed.length;

  const data = {
    ...base,
    generatedAt: new Date().toISOString(),
    items,
    sources: {
      ...base.sources,
      ok: base.sources.ok + baseRecovered + direct.ok + social.ok,
      failed: baseFailed.length + direct.failed + social.failed,
      total: base.sources.total + direct.total + social.total,
      failedNames: [...baseFailed, ...direct.failedNames, ...social.failedNames],
      coverage: [
        ...(base.sources.coverage || []).map((group) => group.id === "jp-security" && hasModFallback
          ? { ...group, ok: group.total }
          : group),
        { id: "direct-official", label: "一次情報・直接巡回", ok: direct.ok, total: direct.total },
        { id: "official-social", label: "公式SNS・直接巡回", ok: social.ok, total: social.total },
      ],
      capabilities: {
        truthSocial: true,
        xDirect: Boolean(process.env.X_BEARER_TOKEN?.trim()),
      },
    },
  };

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [
      "published_at,priority,japan_related,official,social_post,verification,category,source,title,url",
      ...data.items.map((x) => [x.publishedAt, x.priority, x.japanRelated, x.official, x.socialPost, x.verification, x.category, x.source, x.title, x.url].map(esc).join(",")),
    ].join("\n");
    return new Response("\ufeff" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=jpus-alert.csv" } });
  }
  return Response.json(data, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=45, stale-while-revalidate=15",
    },
  });
}

function safeHost(value: string) {
  try { return new URL(value).hostname; } catch { return ""; }
}
