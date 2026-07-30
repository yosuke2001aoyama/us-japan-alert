import { assessDirectPrincipalPost, assessPrincipalCommunication, cleanNewsTitle } from "./policy.ts";
import type { AlertItem } from "./feeds.ts";

type SocialResult = { items: AlertItem[]; ok: number; failed: number; failedNames: string[]; total: number };
type TruthAccount = { id: string; acct?: string; display_name?: string };
type TruthStatus = { id: string; created_at: string; content?: string; url?: string; reblog?: unknown; account?: TruthAccount };
type XUser = { id: string; username: string; name: string };
type XPost = { id: string; text: string; created_at?: string };

export type PublicFigure = {
  username?: string;
  label: string;
  side: "jp" | "us";
  searchTerms: string[];
  officialDomains?: string[];
};

export type IndexedSweep = {
  name: string;
  side: "jp" | "us";
  identity: string;
  domains: string[];
  topics: string;
  source: string;
  days?: number;
  identityTerms?: string[];
};

const truthAccounts = ["realDonaldTrump"];

const japanTopics =
  '(Japan OR Japanese OR Tokyo OR Okinawa OR Hokkaido OR Tohoku OR Kyushu OR Kumamoto OR Noto OR earthquake OR tsunami OR typhoon OR disaster OR Hiroshima OR Nagasaki OR hibakusha OR "A-bomb" OR "atomic bomb" OR "atomic bombing" OR "atomic weapon" OR "nuclear weapon" OR "nuclear abolition" OR "Enola Gay" OR "Pearl Harbor" OR "World War II" OR "Pacific War" OR "V-J Day" OR "end of war" OR "unconditional surrender" OR "Japan surrender" OR alliance OR Indo-Pacific OR trade OR tariff OR sanctions OR semiconductor OR supply chain OR 終戦 OR 原爆 OR 被爆 OR 被爆者 OR 核兵器 OR 真珠湾 OR 日米 OR 日本)';

