import type { AlertItem } from "./feeds.ts";
import { assessPolicyItem, cleanNewsSummary, cleanNewsTitle } from "./policy.ts";

export type TranscriptKind = "official-captions" | "reported-excerpt";

type SpokenItem = AlertItem & {
  spokenEvent?: boolean;
  mediaUrl?: string;
  transcript?: string;
  transcriptKind?: TranscriptKind;
  transcriptLanguage?: string;
  transcriptSource?: string;
};

type SpokenResult = {
  items: SpokenItem[];
  ok: number;
  failed: number;
  failedNames: string[];
  total: number;
};

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/136 Safari/537.36 JPUS-Alert/4.0",
  "accept-language": "en-US,en;q=0.9,ja;q=0.8",
};

const spokenTitlePattern = /機中|大統領専用機|エアフォースワン|記者団|囲み取材|インタビュー|会見|演説|発言|gaggle|aboard air force one|speaks? to (?:the )?press|speaks? to reporters?|told reporters?|interview|press conference|remarks?|speech/i;
const importantSubjectPattern = /日本|日米|米国|アメリカ|円|為替|通貨|介入|関税|通商|貿易|中国|台湾|北朝鮮|韓国|同盟|安全保障|防衛|制裁|輸出管理|japan|u\.?s\.?-japan|yen|currency|foreign exchange|intervention|tariff|trade|china|taiwan|north korea|south korea|alliance|security|defen[cs]e|sanction|export control/i;
const mediaNoisePattern = /画像まとめ|画像・写真|写真特集|\[写真特集|フォトギャラリー|photo gallery/i;

const jpQuery = '(機中 OR 大統領専用機 OR エアフォースワン OR 記者団 OR 囲み取材 OR インタビュー OR 会見 OR 演説) (トランプ OR 米大統領 OR 米政府高官 OR 米閣僚 OR 総理 OR 首相 OR 官房長官 OR 外相 OR 防衛相 OR 財務相 OR 経産相) (日本 OR 日米 OR 米国 OR 円 OR 為替 OR 通貨 OR 介入 OR 関税 OR 通商 OR 貿易 OR 中国 OR 台湾 OR 北朝鮮 OR 韓国 OR 同盟 OR 安全保障) when:7d';
const enQuery = '("aboard Air Force One" OR gaggle OR "told reporters" OR interview OR "press conference" OR remarks OR speech) (Trump OR President OR secretary) (Japan OR yen OR currency OR intervention OR tariff OR trade OR China OR Taiwan OR "North Korea" OR "South Korea" OR alliance OR security) when:7d';
const trustedSpokenPublisher = /NHK|朝日|読売|毎日|日本経済|日経|共同|時事|テレ朝|テレビ朝日|TBS|FNN|産経|Associated Press|\bAP\b|Reuters|Bloomberg|CNN|Fox News|NBC|ABC|CBS/i;

const rssUrl = (query: string, language: "ja" | "en") => language === "ja"
  ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`
  : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

const decode = (value: string) => value
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const xmlField = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function isRecent(value: string, days = 7) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now() + 300_000 && time >= Date.now() - days * 86_400_000;
}

export function isSpokenEventTitle(title: string) {
  return spokenTitlePattern.test(title);
}

export function extractReportedExcerpt(text: string) {
  const excerpts: string[] = [];
  const patterns = [/[「『]([^」』]{4,260})[」』]/g, /[“]([^”]{4,260})[”]/g, /"([^"\n]{4,260})"/g];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1].replace(/\s+/g, " ").trim();
      if (value && !excerpts.includes(value)) excerpts.push(value);
      if (excerpts.length >= 4) break;
    }
    if (excerpts.length >= 4) break;
  }
  return excerpts.join("\n").slice(0, 1_200);
}

export function extractYoutubeId(html: string) {
  return html.match(/youtube\.com\/embed\/([\w-]{6,})/i)?.[1]
    || html.match(/youtu\.be\/([\w-]{6,})/i)?.[1]
    || html.match(/[?&]v=([\w-]{6,})/i)?.[1]
    || "";
}

export function extractCaptionTrackUrl(html: string) {
  const raw = html.match(/"captionTracks":\[\{"baseUrl":"([^"]+)/)?.[1];
  if (!raw) return "";
  try { return JSON.parse(`"${raw}"`) as string; }
  catch { return raw.replaceAll("\\u0026", "&").replaceAll("\\/", "/"); }
}

export function parseCaptionBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      return (data.events || [])
        .flatMap((event) => event.segs || [])
        .map((segment) => segment.utf8 || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    } catch { /* fall through to text parsing */ }
  }
  const xmlText = [...trimmed.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((match) => decode(match[1])).join(" ");
  if (xmlText) return xmlText.replace(/\s+/g, " ").trim();
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line && !/^WEBVTT|^\d\d:\d\d|^\d+$|^NOTE/.test(line))
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectRelevantTranscript(transcript: string) {
  const sentences = transcript
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const selected = new Set<number>();
  sentences.forEach((sentence, index) => {
    if (!importantSubjectPattern.test(sentence)) return;
    selected.add(index);
    if (index > 0) selected.add(index - 1);
    if (index + 1 < sentences.length) selected.add(index + 1);
  });
  return [...selected].sort((left, right) => left - right).map((index) => sentences[index]).join("\n").slice(0, 8_000);
}

async function fetchText(url: string, timeout = 9_000) {
  const response = await fetch(url, { headers: browserHeaders, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: ${response.status}`);
  return response.text();
}

