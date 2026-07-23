import {
  assessPolicyItem,
  canonicalHeadline,
  cleanNewsSummary,
  cleanNewsTitle,
} from "./policy.ts";

export type AlertItem = {
  id: string; title: string; url: string; source: string; publishedAt: string;
  summary: string; category: string; priority: number; japanRelated: boolean; official: boolean; english: boolean; image?: string;
};

type Source = {
  name: string;
  url: string;
  official?: boolean;
  kind?: "rss" | "truth";
  aggregate?: boolean;
};

const q = (query: string, lang = "en-US", region = "US", ceid = "US:en") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`(${query}) when:30d`)}&hl=${lang}&gl=${region}&ceid=${ceid}`;

export const sources: Source[] = [
  { name: "White House · Presidential Actions", url: "https://www.whitehouse.gov/presidential-actions/feed/", official: true },
  { name: "White House · Briefings & Statements", url: "https://www.whitehouse.gov/briefings-statements/feed/", official: true },
  { name: "White House · Fact Sheets", url: "https://www.whitehouse.gov/fact-sheets/feed/", official: true },
  { name: "U.S. Department of State", url: "https://www.state.gov/rss-feed/press-releases/feed/", official: true },
  { name: "U.S. Department of War / Defense", url: "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=10", official: true },
  { name: "Congress.gov", url: q('site:congress.gov (Japan OR Indo-Pacific OR alliance OR tariff OR sanctions OR China OR Taiwan)', "en-US", "US", "US:en"), official: true, aggregate: true },
  { name: "官邸・外務省・防衛省", url: q('(site:kantei.go.jp OR site:mofa.go.jp OR site:mod.go.jp) (米国 OR アメリカ OR 日米 OR 訪米 OR 首脳会談)', "ja", "JP", "JP:ja"), official: true, aggregate: true },
  { name: "訪米・首脳外交", url: q('(総理 OR 首相 OR 外務大臣 OR 防衛大臣 OR 経産大臣) (訪米 OR アメリカ訪問 OR 日米首脳会談 OR ワシントン) (調整 OR 検討 OR 見通し OR 予定 OR 会談)', "ja", "JP", "JP:ja"), aggregate: true },
  { name: "US–Japan News", url: q('Japan (Trump OR White House OR Congress OR Pentagon OR tariff OR security OR alliance OR summit OR sanctions)', "en-US", "US", "US:en"), aggregate: true },
  { name: "日本語・米政策速報", url: q('(米国 OR アメリカ OR トランプ OR ホワイトハウス OR 米議会) (日本 OR 日米 OR 同盟 OR 関税 OR 制裁 OR 中国 OR 台湾 OR 安全保障)', "ja", "JP", "JP:ja"), aggregate: true },
  { name: "日米外交", url: q('(日米 OR 訪米 OR 米軍 OR 在日米軍 OR 拡大抑止 OR 首脳会談 OR 2プラス2)', "ja", "JP", "JP:ja"), aggregate: true },
  { name: "Trump発信・報道", url: q('(Trump OR トランプ) (Truth Social OR post OR 発信) (Japan OR China OR Taiwan OR tariff OR sanctions OR alliance OR military OR 日本 OR 中国 OR 台湾 OR 関税 OR 制裁 OR 同盟 OR 軍事)', "en-US", "US", "US:en"), aggregate: true },
  { name: "Reuters / AP / Bloomberg", url: q('(Reuters OR AP OR Bloomberg) (United States OR Trump OR Japan OR Indo-Pacific OR China OR Taiwan OR sanctions OR tariff OR summit OR alliance)', "en-US", "US", "US:en"), aggregate: true },
  { name: "US Television", url: q('(CNN OR Fox News OR NBC OR ABC OR CBS) (White House OR Trump OR Japan OR Indo-Pacific OR China OR Taiwan OR tariff OR sanctions OR alliance)', "en-US", "US", "US:en"), aggregate: true },
  { name: "US Newspapers / Politico", url: q('(New York Times OR Washington Post OR Wall Street Journal OR Politico) (White House OR Trump OR Japan OR Indo-Pacific OR China OR Taiwan OR tariff OR sanctions OR alliance)', "en-US", "US", "US:en"), aggregate: true },
  { name: "日本主要メディア", url: q('(NHK OR 朝日新聞 OR 読売新聞 OR 毎日新聞 OR 日経 OR 共同通信 OR 時事通信) (米国 OR アメリカ OR 日米)', "ja", "JP", "JP:ja"), aggregate: true },
  { name: "政策シンクタンク", url: q('(site:csis.org OR site:cfr.org OR site:brookings.edu OR site:rand.org) (Japan OR U.S.-Japan OR Indo-Pacific alliance)', "en-US", "US", "US:en"), aggregate: true },
];

const decode = (s: string) => s
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&(?:amp;)?nbsp;|&#160;|\u00a0/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const field = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const attribute = (xml: string, name: string, attr: string) => decode(xml.match(new RegExp(`<${name}[^>]*\\s${attr}=["']([^"']+)`, "i"))?.[1] || "");
const link = (xml: string) => field(xml, "link") || xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";
const image = (xml: string) => {
  const value = xml.match(/<(?:media:content|media:thumbnail)[^>]+url=["']([^"']+)/i)?.[1]
    || xml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\//i)?.[1]
    || xml.match(/<img[^>]+src=["']([^"']+)/i)?.[1]
    || "";
  return decode(value).replace(/^http:\/\//i, "https://");
};

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function officialPublisher(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".gov")
      || host === "whitehouse.gov"
      || host.endsWith(".go.jp")
      || host === "kantei.go.jp"
      || host === "mofa.go.jp"
      || host === "mod.go.jp";
  } catch {
    return false;
  }
}

async function readSource(source: Source) {
  const res = await fetch(source.url, { headers: { "user-agent": "JPUS-Alert/2.0 (+public-policy-monitor)" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${source.name}: ${res.status}`);
  if (source.kind === "truth") {
    const posts = await res.json() as Array<{ id: string; url: string; created_at: string; content: string }>;
    return posts.map((post): AlertItem | null => {
      const text = decode(post.content);
      const title = text.slice(0, 180) || "Truth Social post";
      const summary = text.length > 180 ? text.slice(180, 420) : "";
      const assessment = assessPolicyItem(title, summary, true);
      if (!assessment.relevant) return null;
      return { id: post.id, title, url: post.url, source: source.name, publishedAt: safeDate(post.created_at), summary, official: true, ...assessment };
    }).filter((item): item is AlertItem => !!item);
  }
  const xml = await res.text();
  const chunks = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 25).map((x) => x[2]);
  return chunks.map((chunk): AlertItem | null => {
    const rawTitle = field(chunk, "title");
    const url = link(chunk);
    if (!rawTitle || !url) return null;
    const publisher = source.aggregate ? field(chunk, "source") : "";
    const publisherUrl = source.aggregate ? attribute(chunk, "source", "url") : "";
    const title = cleanNewsTitle(rawTitle, publisher);
    const rawSummary = field(chunk, "description").slice(0, 500);
    const summary = source.aggregate ? cleanNewsSummary(rawSummary, title, publisher) : rawSummary.slice(0, 360);
    const itemOfficial = !!source.official && (!source.aggregate || officialPublisher(publisherUrl));
    const assessment = assessPolicyItem(title, summary, itemOfficial);
    if (!assessment.relevant) return null;
    const publishedAt = field(chunk, "pubDate") || field(chunk, "published") || field(chunk, "updated") || new Date().toISOString();
    const imageUrl = image(chunk);
    return {
      id: Buffer.from(url).toString("base64url").slice(-36),
      title,
      url,
      source: publisher || source.name,
      publishedAt: safeDate(publishedAt),
      summary,
      official: itemOfficial,
      ...assessment,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
  }).filter((x): x is AlertItem => !!x);
}

export async function collect() {
  const results = await Promise.allSettled(sources.map(readSource));
  const sorted = results.flatMap((r) => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt) || b.priority - a.priority);
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const unique: AlertItem[] = [];
  for (const item of sorted) {
    const urlKey = item.url.replace(/[?&](utm_[^=]+|oc)=[^&]+/g, "");
    const titleKey = canonicalHeadline(item.title);
    const sourceGroup = item.source.startsWith("White House") ? "White House" : item.source;
    const sourceCount = sourceCounts.get(sourceGroup) || 0;
    if (sourceCount >= 18) continue;
    if (seenUrls.has(urlKey) || (titleKey.length > 20 && seenTitles.has(titleKey))) continue;
    seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    sourceCounts.set(sourceGroup, sourceCount + 1);
    unique.push(item);
    if (unique.length >= 240) break;
  }
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [sources[index].name] : []);
  return {
    generatedAt: new Date().toISOString(),
    mode: "live" as const,
    sources: {
      ok: results.filter((r) => r.status === "fulfilled").length,
      failed: failedNames.length,
      total: sources.length,
      failedNames,
    },
    items: unique,
  };
}
