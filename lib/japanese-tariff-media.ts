import type { AlertItem } from "./feeds";

const outlets = [
  ["NHK", "site:nhk.or.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["朝日新聞", "site:asahi.com (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["読売新聞", "site:yomiuri.co.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["毎日新聞", "site:mainichi.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["日本経済新聞", "site:nikkei.com (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["共同通信", "site:kyodonews.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["時事通信", "site:jiji.com (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["TBS", "site:newsdig.tbs.co.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["テレビ朝日", "site:tv-asahi.co.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
  ["FNN", "site:fnn.jp (関税 OR 日米関税 OR 自動車関税 OR トランプ関税)"],
] as const;

const rss = (query: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(`(${query}) when:7d`)}&hl=ja&gl=JP&ceid=JP:ja`;
const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const field = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
const link = (xml: string) => field(xml, "link") || xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";

async function readOutlet([label, query]: typeof outlets[number]) {
  const response = await fetch(rss(query), { headers: { "user-agent": "JPUS-Alert/2.1 (+major-japanese-media-monitor)" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${label}: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 40).map((match): AlertItem | null => {
    const chunk = match[2];
    const rawTitle = field(chunk, "title");
    const url = link(chunk);
    const published = field(chunk, "pubDate") || field(chunk, "published") || field(chunk, "updated");
    if (!rawTitle || !url || !published) return null;
    const date = new Date(published);
    if (!Number.isFinite(date.getTime())) return null;
    const title = rawTitle.replace(/\s+-\s+[^-]+$/, "").trim();
    const text = `${title} ${field(chunk, "description")}`;
    if (!/関税|tariff|通商|trade|自動車|輸出|輸入/i.test(text)) return null;
    return {
      id: Buffer.from(`${label}:${url}`).toString("base64url").slice(-36),
      title,
      url,
      source: field(chunk, "source") || label,
      publishedAt: date.toISOString(),
      summary: field(chunk, "description").slice(0, 360),
      category: "通商・経済",
      priority: /日本|日米|自動車|Japan/i.test(text) ? 92 : 78,
      japanRelated: /日本|日米|自動車|Japan/i.test(text),
      official: false,
      english: false,
    };
  }).filter((item): item is AlertItem => Boolean(item));
}

export async function collectJapaneseTariffMedia() {
  const results = await Promise.allSettled(outlets.map(readOutlet));
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [`${outlets[index][0]}・関税報道`] : []);
  return { items, ok: outlets.length - failedNames.length, failed: failedNames.length, total: outlets.length, failedNames };
}