export const publicFigures: PublicFigure[] = [
  { username: "WhiteHouse", label: "White House", side: "us", searchTerms: ["White House"], officialDomains: ["whitehouse.gov"] },
  { username: "POTUS", label: "President of the United States", side: "us", searchTerms: ["POTUS", "President Trump"], officialDomains: ["whitehouse.gov"] },
  { username: "VP", label: "Vice President", side: "us", searchTerms: ["Vice President Vance"], officialDomains: ["whitehouse.gov"] },
  { username: "SecRubio", label: "Secretary Marco Rubio", side: "us", searchTerms: ["Marco Rubio", "Secretary Rubio"], officialDomains: ["state.gov"] },
  { username: "SecWar", label: "Secretary of War Pete Hegseth", side: "us", searchTerms: ["Pete Hegseth", "Secretary Hegseth", "SecWar"], officialDomains: ["defense.gov", "war.gov"] },
  { username: "SecScottBessent", label: "Treasury Secretary Scott Bessent", side: "us", searchTerms: ["Scott Bessent", "Secretary Bessent"], officialDomains: ["home.treasury.gov", "treasury.gov"] },
  { username: "howardlutnick", label: "Commerce Secretary Howard Lutnick", side: "us", searchTerms: ["Howard Lutnick", "Secretary Lutnick"], officialDomains: ["commerce.gov"] },
  { username: "jamiesongreer", label: "U.S. Trade Representative Jamieson Greer", side: "us", searchTerms: ["Jamieson Greer", "Trade Representative Greer"], officialDomains: ["ustr.gov"] },
  { username: "DeptofDefense", label: "U.S. Department of Defense", side: "us", searchTerms: ["Department of Defense", "Department of War", "Pentagon"], officialDomains: ["defense.gov", "war.gov"] },
  { username: "StateDept", label: "U.S. Department of State", side: "us", searchTerms: ["State Department", "Department of State"], officialDomains: ["state.gov"] },
  { username: "USAmbJapan", label: "U.S. Ambassador to Japan George Glass", side: "us", searchTerms: ["George Glass", "U.S. Ambassador to Japan", "USAmbJapan"], officialDomains: ["jp.usembassy.gov", "state.gov"] },
  { username: "USTradeRep", label: "U.S. Trade Representative", side: "us", searchTerms: ["USTR", "Trade Representative"], officialDomains: ["ustr.gov"] },
  { username: "USTreasury", label: "U.S. Treasury", side: "us", searchTerms: ["U.S. Treasury"], officialDomains: ["home.treasury.gov", "treasury.gov"] },
  { username: "CommerceGov", label: "U.S. Commerce Department", side: "us", searchTerms: ["Commerce Department"], officialDomains: ["commerce.gov"] },

  // Japan-focused members and congressional foreign-policy leadership with known official X accounts.
  { username: "SenDuckworth", label: "U.S. Senator Tammy Duckworth", side: "us", searchTerms: ["Tammy Duckworth", "Senator Duckworth"], officialDomains: ["duckworth.senate.gov"] },
  { username: "SenRickScott", label: "U.S. Senator Rick Scott", side: "us", searchTerms: ["Rick Scott", "Senator Rick Scott"], officialDomains: ["rickscott.senate.gov"] },
  { username: "SenatorHirono", label: "U.S. Senator Mazie Hirono", side: "us", searchTerms: ["Mazie Hirono", "Senator Hirono"], officialDomains: ["hirono.senate.gov"] },
  { username: "SenDanSullivan", label: "U.S. Senator Dan Sullivan", side: "us", searchTerms: ["Dan Sullivan", "Senator Sullivan"], officialDomains: ["sullivan.senate.gov"] },
  { username: "SenBillHagerty", label: "U.S. Senator Bill Hagerty", side: "us", searchTerms: ["Bill Hagerty", "Senator Hagerty"], officialDomains: ["hagerty.senate.gov"] },
  { username: "SenatorRisch", label: "U.S. Senator Jim Risch", side: "us", searchTerms: ["Jim Risch", "Senator Risch"], officialDomains: ["risch.senate.gov"] },
  { username: "SenatorShaheen", label: "U.S. Senator Jeanne Shaheen", side: "us", searchTerms: ["Jeanne Shaheen", "Senator Shaheen"], officialDomains: ["shaheen.senate.gov"] },
  { username: "SenMarkey", label: "U.S. Senator Ed Markey", side: "us", searchTerms: ["Ed Markey", "Senator Markey"], officialDomains: ["markey.senate.gov"] },
  { username: "RepYoungKim", label: "U.S. Representative Young Kim", side: "us", searchTerms: ["Young Kim", "Representative Young Kim"], officialDomains: ["youngkim.house.gov"] },
  { username: "RepBera", label: "U.S. Representative Ami Bera", side: "us", searchTerms: ["Ami Bera", "Representative Bera"], officialDomains: ["bera.house.gov"] },
  { username: "RepMoolenaar", label: "U.S. Representative John Moolenaar", side: "us", searchTerms: ["John Moolenaar", "Representative Moolenaar"], officialDomains: ["moolenaar.house.gov"] },
  { username: "SFRCdems", label: "Senate Foreign Relations Committee Democrats", side: "us", searchTerms: ["Senate Foreign Relations Committee"], officialDomains: ["foreign.senate.gov"] },
  { username: "SenateForeign", label: "Senate Foreign Relations Committee", side: "us", searchTerms: ["Senate Foreign Relations Committee"], officialDomains: ["foreign.senate.gov"] },
  { username: "HouseForeignGOP", label: "House Foreign Affairs Committee", side: "us", searchTerms: ["House Foreign Affairs Committee"], officialDomains: ["foreignaffairs.house.gov"] },

  { username: "JPN_PMO", label: "Prime Minister's Office of Japan", side: "jp", searchTerms: ["Prime Minister's Office of Japan"], officialDomains: ["kantei.go.jp"] },
  { username: "takaichi_sanae", label: "Prime Minister Sanae Takaichi", side: "jp", searchTerms: ["Sanae Takaichi", "高市早苗", "高市総理"], officialDomains: ["kantei.go.jp"] },
  { username: "MofaJapan_en", label: "Ministry of Foreign Affairs of Japan", side: "jp", searchTerms: ["MOFA Japan"], officialDomains: ["mofa.go.jp"] },
  { username: "ModJapan_en", label: "Ministry of Defense of Japan", side: "jp", searchTerms: ["MOD Japan"], officialDomains: ["mod.go.jp"] },
  { username: "shinjirokoiz", label: "Defense Minister Shinjiro Koizumi", side: "jp", searchTerms: ["Shinjiro Koizumi", "小泉進次郎", "小泉防衛相"], officialDomains: ["mod.go.jp"] },
  { username: "satsukikatayama", label: "Finance Minister Satsuki Katayama", side: "jp", searchTerms: ["Satsuki Katayama", "片山さつき", "片山財務相"], officialDomains: ["mof.go.jp"] },
  { username: "onoda_kimi", label: "Economic Security Minister Kimi Onoda", side: "jp", searchTerms: ["Kimi Onoda", "小野田紀美", "小野田経済安保相"], officialDomains: ["cao.go.jp"] },
];

