import { assessPrincipalCommunication, cleanNewsTitle } from "./policy.ts";
import type { AlertItem } from "./feeds.ts";

type SocialResult = { items: AlertItem[]; ok: number; failed: number; failedNames: string[]; total: number };
type TruthAccount = { id: string; acct?: string; display_name?: string };
type TruthStatus = { id: string; created_at: string; content?: string; url?: string; reblog?: unknown; account?: TruthAccount };
type XUser = { id: string; username: string; name: string };
type XPost = { id: string; text: string; created_at?: string };
type PublicFigure = { username: string; label: string; side: "jp" | "us"; searchTerms: string[] };

const truthAccounts = ["realDonaldTrump"];

const publicFigures: PublicFigure[] = [
  { username: "WhiteHouse", label: "White House", side: "us", searchTerms: ["White House"] },
  { username: "POTUS", label: "President of the United States", side: "us", searchTerms: ["POTUS", "President Trump"] },
  { username: "VP", label: "Vice President", side: "us", searchTerms: ["Vice President Vance"] },
  { username: "SecRubio", label: "Secretary Marco Rubio", side: "us", searchTerms: ["Marco Rubio", "Secretary Rubio"] },
  { username: "DeptofDefense", label: "U.S. Department of Defense", side: "us", searchTerms: ["Department of Defense", "Pentagon"] },
  { username: "StateDept", label: "U.S. Department of State", side: "us", searchTerms: ["State Department"] },
  { username: "USTradeRep", label: "U.S. Trade Representative", side: "us", searchTerms: ["USTR", "Trade Representative"] },
  { username: "USTreasury", label: "U.S. Treasury", side: "us", searchTerms: ["U.S. Treasury"] },
  { username: "CommerceGov", label: "U.S. Commerce Department", side: "us", searchTerms: ["Commerce Department"] },

  // Japan-focused members and congressional foreign-policy leadership.
  { username: "SenDuckworth", label: "U.S. Senator Tammy Duckworth", side: "us", searchTerms: ["Tammy Duckworth", "Senator Duckworth"] },
  { username: "SenRickScott", label: "U.S. Senator Rick Scott", side: "us", searchTerms: ["Rick Scott", "Senator Rick Scott"] },
  { username: "SenatorHirono", label: "U.S. Senator Mazie Hirono", side: "us", searchTerms: ["Mazie Hirono", "Senator Hirono"] },
  { username: "SenDanSullivan", label: "U.S. Senator Dan Sullivan", side: "us", searchTerms: ["Dan Sullivan", "Senator Sullivan"] },
  { username: "SenBillHagerty", label: "U.S. Senator Bill Hagerty", side: "us", searchTerms: ["Bill Hagerty", "Senator Hagerty"] },
  { username: "SenatorRisch", label: "U.S. Senator Jim Risch", side: "us", searchTerms: ["Jim Risch", "Senator Risch"] },
  { username: "SenatorShaheen", label: "U.S. Senator Jeanne Shaheen", side: "us", searchTerms: ["Jeanne Shaheen", "Senator Shaheen"] },
  { username: "SenMarkey", label: "U.S. Senator Ed Markey", side: "us", searchTerms: ["Ed Markey", "Senator Markey"] },
  { username: "RepYoungKim", label: "U.S. Representative Young Kim", side: "us", searchTerms: ["Young Kim", "Representative Young Kim"] },
  { username: "RepBera", label: "U.S. Representative Ami Bera", side: "us", searchTerms: ["Ami Bera", "Representative Bera"] },
  { username: "RepMoolenaar", label: "U.S. Representative John Moolenaar", side: "us", searchTerms: ["John Moolenaar", "Representative Moolenaar"] },
  { username: "SFRCdems", label: "Senate Foreign Relations Committee Democrats", side: "us", searchTerms: ["Senate Foreign Relations Committee"] },
  { username: "SenateForeign", label: "Senate Foreign Relations Committee", side: "us", searchTerms: ["Senate Foreign Relations Committee"] },
  { username: "HouseForeignGOP", label: "House Foreign Affairs Committee", side: "us", searchTerms: ["House Foreign Affairs Committee"] },

  { username: "JPN_PMO", label: "Prime Minister's Office of Japan", side: "jp", searchTerms: ["Prime Minister's Office of Japan"] },
  { username: "MofaJapan_en", label: "Ministry of Foreign Affairs of Japan", side: "jp", searchTerms: ["MOFA Japan"] },
  { username: "ModJapan_en", label: "Ministry of Defense of Japan", side: "jp", searchTerms: ["MOD Japan"] },
];

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (compatible; JPUS-Alert/4.2; +https://us-japan-alert.vercel.app)",
  accept: "application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const decodeXml = (value = "") => value
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#(?:x27|39);/gi, "'").replace(/&nbsp;|&#160;/gi, " ");

const stripHtml = (value = "") => decodeXml(value)
  .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const xmlField = (xml: string, name: string) => decodeXml(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "").trim();

function socialItem(args: { text: string; url: string; source: string; publishedAt?: string; side: "jp" | "us" }): AlertItem | null {
  const text = stripHtml(args.text);
  if (!text) return null;
  // Include the verified account identity in assessment. A senator's own post rarely repeats their name.
  const assessment = assessPrincipalCommunication(`${args.source}: ${text}`, "SNS・公式個人発信", true, args.side);
  if (!assessment.relevant || !assessment.japanRelated) return null;
  return {
    id: Buffer.from(args.url).toString("base64url").slice(-36),
    title: cleanNewsTitle(text.length > 180 ? `${text.slice(0, 177)}…` : text),
    url: args.url,
    source: args.source,
    publishedAt: args.publishedAt && Number.isFinite(new Date(args.publishedAt).getTime()) ? new Date(args.publishedAt).toISOString() : new Date().toISOString(),
    summary: text,
    official: true,
    ...assessment,
  };
}

async function readTruthApi(acct: string): Promise<AlertItem[]> {
  const lookup = await fetch(`https://truthsocial.com/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!lookup.ok) throw new Error(`lookup ${lookup.status}`);
  const account = await lookup.json() as TruthAccount;
  if (!account.id) throw new Error("lookup missing account id");
  const statuses = await fetch(`https://truthsocial.com/api/v1/accounts/${account.id}/statuses?exclude_replies=true&exclude_reblogs=true&limit=30`, { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!statuses.ok) throw new Error(`statuses ${statuses.status}`);
  const data = await statuses.json() as TruthStatus[];
  if (!Array.isArray(data)) throw new Error("statuses malformed");
  return data.flatMap((status) => {
    if (status.reblog) return [];
    const item = socialItem({ text: status.content || "", url: status.url || `https://truthsocial.com/@${acct}/${status.id}`, source: `Truth Social · @${account.acct || acct} · President Donald Trump`, publishedAt: status.created_at, side: "us" });
    return item ? [item] : [];
  });
}

async function readTruthArchive(acct: string): Promise<AlertItem[]> {
  if (acct.toLowerCase() !== "realdonaldtrump") throw new Error("archive unavailable");
  const response = await fetch("https://www.trumpstruth.org/feed", { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`archive ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, 40).map((match) => match[1]);
  if (!entries.length) throw new Error("archive empty");
  return entries.flatMap((entry) => {
    const title = xmlField(entry, "title");
    const description = xmlField(entry, "description") || xmlField(entry, "content:encoded") || xmlField(entry, "summary");
    const pageLink = xmlField(entry, "link") || entry.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";
    const combined = `${title} ${description}`;
    const originalUrl = combined.match(/https:\/\/truthsocial\.com\/(?:@|users\/)(?:realDonaldTrump)(?:\/statuses)?\/\d+/i)?.[0]?.replace("/users/realDonaldTrump/statuses/", "/@realDonaldTrump/");
    const id = originalUrl?.match(/\/(\d+)(?:\?.*)?$/)?.[1];
    const url = originalUrl || (id ? `https://truthsocial.com/@realDonaldTrump/${id}` : pageLink);
    if (!url) return [];
    const text = stripHtml(description || title).replace(/^Donald J\. Trump:\s*["“]?/i, "").replace(/["”]\s*$/, "").replace(/^RT:\s*https:\/\/truthsocial\.com\/\S+\s*/i, "").trim();
    const item = socialItem({ text, url, source: "Truth Social · @realDonaldTrump · President Donald Trump", publishedAt: xmlField(entry, "pubDate") || xmlField(entry, "published") || xmlField(entry, "updated"), side: "us" });
    return item ? [item] : [];
  });
}

async function readTruthAccount(acct: string): Promise<AlertItem[]> {
  try { return await readTruthApi(acct); }
  catch (apiError) {
    try { return await readTruthArchive(acct); }
    catch (archiveError) {
      const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
      const archiveMessage = archiveError instanceof Error ? archiveError.message : String(archiveError);
      throw new Error(`Truth Social @${acct}: API ${apiMessage}; fallback ${archiveMessage}`);
    }
  }
}

async function readXAccount(figure: PublicFigure, bearer: string): Promise<AlertItem[]> {
  const userRes = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(figure.username)}`, { headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.2" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!userRes.ok) throw new Error(`X @${figure.username}: user ${userRes.status}`);
  const user = (await userRes.json() as { data?: XUser }).data;
  if (!user) throw new Error(`X @${figure.username}: user missing`);
  const postsRes = await fetch(`https://api.x.com/2/users/${user.id}/tweets?max_results=20&exclude=replies,retweets&tweet.fields=created_at`, { headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.2" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!postsRes.ok) throw new Error(`X @${figure.username}: posts ${postsRes.status}`);
  const posts = (await postsRes.json() as { data?: XPost[] }).data || [];
  return posts.flatMap((post) => {
    const item = socialItem({ text: post.text, url: `https://x.com/${figure.username}/status/${post.id}`, source: `X · @${figure.username} · ${figure.label}`, publishedAt: post.created_at, side: figure.side });
    return item ? [item] : [];
  });
}

async function readIndexedFigurePosts(figure: PublicFigure): Promise<AlertItem[]> {
  const identity = figure.searchTerms.map((term) => `"${term}"`).join(" OR ");
  const japanTopics = '(Japan OR Japanese OR Tokyo OR Okinawa OR Kumamoto OR earthquake OR tsunami OR Hiroshima OR Nagasaki OR "atomic bombing" OR "World War II" OR "Pacific War" OR "V-J Day" OR "end of war" OR 終戦 OR 原爆)';
  const query = `(site:x.com OR site:twitter.com OR site:${figure.username.toLowerCase()}.senate.gov OR site:house.gov OR site:senate.gov) (${identity}) ${japanTopics} when:14d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`indexed ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 20).map((m) => m[1]);
  return entries.flatMap((entry) => {
    const title = stripHtml(xmlField(entry, "title"));
    const link = xmlField(entry, "link");
    const description = stripHtml(xmlField(entry, "description"));
    if (!title || !link) return [];
    const item = socialItem({ text: `${title}. ${description}`, url: link, source: `公開検索 · ${figure.label}`, publishedAt: xmlField(entry, "pubDate"), side: figure.side });
    return item ? [item] : [];
  });
}

