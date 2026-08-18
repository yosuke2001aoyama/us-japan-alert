import { assessPolicyItem, assessPrincipalCommunication, cleanNewsTitle } from "./policy.ts";
import type { AlertItem } from "./feeds.ts";
import { enrichOfficialSpokenItems } from "./spoken-signals.ts";

type DirectResult = { items: AlertItem[]; ok: number; failed: number; failedNames: string[]; total: number };

type HtmlSource = {
  name: string;
  url: string;
  host: string;
  paths: RegExp;
};

const htmlSources: HtmlSource[] = [
  { name: "White House · News Direct", url: "https://www.whitehouse.gov/news/", host: "https://www.whitehouse.gov", paths: /^\/(?:presidential-actions|fact-sheets|briefings-statements|remarks|releases|videos)\//i },
  { name: "White House · Presidential Actions Direct", url: "https://www.whitehouse.gov/presidential-actions/", host: "https://www.whitehouse.gov", paths: /^\/presidential-actions\//i },
  { name: "White House · Fact Sheets Direct", url: "https://www.whitehouse.gov/fact-sheets/", host: "https://www.whitehouse.gov", paths: /^\/fact-sheets\//i },
  { name: "White House · Videos Direct", url: "https://www.whitehouse.gov/videos/", host: "https://www.whitehouse.gov", paths: /^\/videos\//i },
  { name: "USTR · Press Office Direct", url: "https://www.ustr.gov/about-us/policy-offices/press-office/press-releases", host: "https://www.ustr.gov", paths: /^\/(?:about-us|about)\/policy-offices\/press-office\/(?:press-releases|fact-sheets)\//i },
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
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function dateNear(html: string, offset: number) {
  const sample = strip(html.slice(Math.max(0, offset - 1400), Math.min(html.length, offset + 1800)));
  const match = sample.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}/i)
    || sample.match(/20\d{2}-\d{2}-\d{2}/)
    || sample.match(/\d{1,2}\/\d{1,2}\/20\d{2}/);
  return safeDate(match?.[0]);
}

function isRecent(value: string, days = 14) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= Date.now() - days * 86_400_000 && time <= Date.now() + 86_400_000;
}

function boostDirectPriority(item: AlertItem): AlertItem {
  const text = `${item.title} ${item.summary}`;
  const tariff = /tariff|dut(?:y|ies)|section 301|section 232|section 338|関税|追加税/i.test(text);
  const broadAction = /all products|60 econom|global|worldwide|all countries|全品目|60か国|60の国/i.test(text);
  const action = /impos|final action|determin|announc|proclamation|executive order|発動|決定|発表/i.test(text);
  const priority = Math.min(99, Math.max(item.priority, tariff && action ? 94 : item.priority, tariff && broadAction ? 98 : item.priority));
  return { ...item, priority };
}

async function readHtmlSource(source: HtmlSource): Promise<AlertItem[]> {
  const requestUrl = new URL(source.url);
  requestUrl.searchParams.set("_jpus", String(Math.floor(Date.now() / 300_000)));
  const response = await fetch(requestUrl, {
    headers: { "user-agent": "JPUS-Alert/3.2 (+direct-official-monitor)" },
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
    const publishedAt = dateNear(html, match.index || 0);
    // An undated archive link must never be stamped with the current time: that
    // would make an old item reappear as a brand-new alert on every refresh.
    if (!publishedAt || !isRecent(publishedAt)) continue;
    const principalAssessment = source.name.startsWith("White House")
      ? assessPrincipalCommunication(title, "", true, "us", true)
      : null;
    const assessment = principalAssessment?.relevant
      ? principalAssessment
      : assessPolicyItem(title, "", true);
    if (!assessment.relevant) continue;
    seen.add(url.href);
    items.push(boostDirectPriority({
      id: Buffer.from(url.href).toString("base64url").slice(-36),
      title,
      url: url.href,
      source: source.name.replace(" Direct", ""),
      publishedAt,
      summary: "公式ページの更新を検知。",
      official: true,
      ...assessment,
      ...(principalAssessment?.relevant ? { verifiedSource: true, actorCountry: "us" as const } : {}),
    }));
    if (items.length >= 40) break;
  }
  return items;
}

async function readFederalRegister(): Promise<AlertItem[]> {
  const terms = ["tariff", "trade", "sanctions", "export control", "Section 301", "Section 232", "Section 338", "Japan", "China", "Taiwan", "Indo-Pacific"];
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("order", "newest");
  url.searchParams.set("conditions[term]", terms.join(" OR "));
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Federal Register Direct: ${response.status}`);
  const data = await response.json() as { results?: Array<{ title?: string; html_url?: string; publication_date?: string; abstract?: string; type?: string }> };
  return (data.results || []).flatMap((entry) => {
    if (!entry.title || !entry.html_url) return [];
    const publishedAt = safeDate(entry.publication_date);
    if (!publishedAt || !isRecent(publishedAt)) return [];
    const assessment = assessPolicyItem(entry.title, entry.abstract || "", true);
    if (!assessment.relevant) return [];
    return [boostDirectPriority({
      id: Buffer.from(entry.html_url).toString("base64url").slice(-36),
      title: cleanNewsTitle(entry.title),
      url: entry.html_url,
      source: "Federal Register · Direct API",
      publishedAt,
      summary: strip(entry.abstract || entry.type || "Federal Register掲載文書"),
      official: true,
      ...assessment,
    } satisfies AlertItem)];
  }).slice(0, 50);
}

type CommerceNews = {
  label?: string;
  href?: string;
  self?: string;
  created?: number;
  body?: string;
  teaser?: string;
};

async function readCommerceApi(): Promise<AlertItem[]> {
  const url = new URL("https://api.commerce.gov/api/news");
  url.searchParams.set("sort", "-created");
  url.searchParams.set("page[limit]", "50");
  // The Commerce API documents DEMO_KEY for low-volume public access. An
  // operator-supplied key can replace it without ever reaching the browser.
  url.searchParams.set("api_key", process.env.COMMERCE_API_KEY || "DEMO_KEY");
  const response = await fetch(url, {
    headers: { "user-agent": "JPUS-Alert/3.3 (+official-api-monitor)" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Commerce · News API: ${response.status}`);
  const data = await response.json() as { data?: CommerceNews[] };
  return (data.data || []).flatMap((entry) => {
    const href = entry.href || entry.self;
    const publishedAt = entry.created ? new Date(entry.created * 1_000).toISOString() : undefined;
    if (!entry.label || !href || !publishedAt || !isRecent(publishedAt, 35)) return [];
    const summary = strip(entry.teaser || entry.body || "U.S. Department of Commerce公式発表").slice(0, 360);
    const assessment = assessPolicyItem(entry.label, summary, true);
    if (!assessment.relevant) return [];
    return [boostDirectPriority({
      id: Buffer.from(href).toString("base64url").slice(-36),
      title: cleanNewsTitle(entry.label),
      url: href,
      source: "U.S. Commerce · Direct API",
      publishedAt,
      summary,
      official: true,
      ...assessment,
    } satisfies AlertItem)];
  });
}

export async function collectDirectOfficial(): Promise<DirectResult> {
  const names = [...htmlSources.map((source) => source.name), "Commerce · News API", "Federal Register · Direct API"];
  const tasks: Array<() => Promise<AlertItem[]>> = [
    ...htmlSources.map((source) => () => readHtmlSource(source)),
    readCommerceApi,
    readFederalRegister,
  ];
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []);
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return {
    items: await enrichOfficialSpokenItems(items),
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: results.length,
  };
}
