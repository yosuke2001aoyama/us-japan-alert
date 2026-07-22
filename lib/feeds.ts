export type AlertItem = {
  id: string; title: string; url: string; source: string; publishedAt: string;
  summary: string; category: string; priority: number; japanRelated: boolean; official: boolean; english: boolean;
};

type Source = { name: string; url: string; official?: boolean; category?: string; kind?: "rss" | "truth" };

const q = (query: string, lang = "en-US", region = "US", ceid = "US:en") =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${region}&ceid=${ceid}`;

export const sources: Source[] = [
  { name: "White House", url: "https://www.whitehouse.gov/feed/", official: true, category: "公式発表" },
  { name: "U.S. Department of State", url: "https://www.state.gov/rss-feed/press-releases/feed/", official: true, category: "公式発表" },
  { name: "U.S. Department of Defense", url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=400&Site=945&Category=Press%20Releases", official: true, category: "公式発表" },
  { name: "Congress.gov", url: q('site:congress.gov (Japan OR Indo-Pacific OR alliance OR tariff OR sanctions OR China OR Taiwan)', "en-US", "US", "US:en"), official: true, category: "議会・政治" },
  { name: "Truth Social · @realDonaldTrump", url: "https://truthsocial.com/api/v1/accounts/107780257626128497/statuses?exclude_replies=true&limit=20", official: true, category: "公式発表", kind: "truth" },
  { name: "官邸・外務省・防衛省", url: q('(site:kantei.go.jp OR site:mofa.go.jp OR site:mod.go.jp) (米国 OR アメリカ OR 日米 OR 訪米 OR 首脳会談)', "ja", "JP", "JP:ja"), official: true, category: "公式発表" },
  { name: "訪米・首脳外交", url: q('(総理 OR 首相 OR 外務大臣 OR 防衛大臣 OR 経産大臣) (訪米 OR アメリカ訪問 OR 日米首脳会談 OR ワシントン) (調整 OR 検討 OR 見通し OR 予定 OR 会談)', "ja", "JP", "JP:ja"), category: "首脳・閣僚" },
  { name: "US–Japan News", url: q('Japan (Trump OR White House OR Congress OR Pentagon OR tariff OR security OR alliance OR summit OR sanctions)', "en-US", "US", "US:en"), category: "日米関係" },
  { name: "日本語・米政策速報", url: q('(米国 OR アメリカ OR トランプ OR ホワイトハウス OR 米議会) (日本 OR 日米 OR 同盟 OR 関税 OR 制裁 OR 中国 OR 台湾 OR 安全保障)', "ja", "JP", "JP:ja"), category: "議会・政治" },
  { name: "日米外交", url: q('(日米 OR 訪米 OR 米軍 OR 在日米軍 OR 拡大抑止 OR 首脳会談 OR 2プラス2)', "ja", "JP", "JP:ja"), category: "日米関係" },
  { name: "Reuters / AP / Bloomberg", url: q('(Reuters OR AP OR Bloomberg) (Japan OR Indo-Pacific OR China OR Taiwan OR sanctions OR tariff OR summit OR alliance)', "en-US", "US", "US:en"), category: "議会・政治" },
  { name: "US Television", url: q('(CNN OR Fox News OR NBC OR ABC OR CBS) (Japan OR Indo-Pacific OR China OR Taiwan OR tariff OR sanctions OR alliance)', "en-US", "US", "US:en"), category: "議会・政治" },
  { name: "US Newspapers / Politico", url: q('(New York Times OR Washington Post OR Wall Street Journal OR Politico) (Japan OR Indo-Pacific OR China OR Taiwan OR tariff OR sanctions OR alliance)', "en-US", "US", "US:en"), category: "議会・政治" },
  { name: "日本主要メディア", url: q('(NHK OR 朝日新聞 OR 読売新聞 OR 毎日新聞 OR 日経 OR 共同通信 OR 時事通信) (米国 OR アメリカ OR 日米)', "ja", "JP", "JP:ja"), category: "日米関係" },
  { name: "政策シンクタンク", url: q('(site:csis.org OR site:cfr.org OR site:brookings.edu OR site:rand.org) (Japan OR U.S.-Japan OR Indo-Pacific alliance)', "en-US", "US", "US:en"), category: "日米関係" },
];

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const field = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const link = (xml: string) => field(xml, "link") || xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";

function classify(title: string, base = "政治") {
  const s = title.toLowerCase();
  if (/prime minister|minister|secretary of state|summit|visit|首相|総理|大臣|訪米|首脳会談/.test(s)) return "首脳・閣僚";
  if (/econom|tariff|trade|market|fed|inflation|経済|関税|貿易|市場/.test(s)) return "通商・経済";
  if (/defen|security|military|pentagon|navy|nuclear|安全保障|防衛|米軍|核/.test(s)) return "外交・安保";
  if (/congress|senate|house |lawmaker|議会|上院|下院|議員/.test(s)) return "議会・政治";
  return base === "政治" ? "議会・政治" : base;
}

const japanPattern = /japan|japanese|tokyo|okinawa|日本|日米|東京|沖縄|総理|首相|外務省|防衛省|経産省|訪米/i;
const leadershipPattern = /president|prime minister|secretary of state|secretary of defense|summit|minister|大統領|首相|総理|国務長官|国防長官|外務大臣|防衛大臣|経産大臣|首脳会談|閣僚/i;
const strategicPattern = /alliance|indo-pacific|china|taiwan|north korea|security|defen|military|nuclear|missile|trade|tariff|sanction|export control|semiconductor|critical mineral|同盟|インド太平洋|中国|台湾|北朝鮮|安全保障|防衛|軍事|核|ミサイル|通商|貿易|関税|制裁|輸出管理|半導体|重要鉱物/i;
const majorActionPattern = /breaking|urgent|executive order|agreement|joint statement|resign|fired|nomination|confirmed|attack|war|emergency|合意|共同声明|辞任|解任|指名|承認|攻撃|戦争|緊急|調整|検討|見通し|訪問予定/i;
const lowValuePattern = /passport|visa|travel advisory|travel information|consular|citizen services|holiday|remarks at a reception|daily press briefing|schedule|readout of routine|パスポート|査証|ビザ|海外安全|たびレジ|在留届|領事|休館|募集|文化交流|記念行事|定例会見/i;

function isEnglish(text: string) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const japanese = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  return letters > japanese * 2 && letters > 12;
}

function score(text: string, official: boolean) {
  const s = text.toLowerCase(); let n = official ? 34 : 24;
  if (japanPattern.test(s)) n += 34;
  if (leadershipPattern.test(s)) n += 16;
  if (strategicPattern.test(s)) n += 18;
  if (majorActionPattern.test(s)) n += 18;
  if (/visit|trip|meet|訪米|訪問|会談|調整|検討/.test(s) && leadershipPattern.test(s)) n += 12;
  if (lowValuePattern.test(s)) n -= 50;
  return Math.min(99, n);
}

function policyRelevant(text: string, official: boolean) {
  if (lowValuePattern.test(text)) return false;
  const japan = japanPattern.test(text);
  const strategic = strategicPattern.test(text);
  const leadership = leadershipPattern.test(text);
  const action = majorActionPattern.test(text);
  if (japan && (strategic || leadership || action)) return true;
  if (japan && !official) return true;
  return (strategic && leadership) || (strategic && action) || (leadership && action);
}

async function readSource(source: Source) {
  const res = await fetch(source.url, { headers: { "user-agent": "JPUS-Alert/1.0 (+public-policy-monitor)" }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`${source.name}: ${res.status}`);
  if (source.kind === "truth") {
    const posts = await res.json() as Array<{ id: string; url: string; created_at: string; content: string }>;
    return posts.map((post): AlertItem => {
      const text = decode(post.content); const title = text.slice(0, 180) || "Truth Social post";
      const japanRelated = japanPattern.test(text);
      return { id: post.id, title, url: post.url, source: source.name, publishedAt: new Date(post.created_at).toISOString(), summary: text.length > 180 ? text.slice(180, 420) : "", category: classify(text, source.category || "公式発表"), priority: score(text, true), japanRelated, official: true, english: isEnglish(text) };
    }).filter((item) => policyRelevant(`${item.title} ${item.summary}`, true));
  }
  const xml = await res.text();
  const chunks = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 25).map((x) => x[2]);
  return chunks.map((chunk): AlertItem | null => {
    const title = field(chunk, "title"); const url = link(chunk);
    if (!title || !url) return null;
    const publishedAt = field(chunk, "pubDate") || field(chunk, "published") || field(chunk, "updated") || new Date().toISOString();
    const summary = field(chunk, "description").slice(0, 360);
    const text = `${title} ${summary}`;
    if (!policyRelevant(text, !!source.official)) return null;
    const japanRelated = japanPattern.test(text);
    return { id: Buffer.from(url).toString("base64url").slice(-36), title, url, source: source.name, publishedAt: new Date(publishedAt).toISOString(), summary, category: source.official && !japanRelated ? "公式発表" : classify(text, source.category), priority: score(text, !!source.official), japanRelated, official: !!source.official, english: isEnglish(title) };
  }).filter((x): x is AlertItem => !!x);
}

export async function collect() {
  const results = await Promise.allSettled(sources.map(readSource));
  const items = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const unique = [...new Map(items.map((item) => [item.url.replace(/[?&](utm_[^=]+|oc)=[^&]+/g, ""), item])).values()]
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt) || b.priority - a.priority).slice(0, 240);
  return { generatedAt: new Date().toISOString(), mode: "live" as const, sources: { ok: results.filter((r) => r.status === "fulfilled").length, failed: results.filter((r) => r.status === "rejected").length, total: sources.length }, items: unique };
}
