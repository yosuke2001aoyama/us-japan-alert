import { assessPolicyItem, cleanNewsTitle } from "./policy.ts";
import type { AlertItem } from "./feeds.ts";

type DirectResult = { items: AlertItem[]; ok: number; failed: number; failedNames: string[]; total: number };

type HtmlSource = {
  name: string;
  url: string;
  host: string;
  paths: RegExp;
};

const htmlSources: HtmlSource[] = [
  { name: "White House · News Direct", url: "https://www.whitehouse.gov/news/", host: "https://www.whitehouse.gov", paths: /^\/(?:presidential-actions|fact-sheets|briefings-statements|remarks|releases)\//i },
  { name: "White House · Presidential Actions Direct", url: "https://www.whitehouse.gov/presidential-actions/", host: "https://www.whitehouse.gov", paths: /^\/presidential-actions\//i },
  { name: "White House · Fact Sheets Direct", url: "https://www.whitehouse.gov/fact-sheets/", host: "https://www.whitehouse.gov", paths: /^\/fact-sheets\//i },
  { name: "USTR · Press Releases Direct", url: "https://ustr.gov/about-us/policy-offices/press-office/press-releases", host: "https://ustr.gov", paths: /\/about-us\/policy-offices\/press-office\/press-releases\//i },
  { name: "Commerce · Press Releases Direct", url: "https://www.commerce.gov/news/press-releases", host: "https://www.commerce.gov", paths: /\/news\/press-releases\//i },
];

const strip = (value: string) => value
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#(?:x27|39);/gi, "'")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

function safeDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function dateNear(html: string, offset: number) {
  const sample = strip(html.slice(Math.max(0, offset - 600), Math.min(html.length, offset + 900)));
  const match = sample.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}/i)
    || sample.match(/20\d{2}-\d{2}-\d{2}/);
  return safeDate(match?.[0]);
}

async function readHtmlSource(source: HtmlSource): Promise<AlertItem[]> {
  const response = await fetch(source.url, {
    headers: { "user-agent": "JPUS-Alert/3.0 (+direct-official-monitor)" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${source.name}: ${response.status}`);
  const html = await response.text();
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  const items: AlertItem[] = [];

  for (const match of matches) {
    const rawHref = match[1];
    let url: URL;
    try { url = new URL(rawHref, source.host); } catch { continue; }
    if (url.hostname !== new URL(source.host).hostname || !source.paths.test(url.pathname)) continue;
    const title = cleanNewsTitle(strip(match[2]));
    if (title.length < 18 || seen.has(url.href)) continue;
    const assessment = assessPolicyItem(title, "", true);
    if (!assessment.relevant) continue;
    seen.add(url.href);
    items.push({
      id: Buffer.from(url.href).toString("base64url").slice(-36),
      title,
      url: url.href,
      source: source.name.replace(" Direct", ""),
      publishedAt: dateNear(html, match.index || 0),
      summary: "一次情報ページを直接巡回して検知しました。詳細は原文をご確認ください。",
      official: true,
      ...assessment,
    });
    if (items.length >= 30) break;
  }
  return items;
}

async function readFederalRegister(): Promise<AlertItem[]> {
  const terms = ["tariff", "trade", "sanctions", "export control", "Japan", "China", "Taiwan", "Indo-Pacific"];
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("order", "newest");
  url.searchParams.set("conditions[term]", terms.join(" OR "));
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Federal Register Direct: ${response.status}`);
  const data = await response.json() as { results?: Array<{ title?: string; html_url?: string; publication_date?: string; abstract?: string; type?: string }> };
  return (data.results || []).flatMap((entry) => {
    if (!entry.title || !entry.html_url) return [];
    const assessment = assessPolicyItem(entry.title, entry.abstract || "", true);
    if (!assessment.relevant) return [];
    return [{
      id: Buffer.from(entry.html_url).toString("base64url").slice(-36),
      title: cleanNewsTitle(entry.title),
      url: entry.html_url,
      source: "Federal Register · Direct API",
      publishedAt: safeDate(entry.publication_date),
      summary: strip(entry.abstract || entry.type || "Federal Register掲載文書"),
      official: true,
      ...assessment,
    } satisfies AlertItem];
  }).slice(0, 40);
}

export async function collectDirectOfficial(): Promise<DirectResult> {
  const names = [...htmlSources.map((source) => source.name), "Federal Register · Direct API"];
  const tasks = [...htmlSources.map(readHtmlSource), () => readFederalRegister()];
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []);
  return {
    items: results.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: results.length,
  };
}
