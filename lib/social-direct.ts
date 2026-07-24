import { assessPrincipalCommunication, cleanNewsTitle } from "./policy.ts";
import type { AlertItem } from "./feeds.ts";

type SocialResult = { items: AlertItem[]; ok: number; failed: number; failedNames: string[]; total: number };

type TruthAccount = { id: string; acct?: string; display_name?: string };
type TruthStatus = { id: string; created_at: string; content?: string; url?: string; reblog?: unknown; account?: TruthAccount };

type XUser = { id: string; username: string; name: string };
type XPost = { id: string; text: string; created_at?: string };

const truthAccounts = ["realDonaldTrump"];
const xAccounts = ["WhiteHouse", "POTUS", "VP", "SecRubio", "DeptofDefense", "StateDept", "USTradeRep", "USTreasury", "CommerceGov", "JPN_PMO", "MofaJapan_en", "ModJapan_en"];

const stripHtml = (value = "") => value
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#(?:x27|39);/gi, "'")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

function socialItem(args: { text: string; url: string; source: string; publishedAt?: string; side: "jp" | "us" }): AlertItem | null {
  const text = stripHtml(args.text);
  if (!text) return null;
  const assessment = assessPrincipalCommunication(text, "SNS一次投稿", true, args.side);
  if (!assessment.relevant) return null;
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

async function readTruthAccount(acct: string): Promise<AlertItem[]> {
  const lookup = await fetch(`https://truthsocial.com/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`, {
    headers: { "user-agent": "JPUS-Alert/4.0 (+official-social-monitor)" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!lookup.ok) throw new Error(`Truth Social @${acct}: lookup ${lookup.status}`);
  const account = await lookup.json() as TruthAccount;
  const statuses = await fetch(`https://truthsocial.com/api/v1/accounts/${account.id}/statuses?exclude_replies=true&exclude_reblogs=true&limit=30`, {
    headers: { "user-agent": "JPUS-Alert/4.0 (+official-social-monitor)" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!statuses.ok) throw new Error(`Truth Social @${acct}: statuses ${statuses.status}`);
  const data = await statuses.json() as TruthStatus[];
  return data.flatMap((status) => {
    if (status.reblog) return [];
    const item = socialItem({
      text: status.content || "",
      url: status.url || `https://truthsocial.com/@${acct}/${status.id}`,
      source: `Truth Social · @${account.acct || acct}`,
      publishedAt: status.created_at,
      side: "us",
    });
    return item ? [item] : [];
  });
}

async function readXAccount(username: string, bearer: string): Promise<AlertItem[]> {
  const userRes = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, {
    headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.0" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!userRes.ok) throw new Error(`X @${username}: user ${userRes.status}`);
  const user = (await userRes.json() as { data?: XUser }).data;
  if (!user) throw new Error(`X @${username}: user missing`);
  const postsRes = await fetch(`https://api.x.com/2/users/${user.id}/tweets?max_results=20&exclude=replies,retweets&tweet.fields=created_at`, {
    headers: { authorization: `Bearer ${bearer}`, "user-agent": "JPUS-Alert/4.0" },
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  if (!postsRes.ok) throw new Error(`X @${username}: posts ${postsRes.status}`);
  const posts = (await postsRes.json() as { data?: XPost[] }).data || [];
  const side = /JPN|Japan/i.test(username) ? "jp" : "us";
  return posts.flatMap((post) => {
    const item = socialItem({ text: post.text, url: `https://x.com/${username}/status/${post.id}`, source: `X · @${username}`, publishedAt: post.created_at, side });
    return item ? [item] : [];
  });
}

export async function collectDirectSocial(): Promise<SocialResult> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  const tasks: Array<{ name: string; run: () => Promise<AlertItem[]> }> = [
    ...truthAccounts.map((acct) => ({ name: `Truth Social · @${acct}`, run: () => readTruthAccount(acct) })),
    ...(bearer ? xAccounts.map((username) => ({ name: `X · @${username}`, run: () => readXAccount(username, bearer) })) : []),
  ];
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const failedNames = results.flatMap((result, index) => result.status === "rejected" ? [tasks[index].name] : []);
  return {
    items: results.flatMap((result) => result.status === "fulfilled" ? result.value : []),
    ok: results.filter((result) => result.status === "fulfilled").length,
    failed: failedNames.length,
    failedNames,
    total: tasks.length,
  };
}