// These searches are deliberately role- and domain-based so coverage survives personnel changes.
// The Senate/House sweeps cover every member's official site, while targeted sweeps add high-value principals.
export const indexedSweeps: IndexedSweep[] = [
  {
    name: "全米上院議員公式サイト",
    side: "us",
    identity: '("U.S. Senator" OR Senator OR statement OR remarks OR press release OR post)',
    domains: ["senate.gov"],
    topics: japanTopics,
    source: "米連邦議員公式発信 · U.S. Senator",
    days: 14,
  },
  {
    name: "全米下院議員公式サイト",
    side: "us",
    identity: '("U.S. Representative" OR Representative OR Congressman OR Congresswoman OR statement OR remarks OR press release OR post)',
    domains: ["house.gov"],
    topics: japanTopics,
    source: "米連邦議員公式発信 · U.S. Representative",
    days: 14,
  },
  {
    name: "日米重要議員",
    side: "us",
    identity: '("Bill Hagerty" OR "Tammy Duckworth" OR "Mazie Hirono" OR "Dan Sullivan" OR "Jim Risch" OR "Jeanne Shaheen" OR "Ed Markey" OR "Rick Scott" OR "Young Kim" OR "Ami Bera" OR "John Moolenaar" OR "Roger Wicker" OR "Tom Cotton" OR "Lindsey Graham" OR "Mitch McConnell" OR "Mike Crapo" OR "Chris Coons" OR "John Cornyn" OR "Ted Cruz" OR "Maria Cantwell" OR "Chuck Grassley" OR "Ron Wyden" OR "Brian Mast" OR "Michael McCaul" OR "Gregory Meeks" OR "Raja Krishnamoorthi" OR "Elissa Slotkin" OR "Pete Ricketts" OR "Andy Kim")',
    domains: ["senate.gov", "house.gov", "x.com", "twitter.com"],
    topics: japanTopics,
    source: "日米関係重要議員 · U.S. Senator/Representative",
    days: 14,
    identityTerms: ["Bill Hagerty", "Tammy Duckworth", "Mazie Hirono", "Dan Sullivan", "Jim Risch", "Jeanne Shaheen", "Ed Markey", "Rick Scott", "Young Kim", "Ami Bera", "John Moolenaar", "Roger Wicker", "Tom Cotton", "Lindsey Graham", "Mitch McConnell", "Mike Crapo", "Chris Coons", "John Cornyn", "Ted Cruz", "Maria Cantwell", "Chuck Grassley", "Ron Wyden", "Brian Mast", "Michael McCaul", "Gregory Meeks", "Raja Krishnamoorthi", "Elissa Slotkin", "Pete Ricketts", "Andy Kim"],
  },
  {
    name: "米議会委員会・コーカス",
    side: "us",
    identity: '("Senate Foreign Relations Committee" OR "House Foreign Affairs Committee" OR "Senate Armed Services Committee" OR "House Armed Services Committee" OR "Senate Finance Committee" OR "House Ways and Means Committee" OR Appropriations OR "Select Committee on China" OR "Congressional Japan Caucus" OR "Japan Caucus")',
    domains: ["senate.gov", "house.gov"],
    topics: japanTopics,
    source: "米議会委員会・日米議連 · Member of Congress",
    days: 21,
  },
  {
    name: "駐日米国大使館・実務幹部",
    side: "us",
    identity: '("George Glass" OR "U.S. Ambassador to Japan" OR "U.S. Mission Japan" OR "Embassy Tokyo" OR "@USAmbJapan")',
    domains: ["jp.usembassy.gov", "state.gov", "x.com", "twitter.com"],
    topics: japanTopics,
    source: "駐日米国大使館 · Ambassador/Deputy Chief of Mission",
    days: 21,
    identityTerms: ["George Glass", "U.S. Ambassador to Japan", "U.S. Mission Japan", "Embassy Tokyo", "USAmbJapan"],
  },
  {
    name: "国務省EAP・日本部",
    side: "us",
    identity: '("East Asian and Pacific Affairs" OR EAP OR "Office of Japanese Affairs" OR "Assistant Secretary" OR "Deputy Assistant Secretary" OR spokesperson)',
    domains: ["state.gov"],
    topics: japanTopics,
    source: "米国務省EAP・日本部 · Assistant Secretary/official",
    days: 21,
  },
  {
    name: "NSC・大統領府インド太平洋",
    side: "us",
    identity: '("National Security Council" OR NSC OR "National Security Advisor" OR "Senior Director for East Asia" OR "Senior Director for the Indo-Pacific" OR "Indo-Pacific coordinator")',
    domains: ["whitehouse.gov"],
    topics: japanTopics,
    source: "ホワイトハウスNSC · National Security Advisor/Senior Director",
    days: 21,
  },
  {
    name: "太平洋軍・在日米軍・海軍",
    side: "us",
    identity: '("Samuel Paparo" OR "Stephen Jost" OR "George Rowell" OR commander OR deputy commander OR "U.S. Forces Japan" OR USFJ OR USPACOM OR USINDOPACOM OR "Pacific Fleet" OR "Seventh Fleet")',
    domains: ["pacom.mil", "usfj.mil", "cpf.navy.mil", "c7f.navy.mil", "defense.gov", "war.gov"],
    topics: japanTopics,
    source: "米太平洋軍・在日米軍 · Commander/Deputy Commander",
    days: 21,
  },
  {
    name: "通商・財務・商務の日米実務",
    side: "us",
    identity: '("Jamieson Greer" OR "Scott Bessent" OR "Howard Lutnick" OR "Trade Representative" OR "Treasury Secretary" OR "Commerce Secretary" OR "Deputy USTR" OR "Assistant Secretary")',
    domains: ["ustr.gov", "treasury.gov", "home.treasury.gov", "commerce.gov", "bis.gov"],
    topics: japanTopics,
    source: "米通商・財務・商務 · Secretary/Trade Representative",
    days: 21,
  },
  {
    name: "日本政府・主要閣僚公式発信",
    side: "jp",
    identity: '(総理 OR 首相 OR 官房長官 OR 外務大臣 OR 防衛大臣 OR 財務大臣 OR 経済産業大臣 OR 経済安全保障担当大臣 OR 国家安全保障局長 OR 会見 OR 声明 OR 投稿)',
    domains: ["kantei.go.jp", "mofa.go.jp", "mod.go.jp", "mof.go.jp", "meti.go.jp", "cas.go.jp", "cao.go.jp"],
    topics: '(米国 OR アメリカ OR 日米 OR 同盟 OR インド太平洋 OR 中国 OR 台湾 OR 北朝鮮 OR 関税 OR 通商 OR 投資 OR 制裁 OR 地震 OR 津波 OR 災害 OR 広島 OR 長崎 OR 終戦 OR 被爆者)',
    source: "日本政府・主要閣僚 · Prime Minister/Minister",
    days: 14,
  },
];

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (compatible; JPUS-Alert/4.3; +https://us-japan-alert.vercel.app)",
  accept: "application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const decodeXml = (value = "") => value
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#(?:x27|39);/gi, "'").replace(/&nbsp;|&#160;/gi, " ");

const stripHtml = (value = "") => decodeXml(value)
  .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const xmlField = (xml: string, name: string) =>
  decodeXml(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "").trim();

function socialItem(args: {
  text: string;
  url: string;
  source: string;
  publishedAt?: string;
  side: "jp" | "us";
  verifiedAuthor?: boolean;
  directPost?: boolean;
}): AlertItem | null {
  const text = stripHtml(args.text);
  if (!text) return null;
  const assessment = args.directPost
    ? assessDirectPrincipalPost(text, "", args.side)
    : assessPrincipalCommunication(text, "", Boolean(args.verifiedAuthor), args.side, Boolean(args.verifiedAuthor));
  if (!assessment.relevant || (!args.directPost && !assessment.japanRelated)) return null;
  return {
    id: Buffer.from(args.url).toString("base64url").slice(-36),
    title: cleanNewsTitle(text.length > 180 ? `${text.slice(0, 177)}…` : text),
    url: args.url,
    source: args.source,
    publishedAt: args.publishedAt && Number.isFinite(new Date(args.publishedAt).getTime())
      ? new Date(args.publishedAt).toISOString()
      : new Date().toISOString(),
    summary: text,
    official: Boolean(args.verifiedAuthor),
    ...(args.verifiedAuthor ? { verifiedSource: true, actorCountry: args.side } : {}),
    ...assessment,
  };
}

async function readTruthApi(acct: string): Promise<AlertItem[]> {
  const lookup = await fetch(`https://truthsocial.com/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, {
    headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!lookup.ok) throw new Error(`lookup ${lookup.status}`);
  const account = await lookup.json() as TruthAccount;
  if (!account.id) throw new Error("lookup missing account id");
  const statuses = await fetch(`https://truthsocial.com/api/v1/accounts/${account.id}/statuses?exclude_replies=true&exclude_reblogs=true&limit=30`, {
    headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!statuses.ok) throw new Error(`statuses ${statuses.status}`);
  const data = await statuses.json() as TruthStatus[];
  if (!Array.isArray(data)) throw new Error("statuses malformed");
  return data.flatMap((status) => {
    if (status.reblog) return [];
    const item = socialItem({
      text: status.content || "",
      url: status.url || `https://truthsocial.com/@${acct}/${status.id}`,
      source: `Truth Social · @${account.acct || acct} · President Donald Trump`,
      publishedAt: status.created_at,
      side: "us",
      verifiedAuthor: true,
      directPost: true,
    });
    return item ? [item] : [];
  });
}

async function readTruthArchive(acct: string): Promise<AlertItem[]> {
  if (acct.toLowerCase() !== "realdonaldtrump") throw new Error("archive unavailable");
  const response = await fetch("https://www.trumpstruth.org/feed", {
    headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`archive ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)]
    .slice(0, 40)
    .map((match) => match[1]);
  if (!entries.length) throw new Error("archive empty");

  return entries.flatMap((entry) => {
    const title = xmlField(entry, "title");
    const description = xmlField(entry, "description") || xmlField(entry, "content:encoded") || xmlField(entry, "summary");
    const pageLink = xmlField(entry, "link") || entry.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "";
    const combined = `${title} ${description}`;
    const originalUrl = combined
      .match(/https:\/\/truthsocial\.com\/(?:@|users\/)(?:realDonaldTrump)(?:\/statuses)?\/\d+/i)?.[0]
      ?.replace("/users/realDonaldTrump/statuses/", "/@realDonaldTrump/");
    const id = originalUrl?.match(/\/(\d+)(?:\?.*)?$/)?.[1];
    const url = originalUrl || (id ? `https://truthsocial.com/@realDonaldTrump/${id}` : pageLink);
    if (!url) return [];
    const text = stripHtml(description || title)
      .replace(/^Donald J\. Trump:\s*["“]?/i, "")
      .replace(/["”]\s*$/, "")
      .replace(/^RT:\s*https:\/\/truthsocial\.com\/\S+\s*/i, "")
      .trim();
    const item = socialItem({
      text,
      url,
      source: "Truth Social · @realDonaldTrump · President Donald Trump",
      publishedAt: xmlField(entry, "pubDate") || xmlField(entry, "published") || xmlField(entry, "updated"),
      side: "us",
      verifiedAuthor: true,
      directPost: true,
    });
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
  if (!figure.username) return [];
  const userRes = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(figure.username)}`, {
    headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.3" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!userRes.ok) throw new Error(`X @${figure.username}: user ${userRes.status}`);
  const user = (await userRes.json() as { data?: XUser }).data;
  if (!user) throw new Error(`X @${figure.username}: user missing`);
  const postsRes = await fetch(`https://api.x.com/2/users/${user.id}/tweets?max_results=20&exclude=replies,retweets&tweet.fields=created_at`, {
    headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.3" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!postsRes.ok) throw new Error(`X @${figure.username}: posts ${postsRes.status}`);
  const posts = (await postsRes.json() as { data?: XPost[] }).data || [];
  return posts.flatMap((post) => {
    const item = socialItem({
      text: post.text,
      url: `https://x.com/${figure.username}/status/${post.id}`,
      source: `X · @${figure.username} · ${figure.label}`,
      publishedAt: post.created_at,
      side: figure.side,
      verifiedAuthor: true,
      directPost: true,
    });
    return item ? [item] : [];
  });
}

async function readIndexedFigurePosts(figure: PublicFigure): Promise<AlertItem[]> {
  const identity = figure.searchTerms.map((term) => `"${term}"`).join(" OR ");
  const siteClauses = [
    ...(figure.username ? [`site:x.com/${figure.username}`, `site:twitter.com/${figure.username}`] : []),
    ...(figure.officialDomains || []).map((domain) => `site:${domain}`),
  ];
  const query = `(${siteClauses.join(" OR ")}) (${identity}) ${japanTopics} when:14d`;
  return readGoogleNews(query, `公開検索 · ${figure.label}`, figure.side, 20, {
    allowedDomains: ["x.com", "twitter.com", ...(figure.officialDomains || [])],
    identityTerms: [figure.username || "", ...figure.searchTerms].filter(Boolean),
    maxAgeDays: 14,
    expectedUsername: figure.username,
    directSource: figure.username ? `X · @${figure.username} · ${figure.label}` : undefined,
  });
}

async function readIndexedSweep(sweep: IndexedSweep): Promise<AlertItem[]> {
  const sites = sweep.domains.map((domain) => `site:${domain}`).join(" OR ");
  const query = `(${sites}) ${sweep.identity} ${sweep.topics} when:${sweep.days || 14}d`;
  return readGoogleNews(query, sweep.source, sweep.side, 50, {
    allowedDomains: sweep.domains,
    identityTerms: sweep.identityTerms,
    maxAgeDays: sweep.days || 14,
  });
}

export type IndexedOptions = {
  allowedDomains: string[];
  identityTerms?: string[];
  maxAgeDays: number;
  expectedUsername?: string;
  directSource?: string;
};

export function isExpectedIndexedSource(
  text: string,
  publisherUrl: string,
  options: IndexedOptions,
) {
  const host = safeHost(publisherUrl);
  const allowed = options.allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!allowed) return false;
  if (!isSocialHost(host)) return true;
  return Boolean(options.identityTerms?.some((term) => term && phrasePattern(term).test(text)));
}

export function isWithinDays(value: string, days: number, now = Date.now()) {
  const published = new Date(value).getTime();
  return Number.isFinite(published)
    && published <= now + 5 * 60 * 1_000
    && published >= now - days * 24 * 60 * 60 * 1_000;
}

export function isExpectedXAccountUrl(value: string, username: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!isSocialHost(host)) return false;
    const [account, route, id] = url.pathname.split("/").filter(Boolean);
    return account?.toLowerCase() === username.toLowerCase()
      && route === "status"
      && /^\d+$/.test(id || "");
  } catch {
    return false;
  }
}

async function resolveGoogleNewsUrl(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { return value; }
  if (url.hostname !== "news.google.com" || !/\/(?:rss\/)?articles\//.test(url.pathname)) return value;

  const page = await fetch(value, {
    headers: browserHeaders,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!page.ok) throw new Error(`Google News decode page ${page.status}`);
  const html = await page.text();
  const id = html.match(/data-n-a-id=["']([^"']+)/i)?.[1];
  const timestamp = html.match(/data-n-a-ts=["'](\d+)/i)?.[1];
  const signature = html.match(/data-n-a-sg=["']([^"']+)/i)?.[1];
  if (!id || !timestamp || !signature) throw new Error("Google News decode parameters missing");

  const request = [
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
    ],
    id,
    Number(timestamp),
    signature,
  ];
  const body = new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(request), null, "generic"]]]),
  });
  const decoded = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      referer: "https://news.google.com/",
      "user-agent": browserHeaders["user-agent"],
    },
    body,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!decoded.ok) throw new Error(`Google News decode ${decoded.status}`);
  const responseText = await decoded.text();
  const jsonStart = responseText.indexOf("[[");
  if (jsonStart < 0) throw new Error("Google News decode response malformed");
  const rows = JSON.parse(responseText.slice(jsonStart)) as unknown[][];
  const payload = rows.find((row) => row[0] === "wrb.fr" && row[1] === "Fbv4je")?.[2];
  if (typeof payload !== "string") throw new Error("Google News decode result missing");
  const result = JSON.parse(payload) as unknown[];
  if (result[0] !== "garturlres" || typeof result[1] !== "string") throw new Error("Google News decode URL missing");
  return result[1];
}

async function readGoogleNews(
  query: string,
  source: string,
  side: "jp" | "us",
  limit: number,
  options: IndexedOptions,
): Promise<AlertItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, { headers: browserHeaders, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`indexed ${response.status}`);
  const xml = await response.text();
  const entries = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, limit).map((m) => m[1]);
  const items: AlertItem[] = [];
  let xCandidatesChecked = 0;
  for (const entry of entries) {
    const title = stripHtml(xmlField(entry, "title"));
    const link = xmlField(entry, "link");
    const description = stripHtml(xmlField(entry, "description"));
    const publisherUrl = xmlAttribute(entry, "source", "url");
    const publishedAt = xmlField(entry, "pubDate");
    const combined = `${title}. ${description}`;
    if (!title || !link) continue;
    if (!isWithinDays(publishedAt, options.maxAgeDays)) continue;

    const publisherHost = safeHost(publisherUrl);
    let itemUrl = link;
    let itemSource = source;
    let verifiedAuthor = !isSocialHost(publisherHost);
    let directPost = false;

    if (isSocialHost(publisherHost) && options.expectedUsername) {
      if (xCandidatesChecked >= 6) continue;
      xCandidatesChecked += 1;
      try { itemUrl = await resolveGoogleNewsUrl(link); }
      catch { continue; }
      if (!isExpectedXAccountUrl(itemUrl, options.expectedUsername)) continue;
      verifiedAuthor = true;
      directPost = true;
      itemSource = options.directSource || `X · @${options.expectedUsername}`;
    } else if (!isExpectedIndexedSource(combined, publisherUrl, options)) {
      continue;
    }

    const item = socialItem({
      text: combined,
      url: itemUrl,
      source: verifiedAuthor ? itemSource : "公開検索 · X",
      publishedAt,
      side,
      verifiedAuthor,
      directPost,
    });
    if (item) items.push(item);
  }
  return items;
}