async function officialCaptions(pageUrl: string) {
  const page = await fetchText(pageUrl);
  const youtubeId = extractYoutubeId(page);
  if (!youtubeId) return { mediaUrl: "", transcript: "" };
  const mediaUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const watchPage = await fetchText(mediaUrl);
  const trackUrl = extractCaptionTrackUrl(watchPage);
  if (!trackUrl) return { mediaUrl, transcript: "" };
  for (const url of [`${trackUrl}&fmt=json3`, trackUrl]) {
    try {
      const transcript = selectRelevantTranscript(parseCaptionBody(await fetchText(url, 7_000)));
      if (transcript) return { mediaUrl, transcript };
    } catch { /* captions may still be processing; the next refresh retries */ }
  }
  return { mediaUrl, transcript: "" };
}

export async function enrichOfficialSpokenItems(items: AlertItem[]): Promise<SpokenItem[]> {
  const candidates = items
    .filter((item) => item.official
      && isSpokenEventTitle(item.title)
      && (/videos?/i.test(item.source) || /\/videos?\//i.test(item.url)))
    .sort((left, right) => +new Date(right.publishedAt) - +new Date(left.publishedAt))
    .slice(0, 6);
  const enriched = new Map<string, SpokenItem>();
  await Promise.all(candidates.map(async (item) => {
    try {
      const captions = await officialCaptions(item.url);
      const assessment = captions.transcript ? assessPolicyItem(item.title, captions.transcript, true) : null;
      enriched.set(item.url, {
        ...item,
        ...(assessment?.relevant ? assessment : {}),
        spokenEvent: true,
        ...(captions.mediaUrl ? { mediaUrl: captions.mediaUrl } : {}),
        ...(captions.transcript ? {
          transcript: captions.transcript,
          transcriptKind: "official-captions" as const,
          transcriptLanguage: "en",
          transcriptSource: "White House公式動画・自動字幕",
          priority: Math.max(item.priority, assessment?.priority || 0, 96),
        } : {}),
      });
    } catch {
      enriched.set(item.url, { ...item, spokenEvent: true });
    }
  }));
  return items.map((item) => enriched.get(item.url) || item);
}

async function readSpokenMedia(query: string, language: "ja" | "en"): Promise<SpokenItem[]> {
  const response = await fetch(rssUrl(query, language), { headers: browserHeaders, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`spoken media ${language}: ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 45).map((match) => match[1]);
  return entries.flatMap((entry): SpokenItem[] => {
    const rawTitle = xmlField(entry, "title");
    const publisher = xmlField(entry, "source");
    const url = xmlField(entry, "link");
    const publishedAt = safeDate(xmlField(entry, "pubDate"));
    if (!rawTitle || !publisher || !url || !publishedAt || !isRecent(publishedAt) || !trustedSpokenPublisher.test(publisher)) return [];
    const title = cleanNewsTitle(rawTitle, publisher);
    if (mediaNoisePattern.test(title)) return [];
    const rawSummary = xmlField(entry, "description").slice(0, 700);
    const summary = cleanNewsSummary(rawSummary, title, publisher);
    const text = `${title} ${summary}`;
    if (!importantSubjectPattern.test(text)) return [];
    const assessment = assessPolicyItem(text, "", false);
    if (!assessment.relevant) return [];
    const excerpt = extractReportedExcerpt(title);
    return [{
      id: Buffer.from(url).toString("base64url").slice(-36),
      title,
      url,
      source: publisher,
      publishedAt,
      summary,
      official: false,
      coverage: "major-media",
      ...assessment,
      priority: Math.max(assessment.priority, 94),
      spokenEvent: true,
      ...(excerpt ? {
        transcript: excerpt,
        transcriptKind: "reported-excerpt" as const,
        transcriptLanguage: language,
        transcriptSource: publisher,
      } : {}),
    }];
  });
}

export async function collectSpokenSignals(): Promise<SpokenResult> {
  const names = ["日本主要メディア · 音声発言速報", "主要英語メディア · 音声発言速報"];
  const results = await Promise.allSettled([readSpokenMedia(jpQuery, "ja"), readSpokenMedia(enQuery, "en")]);
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : []);
  return {
    items: results.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: results.length,
  };
}
