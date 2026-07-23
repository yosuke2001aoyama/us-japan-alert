import {
  assessPrincipalCommunication,
  assessPolicyItem,
  canonicalHeadline,
  cleanNewsSummary,
  cleanNewsTitle,
} from "./policy.ts";

export type AlertItem = {
  id: string; title: string; url: string; source: string; publishedAt: string;
  summary: string; category: string; priority: number; japanRelated: boolean; official: boolean; english: boolean; image?: string;
};

export type CoverageGroup =
  | "jp-leadership"
  | "jp-security"
  | "jp-economy"
  | "us-executive"
  | "us-security"
  | "us-economic-statecraft"
  | "principals"
  | "legislatures"
  | "bilateral-signals"
  | "major-media"
  | "policy-analysis";

export type Source = {
  name: string;
  url: string;
  coverage: CoverageGroup;
  official?: boolean;
  aggregate?: boolean;
  principal?: "jp" | "us";
};

const q = (query: string, lang = "en-US", region = "US", ceid = "US:en") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`(${query}) when:30d`)}&hl=${lang}&gl=${region}&ceid=${ceid}`;

export const coverageGroups: Array<{ id: CoverageGroup; label: string }> = [
  { id: "jp-leadership", label: "日本政府・外交" },
  { id: "jp-security", label: "日本の防衛・安保" },
  { id: "jp-economy", label: "日本の通商・財政" },
  { id: "us-executive", label: "米大統領府・国務省" },
  { id: "us-security", label: "米国防・インド太平洋軍" },
  { id: "us-economic-statecraft", label: "米通商・制裁・輸出管理" },
  { id: "principals", label: "日米主要閣僚の発信" },
  { id: "legislatures", label: "日米議会・政党" },
  { id: "bilateral-signals", label: "訪問・会談の観測" },
  { id: "major-media", label: "主要報道機関" },
  { id: "policy-analysis", label: "政策分析・調査" },
];

export const sources: Source[] = [
  // 日本政府・外交（3）
  { name: "首相官邸", url: q('site:kantei.go.jp (総理 OR 官房長官 OR 首脳 OR 会見 OR 指示 OR 談話)', "ja", "JP", "JP:ja"), coverage: "jp-leadership", official: true, aggregate: true },
  { name: "外務省", url: q('site:mofa.go.jp (外務大臣 OR 報道発表 OR 会見 OR 会談 OR 声明)', "ja", "JP", "JP:ja"), coverage: "jp-leadership", official: true, aggregate: true },
  { name: "内閣官房", url: q('site:cas.go.jp (国家安全保障 OR 官房長官 OR 経済安全保障 OR 発表)', "ja", "JP", "JP:ja"), coverage: "jp-leadership", official: true, aggregate: true },

  // 日本の防衛・安保（2）
  { name: "防衛省 · 報道資料", url: "https://www.mod.go.jp/j/press/news.xml", coverage: "jp-security", official: true },
  { name: "防衛省 · 更新情報", url: "https://www.mod.go.jp/j/press/update.xml", coverage: "jp-security", official: true },

  // 日本の通商・財政（2）
  { name: "経済産業省 · 報道発表", url: "https://www.meti.go.jp/press/atom.xml", coverage: "jp-economy", official: true },
  { name: "財務省 · 新着情報", url: "https://www.mof.go.jp/news.rss", coverage: "jp-economy", official: true },

  // 米大統領府・国務省（5）
  { name: "White House · Presidential Actions", url: "https://www.whitehouse.gov/presidential-actions/feed/", coverage: "us-executive", official: true },
  { name: "White House · Briefings & Statements", url: "https://www.whitehouse.gov/briefings-statements/feed/", coverage: "us-executive", official: true },
  { name: "White House · Remarks", url: "https://www.whitehouse.gov/remarks/feed/", coverage: "us-executive", official: true },
  { name: "U.S. Department of State", url: "https://www.state.gov/rss-feed/press-releases/feed/", coverage: "us-executive", official: true },
  { name: "U.S. Embassy Japan", url: q('site:jp.usembassy.gov (statement OR remarks OR press release OR Japan)', "en-US", "US", "US:en"), coverage: "us-executive", official: true, aggregate: true },

  // 米国防・インド太平洋軍（4）
  { name: "U.S. Department of War / Defense · Releases", url: "https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=25", coverage: "us-security", official: true },
  { name: "U.S. Department of War / Defense · Speeches & Transcripts", url: q('site:war.gov (speech OR transcript OR remarks OR statement) (secretary OR chairman OR Indo-Pacific)', "en-US", "US", "US:en"), coverage: "us-security", official: true, aggregate: true },
  { name: "INDOPACOM / USFJ", url: q('(site:pacom.mil OR site:usfj.mil) (Japan OR alliance OR statement OR exercise OR commander)', "en-US", "US", "US:en"), coverage: "us-security", official: true, aggregate: true },
  { name: "U.S. 7th Fleet", url: q('site:c7f.navy.mil (Japan OR exercise OR statement OR operation)', "en-US", "US", "US:en"), coverage: "us-security", official: true, aggregate: true },

  // 米通商・制裁・輸出管理（5）
  { name: "USTR", url: q('site:ustr.gov (press release OR statement OR remarks OR tariff OR trade)', "en-US", "US", "US:en"), coverage: "us-economic-statecraft", official: true, aggregate: true },
  { name: "U.S. Treasury", url: q('site:home.treasury.gov/news/press-releases (sanctions OR tariff OR investment OR statement)', "en-US", "US", "US:en"), coverage: "us-economic-statecraft", official: true, aggregate: true },
  { name: "OFAC", url: q('site:ofac.treasury.gov (sanctions OR action OR notice)', "en-US", "US", "US:en"), coverage: "us-economic-statecraft", official: true, aggregate: true },
  { name: "Commerce / BIS", url: q('(site:commerce.gov OR site:bis.gov) (export control OR semiconductor OR entity list OR statement)', "en-US", "US", "US:en"), coverage: "us-economic-statecraft", official: true, aggregate: true },
  { name: "Federal Register", url: q('site:federalregister.gov (Japan OR China OR tariff OR export control OR sanctions)', "en-US", "US", "US:en"), coverage: "us-economic-statecraft", official: true, aggregate: true },

  // 日米主要閣僚の発信（8）
  { name: "Trump / Vance · 公式発信", url: q('site:whitehouse.gov (Trump OR Vance) (remarks OR speech OR statement OR interview OR press conference OR transcript)', "en-US", "US", "US:en"), coverage: "principals", official: true, aggregate: true, principal: "us" },
  { name: "Rubio / Hegsethほか · 公式発信", url: q('(site:state.gov OR site:war.gov) (Rubio OR Hegseth OR secretary) (remarks OR speech OR statement OR interview OR testimony)', "en-US", "US", "US:en"), coverage: "principals", official: true, aggregate: true, principal: "us" },
  { name: "Bessent / Lutnick / Greerほか · 公式発信", url: q('(site:treasury.gov OR site:commerce.gov OR site:ustr.gov) (Bessent OR Lutnick OR Greer OR secretary) (remarks OR speech OR statement OR interview OR testimony)', "en-US", "US", "US:en"), coverage: "principals", official: true, aggregate: true, principal: "us" },
  { name: "高市総理 / 木原官房長官 · 公式発信", url: q('site:kantei.go.jp (高市 OR 木原 OR 総理 OR 官房長官) (会見 OR 発言 OR 談話 OR 挨拶 OR インタビュー)', "ja", "JP", "JP:ja"), coverage: "principals", official: true, aggregate: true, principal: "jp" },
  { name: "茂木外相 / 小泉防衛相ほか · 公式発信", url: q('(site:mofa.go.jp OR site:mod.go.jp) (茂木 OR 小泉 OR 外務大臣 OR 防衛大臣) (会見 OR 発言 OR 談話 OR 挨拶 OR インタビュー)', "ja", "JP", "JP:ja"), coverage: "principals", official: true, aggregate: true, principal: "jp" },
  { name: "片山財務相 / 赤澤経産相 / 小野田経済安保相 · 公式発信", url: q('(site:mof.go.jp OR site:meti.go.jp OR site:cao.go.jp) (片山 OR 赤澤 OR 小野田 OR 大臣) (会見 OR 発言 OR 談話 OR 挨拶 OR インタビュー)', "ja", "JP", "JP:ja"), coverage: "principals", official: true, aggregate: true, principal: "jp" },
  { name: "米主要閣僚 · SNS発信報道", url: q('(Trump OR Vance OR Rubio OR Hegseth OR Bessent OR Lutnick OR Greer) (Truth Social OR X post OR posted OR social media)', "en-US", "US", "US:en"), coverage: "principals", aggregate: true, principal: "us" },
  { name: "日本主要閣僚 · SNS発信報道", url: q('(高市 OR 木原 OR 茂木 OR 小泉 OR 片山 OR 赤澤 OR 小野田) (X投稿 OR SNS OR 発信 OR 投稿)', "ja", "JP", "JP:ja"), coverage: "principals", aggregate: true, principal: "jp" },

  // 日米議会・政党（4）
  { name: "Congress.gov", url: q('site:congress.gov (Japan OR Indo-Pacific OR alliance OR tariff OR sanctions OR China OR Taiwan)', "en-US", "US", "US:en"), coverage: "legislatures", official: true, aggregate: true },
  { name: "U.S. Congressional Committees", url: q('site:senate.gov OR site:house.gov (Japan OR Indo-Pacific OR China OR Taiwan OR tariff OR sanctions) (hearing OR statement OR bill)', "en-US", "US", "US:en"), coverage: "legislatures", official: true, aggregate: true },
  { name: "国会", url: q('site:sangiin.go.jp OR site:shugiin.go.jp (米国 OR 日米 OR 安全保障 OR 関税 OR 制裁)', "ja", "JP", "JP:ja"), coverage: "legislatures", official: true, aggregate: true },
  { name: "日本の与野党", url: q('(自民党 OR 立憲民主党 OR 日本維新の会 OR 国民民主党 OR 公明党) (米国 OR 日米 OR 安全保障 OR 関税)', "ja", "JP", "JP:ja"), coverage: "legislatures", aggregate: true },

  // 訪問・会談の観測（4）
  { name: "訪米・首脳外交", url: q('(総理 OR 首相 OR 外務大臣 OR 防衛大臣 OR 経産大臣) (訪米 OR 日米首脳会談 OR ワシントン) (調整 OR 検討 OR 見通し OR 予定 OR 会談)', "ja", "JP", "JP:ja"), coverage: "bilateral-signals", aggregate: true },
  { name: "US–Japan Official Signals", url: q('(site:whitehouse.gov OR site:state.gov OR site:kantei.go.jp OR site:mofa.go.jp) (Japan OR 日米) (summit OR meeting OR visit OR talks OR 会談 OR 訪問)', "en-US", "US", "US:en"), coverage: "bilateral-signals", official: true, aggregate: true },
  { name: "日米同盟・安全保障", url: q('(日米 OR 在日米軍 OR 拡大抑止 OR 2プラス2 OR U.S.-Japan alliance) (会談 OR 協議 OR 訓練 OR statement)', "ja", "JP", "JP:ja"), coverage: "bilateral-signals", aggregate: true },
  { name: "日米通商・経済対話", url: q('(日米 OR Japan U.S.) (関税 OR 通商 OR 投資 OR 為替 OR 半導体 OR tariff OR trade OR investment)', "ja", "JP", "JP:ja"), coverage: "bilateral-signals", aggregate: true },

  // 主要報道機関（4）
  { name: "Reuters / AP / Bloomberg", url: q('(Reuters OR AP OR Bloomberg) (United States OR Trump OR Japan OR Indo-Pacific OR China OR Taiwan OR sanctions OR tariff)', "en-US", "US", "US:en"), coverage: "major-media", aggregate: true },
  { name: "US Television", url: q('(CNN OR Fox News OR NBC OR ABC OR CBS) (White House OR Trump OR Japan OR Indo-Pacific OR China OR tariff)', "en-US", "US", "US:en"), coverage: "major-media", aggregate: true },
  { name: "US Newspapers / Politico", url: q('(New York Times OR Washington Post OR Wall Street Journal OR Politico) (White House OR Trump OR Japan OR Indo-Pacific OR China OR tariff)', "en-US", "US", "US:en"), coverage: "major-media", aggregate: true },
  { name: "日本主要メディア", url: q('(NHK OR 朝日新聞 OR 読売新聞 OR 毎日新聞 OR 日経 OR 共同通信 OR 時事通信) (米国 OR アメリカ OR 日米)', "ja", "JP", "JP:ja"), coverage: "major-media", aggregate: true },

  // 政策分析・調査（3）
  { name: "米政策シンクタンク", url: q('(site:csis.org OR site:cfr.org OR site:brookings.edu OR site:rand.org) (Japan OR U.S.-Japan OR Indo-Pacific alliance)', "en-US", "US", "US:en"), coverage: "policy-analysis", aggregate: true },
  { name: "日本の政策研究機関", url: q('(site:jiia.or.jp OR site:spf.org OR site:nids.mod.go.jp) (米国 OR 日米 OR インド太平洋)', "ja", "JP", "JP:ja"), coverage: "policy-analysis", aggregate: true },
  { name: "CRS / GAO", url: q('(site:crsreports.congress.gov OR site:gao.gov) (Japan OR Indo-Pacific OR China OR Taiwan OR sanctions)', "en-US", "US", "US:en"), coverage: "policy-analysis", official: true, aggregate: true },
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
      || host.endsWith(".mil")
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
  const xml = await res.text();
  const chunks = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .slice(0, source.principal ? 60 : 25)
    .map((x) => x[2]);
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
    const assessment = source.principal
      ? assessPrincipalCommunication(title, summary, itemOfficial, source.principal)
      : assessPolicyItem(title, summary, itemOfficial);
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
    if (sourceCount >= 60) continue;
    if (seenUrls.has(urlKey) || (titleKey.length > 20 && seenTitles.has(titleKey))) continue;
    seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    sourceCounts.set(sourceGroup, sourceCount + 1);
    unique.push(item);
    if (unique.length >= 480) break;
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
      coverage: coverageGroups.map((group) => {
        const indexes = sources.flatMap((source, index) => source.coverage === group.id ? [index] : []);
        return {
          ...group,
          ok: indexes.filter((index) => results[index].status === "fulfilled").length,
          total: indexes.length,
        };
      }),
    },
    items: unique,
  };
}