async function readJapanRemembranceSignals(): Promise<AlertItem[]> {
  const query = '(site:senate.gov OR site:house.gov OR site:whitehouse.gov OR site:state.gov OR site:defense.gov OR site:war.gov OR site:jp.usembassy.gov OR site:x.com OR site:twitter.com) (Hiroshima OR Nagasaki OR hibakusha OR "A-bomb" OR "atomic bomb" OR "atomic bombing" OR "atomic weapon" OR "nuclear weapon" OR "nuclear abolition" OR "Enola Gay" OR "Pearl Harbor" OR "Pacific War" OR "World War II" OR "V-J Day" OR "end of war" OR "unconditional surrender" OR "Japan surrender" OR 終戦 OR 原爆 OR 被爆 OR 被爆者 OR 核兵器 OR 真珠湾) (statement OR remarks OR said OR speech OR commemorates OR remembers OR anniversary OR post) when:30d';
  return readGoogleNews(query, "米政府・議会 · 日本戦争記憶関連発信 · U.S. official representative", "us", 50, {
    allowedDomains: ["senate.gov", "house.gov", "whitehouse.gov", "state.gov", "defense.gov", "war.gov", "jp.usembassy.gov", "x.com", "twitter.com"],
    identityTerms: ["U.S. Senator", "U.S. Representative", "Congressman", "Congresswoman", "Member of Congress", "White House", "President Trump", "State Department", "Department of Defense", "USAmbJapan"],
    maxAgeDays: 30,
  });
}