async function readJapanRemembranceSignals(): Promise<AlertItem[]> {
  const query = '(site:senate.gov OR site:house.gov OR site:whitehouse.gov OR site:state.gov OR site:x.com) (Hiroshima OR Nagasaki OR "atomic bombing" OR hibakusha OR "Pacific War" OR "World War II" OR "V-J Day" OR "end of war" OR Japan surrender OR 終戦 OR 原爆) (statement OR remarks OR commemorates OR remembers OR anniversary OR post) when:30d';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`remembrance ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 50).map((m) => m[1]);
  return entries.flatMap((entry) => {
    const title = stripHtml(xmlField(entry, "title"));
    const link = xmlField(entry, "link");
    const description = stripHtml(xmlField(entry, "description"));
    if (!title || !link) return [];
    const item = socialItem({ text: `${title}. ${description}`, url: link, source: "米政府・議会 · 日本戦争記憶関連発信", publishedAt: xmlField(entry, "pubDate"), side: "us" });
    return item ? [item] : [];
  });
}

export async function collectDirectSocial(): Promise<SocialResult> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const tasks: Array<{ name: string; run: () => Promise<AlertItem[]> }> = [
    ...truthAccounts.map((acct) => ({ name: `Truth Social · @${acct}`, run: () => readTruthAccount(acct) })),
    // Search-engine fallback always runs, so public posts and official web statements are still found without an X token.
    ...publicFigures.map((figure) => ({ name: `公開検索 · ${figure.label}`, run: () => readIndexedFigurePosts(figure) })),
    { name: "日本戦争記憶関連発信", run: readJapanRemembranceSignals },
    ...(bearer ? publicFigures.map((figure) => ({ name: `X · @${figure.username}`, run: () => readXAccount(figure, bearer) })) : []),
  ];
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [tasks[index].name] : []);
  const deduped = new Map<string, AlertItem>();
  for (const result of results) if (result.status === "fulfilled") for (const item of result.value) deduped.set(item.url, item);
  return {
    items: [...deduped.values()],
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: tasks.length,
  };
}
