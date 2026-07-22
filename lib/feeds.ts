export type AlertItem = {
  id: string; title: string; url: string; source: string; publishedAt: string;
  summary: string; category: string; priority: number; japanRelated: boolean; official: boolean;
};

type Source = { name: string; url: string; official?: boolean; category?: string; kind?: "rss" | "truth" };

const q = (query: string, lang = "en-US", region = "US", ceid = "US:en") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${region}&ceid=${ceid}`;

export const sources: Source[] = [
  { name: "White House", url: "https://www.whitehouse.gov/feed/", official: true, category: "公式発表" },
  { name: "U.S. Department of State", url: "https://www.state.gov/rss-feed/press-releases/feed/", official: true, category: "公式発表" },
  { name: "U.S. Department of Defense", url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=400&Site=945&Category=Press%20Releases", official: true, category: "公式発表" },
  { name: "Congress.gov", url: "https://www.congress.gov/rss/most-viewed-bills.xml", official: true, category: "政治" },
  { name: "Truth Social · @realDonaldTrump", url: "https://truthsocial.com/api/v1/accounts/107780257626128497/statuses?exclude_replies=true&limit=20", official: true, category: "公式発表", kind: "truth" },
  { name: "首相官邸・外務省", url: q('(site:kantei.go.jp OR site:mofa.go.jp) (米国 OR アメリカ OR 日米 OR 訪米)', "ja", "JP", "JP:ja"), official: true, category: "公式発表" },
  { name: "US–Japan News", url: q('Japan (United States OR Trump OR White House OR Congress OR Pentagon OR tariff OR security)', "en-US", "US", "US:en"), category: "日米関係" },
  { name: "日本語・米国速報", url: q('アメリカ OR 米国 OR トランプ OR ホワイトハウス OR 米議会', "ja", "JP", "JP:ja"), category: "政治" },
  { name: "日米外交", url: q('日米 OR 訪米 OR 米軍 OR 外務省 アメリカ', "ja", "JP", "JP:ja"), category: "日米関係" },
  { name: "Reuters / AP / Bloomberg", url: q('(Reuters OR AP OR Bloomberg) (United States OR Trump OR Congress OR Japan)', "en-US", "US", "US:en"), category: "政治" },
  { name: "US Television", url: q('(CNN OR Fox News OR NBC OR ABC OR CBS) (White House OR Congress OR Japan)', "en-US", "US", "US:en"), category: "政治" },
  { name: "US Newspapers", url: q('(New York Times OR Washington Post OR Wall Street Journal OR Politico) (Japan OR White House OR Congress)', "en-US", "US", "US:en"), category: "政治" },
  { name: "日本主要メディア", url: q('(NHK OR 朝日新聞 OR 読売新聞 OR 毎日新聞 OR 日経 OR 共同通信 OR 時事通信) (米国 OR アメリカ OR 日米)', "ja", "JP", "JP:ja"), category: "日米関係" },
];

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const field = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const link = (xml: string) => field(xml, "link") || xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";

function classify(title: string, base = "政治") {
  const s = title.toLowerCase();
  if (/econom|tariff|trade|market|fed|inflation|経済|関税|貿易|市場/.test(s)) return "経済";
  if (/defen|security|military|pentagon|navy|nuclear|安全保障|防衛|米軍|核/.test(s)) return "外交・安保";
  return base;
}

function score(title: string, official: boolean) {
  const s = title.toLowerCase(); let n = official ? 48 : 28;
  if (/japan|japanese|tokyo|日本|日米|総理|首相|外務大臣|防衛大臣|訪米/.test(s)) n += 35;
  if (/breaking|urgent|statement|executive order|sanction|war|attack|missile|tariff|辞任|解任|制裁|攻撃|ミサイル|首脳会談|共同声明/.test(s)) n += 25;
  if (/white house|president|secretary of state|congress|senate|prime minister|ホワイトハウス|大統領|国務長官|米議会/.test(s)) n += 14;
  return Math.min(99, n);
}

async function readSource(source: Source) {
  const res = await fetch(source.url, { headers: { "user-agent": "JPUS-Alert/1.0 (+public-policy-monitor)" }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`${source.name}: ${res.status}`);
  if (source.kind === "truth") {
    const posts = await res.json() as Array<{ id: string; url: string; created_at: string; content: string }>;
    return posts.map((post): AlertItem => {
      const text = decode(post.content); const title = text.slice(0, 180) || "Truth Social post";
      const japanRelated = /japan|japanese|tokyo|日本|日米/i.test(text);
      return { id: post.id, title, url: post.url, source: source.name, publishedAt: new Date(post.created_at).toISOString(), summary: text.length > 180 ? text.slice(180, 420) : "", category: source.category || "公式発表", priority: score(text, true), japanRelated, official: true };
    });
  }
  const xml = await res.text();
  const chunks = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 25).map((x) => x[2]);
  return chunks.map((chunk): AlertItem | null => {
    const title = field(chunk, "title"); const url = link(chunk);
    if (!title || !url) return null;
    const publishedAt = field(chunk, "pubDate") || field(chunk, "published") || field(chunk, "updated") || new Date().toISOString();
    const japanRelated = /japan|japanese|tokyo|日本|日米|総理|首相|外務省|防衛省|訪米/i.test(title + " " + field(chunk, "description"));
    return { id: Buffer.from(url).toString("base64url").slice(0, 36), title, url, source: source.name, publishedAt: new Date(publishedAt).toISOString(), summary: field(chunk, "description").slice(0, 240), category: source.official ? "公式発表" : classify(title, source.category), priority: score(title, !!source.official), japanRelated, official: !!source.official };
  }).filter((x): x is AlertItem => !!x);
}

export async function collect() {
  const results = await Promise.allSettled(sources.map(readSource));
  const items = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const unique = [...new Map(items.map((item) => [item.url.replace(/[?&](utm_[^=]+|oc)=[^&]+/g, ""), item])).values()]
    .sort((a, b) => b.priority - a.priority || +new Date(b.publishedAt) - +new Date(a.publishedAt)).slice(0, 180);
  return { generatedAt: new Date().toISOString(), mode: "live" as const, sources: { ok: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length, total: sources.length }, items: unique };
}