function xmlAttribute(xml: string, name: string, attribute: string) {
  return decodeXml(xml.match(new RegExp(`<${name}[^>]*\\s${attribute}=["']([^"']+)`, "i"))?.[1] || "").trim();
}

function safeHost(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function isSocialHost(host: string) {
  return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
}

function phrasePattern(value: string) {
  const escaped = value.replace(/^@/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:@?${escaped})(?![\\p{L}\\p{N}_])`, "iu");
}

export async function collectDirectSocial(): Promise<SocialResult> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const xFigures = publicFigures.filter((figure) => figure.username);
  const tasks: Array<{ name: string; run: () => Promise<AlertItem[]> }> = [
    ...truthAccounts.map((acct) => ({ name: `Truth Social · @${acct}`, run: () => readTruthAccount(acct) })),
    ...publicFigures.map((figure) => ({ name: `公開検索 · ${figure.label}`, run: () => readIndexedFigurePosts(figure) })),
    ...indexedSweeps.map((sweep) => ({ name: sweep.name, run: () => readIndexedSweep(sweep) })),
    { name: "日本戦争記憶関連発信", run: readJapanRemembranceSignals },
    ...(bearer ? xFigures.map((figure) => ({ name: `X · @${figure.username}`, run: () => readXAccount(figure, bearer) })) : []),
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [tasks[index].name] : []);
  const deduped = new Map<string, AlertItem>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) deduped.set(item.url, item);
  }
  return {
    items: [...deduped.values()],
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: tasks.length,
  };
}
