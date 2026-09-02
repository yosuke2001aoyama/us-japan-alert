import type { AlertItem } from "./feeds.ts";
import { assessPolicyItem } from "./policy.ts";

const pages = [
  ["日本経済新聞 · 日米関係", "https://www.nikkei.com/theme/?dw=25012800"],
  ["日本経済新聞 · 外交・安全保障", "https://www.nikkei.com/politics/diplomacy/"],
] as const;

const decode = (value: string) => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export function parseNikkeiBilateralPage(html: string, now = Date.now()): AlertItem[] {
  const items: AlertItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const card = match[1];
    const href = card.match(/href=["']((?:https:\/\/www\.nikkei\.com)?\/article\/DG[^"']+\/?)["']/i)?.[1] || "";
    if (!href) continue;
    const url = new URL(href, "https://www.nikkei.com").toString();
    if (seen.has(url)) continue;

    const titleHtml = card.match(/<h[1-3]\b[^>]*>[\s\S]*?<a\b[^>]*href=["'][^"']*\/article\/DG[^"']*["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-3]>/i)?.[1]
      || card.match(/<a\b[^>]*href=["'][^"']*\/article\/DG[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || "";
    const title = decode(titleHtml);
    const publishedAt = card.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] || "";
    const published = Date.parse(publishedAt);
    if (!title || !Number.isFinite(published) || published > now + 5 * 60_000 || published < now - 35 * 24 * 60 * 60_000) continue;

    const summaryHtml = card.match(/<div\b[^>]*class=["'][^"']*excerpt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const summary = decode(summaryHtml).slice(0, 500);
    const assessment = assessPolicyItem(title, summary, false);
    if (!assessment.relevant || !assessment.japanRelated) continue;

    seen.add(url);
    items.push({
      id: Buffer.from(url).toString("base64url").slice(-36),
      title,
      url,
      source: "日本経済新聞",
      publishedAt: new Date(published).toISOString(),
      summary,
      category: assessment.category,
      priority: assessment.priority,
      japanRelated: assessment.japanRelated,
      official: false,
      english: assessment.english,
      coverage: "major-media",
    });
  }
  return items;
}

async function readPage([name, url]: typeof pages[number]) {
  const response = await fetch(url, {
    headers: { "user-agent": "JPUS-Alert/4.0 (+public-policy-monitor)" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return parseNikkeiBilateralPage(await response.text());
}

export async function collectNikkeiBilateralMedia() {
  const results = await Promise.allSettled(pages.map(readPage));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [pages[index][0]] : []);
  const seen = new Set<string>();
  const items = results
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((item) => seen.has(item.url) ? false : (seen.add(item.url), true));
  return { items, ok: pages.length - failedNames.length, failed: failedNames.length, total: pages.length, failedNames };
}
