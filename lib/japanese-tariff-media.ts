import type { AlertItem } from "./feeds";
import { cleanNewsTitle } from "./policy.ts";

const outlets = [
  ["NHK", "nhk.or.jp"],
  ["朝日新聞", "asahi.com"],
  ["読売新聞", "yomiuri.co.jp"],
  ["毎日新聞", "mainichi.jp"],
  ["日本経済新聞", "nikkei.com"],
  ["共同通信", "kyodonews.jp"],
  ["時事通信", "jiji.com"],
  ["TBS", "newsdig.tbs.co.jp"],
  ["テレビ朝日", "tv-asahi.co.jp"],
  ["FNN", "fnn.jp"],
] as const;

const criticalQuery = [
  "関税", "日米関税", "自動車関税", "トランプ関税",
  "為替介入", "協調介入", "円買い介入", "ドル売り円買い", "ドル円", "円相場", "米財務省",
  "輸入解禁", "輸出解禁", "市場開放", "検疫協議", "米国産", "アメリカ産",
  "ジャガイモ", "じゃがいも", "ばれいしょ", "馬鈴薯",
].join(" OR ");

const searches = [
  ...outlets.map(([label, domain]) => [label, `site:${domain} (${criticalQuery})`, 7] as const),
  ["農産物市場開放", "(生のジャガイモ OR ジャガイモ OR じゃがいも OR ばれいしょ OR 馬鈴薯 OR 農産物) (輸入解禁 OR 輸出解禁 OR 市場開放 OR 検疫)", 30],
  ["日米市場アクセス", "(米国産 OR アメリカ産 OR 日米) (輸入解禁 OR 輸出解禁 OR 市場開放 OR 検疫協議 OR 農産物)", 30],
] as const;

const tariffPattern = /関税|tariffs?|dut(?:y|ies)|通商|trade|自動車関税/i;
const currencyInterventionPattern = /為替介入|協調介入|円買い(?:介入)?|円売り(?:介入)?|ドル売り円買い|ドル買い円売り|ドル円|円相場|米財務省.{0,40}(?:円|為替|介入)|(?:currency|foreign exchange|forex|yen)[-\s]?(?:market )?intervention|interven(?:e|es|ed|tion).{0,40}\byen\b|\byen\b.{0,40}interven/i;
const marketAccessPattern = /輸入解禁|輸出解禁|市場開放|検疫協議|輸入禁止.{0,30}(?:解除|撤廃)|輸出禁止.{0,30}(?:解除|撤廃)|生(?:鮮|食用)?の?(?:ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯)|(?:ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯).{0,30}(?:輸入|輸出|解禁|検疫)|market access|lift(?:s|ed|ing)? .{0,30}(?:import|export) ban|potato(?:es)?.{0,30}(?:import|export|market)/i;
const japanUSPattern = /日本|日米|米国|アメリカ|米政府|米財務省|トランプ|ベッセント|Japan|U\.?S\.?|United States|Trump|Bessent/i;
const mediaNoisePattern = /^(?:画像・写真|写真特集|ニュース・スポーツ)|Togetter|Vietnam\.vn/i;

const rss = (query: string, days = 7) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&hl=ja&gl=JP&ceid=JP:ja`;
const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const field = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const link = (xml: string) => field(xml, "link") || xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";

export function assessJapaneseCriticalMedia(title: string, summary = "") {
  const text = `${title} ${summary}`.replace(/\s+/g, " ").trim();
  const tariff = tariffPattern.test(text);
  const currencyIntervention = currencyInterventionPattern.test(text);
  const marketAccess = marketAccessPattern.test(text);
  const relevant = tariff || currencyIntervention || marketAccess;
  const japanRelated = currencyIntervention || marketAccess || japanUSPattern.test(text) || /自動車/i.test(text);
  const priority = currencyIntervention ? 98 : marketAccess ? 94 : japanRelated ? 92 : 78;
  return { relevant, japanRelated, priority };
}

async function readSearch([label, query, days]: typeof searches[number]) {
  const response = await fetch(rss(query, days), { headers: { "user-agent": "JPUS-Alert/3.0 (+major-japanese-media-monitor)" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 40).map((match): AlertItem | null => {
    const chunk = match[2];
    const rawTitle = field(chunk, "title");
    const url = link(chunk);
    const published = field(chunk, "pubDate") || field(chunk, "published") || field(chunk, "updated");
    if (!rawTitle || !url || !published) return null;
    const date = new Date(published);
    if (
      !Number.isFinite(date.getTime())
      || date.getTime() > Date.now() + 5 * 60 * 1_000
      || date.getTime() < Date.now() - Math.min(days + 1, 35) * 24 * 60 * 60 * 1_000
    ) return null;
    const publisher = field(chunk, "source");
    const title = cleanNewsTitle(rawTitle, publisher)
      .replace(/\s*[（(]20\d{2}年\d{1,2}月\d{1,2}日掲載[）)]\s*$/u, "")
      .trim();
    if (mediaNoisePattern.test(`${title} ${publisher}`)) return null;
    const summary = field(chunk, "description").slice(0, 360);
    const assessment = assessJapaneseCriticalMedia(title, summary);
    if (!assessment.relevant) return null;
    return {
      id: Buffer.from(`${label}:${url}`).toString("base64url").slice(-36),
      title,
      url,
      source: publisher || label,
      publishedAt: date.toISOString(),
      summary,
      category: "通商・経済",
      priority: assessment.priority,
      japanRelated: assessment.japanRelated,
      official: false,
      english: false,
      coverage: "major-media",
    };
  }).filter((item): item is AlertItem => Boolean(item));
}

export async function collectJapaneseCriticalMedia() {
  const results = await Promise.allSettled(searches.map(readSearch));
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [`${searches[index][0]}・重要経済報道`] : []);
  return { items, ok: searches.length - failedNames.length, failed: failedNames.length, total: searches.length, failedNames };
}
