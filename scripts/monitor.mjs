import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  articleSourceKey,
  canonicalArticleTitle,
  canonicalArticleUrl,
  isSameArticle,
} from "./article-identity.mjs";

const DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || "https://us-japan-alert.vercel.app";
const endpoint = process.env.FEED_ENDPOINT || `${DASHBOARD_URL}/api/feed`;
const STATE_PATH = "public/data/notified-events.json";
const FEED_PATH = "public/data/feed.json";
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_PRIORITY = Number(process.env.ALERT_MIN_PRIORITY || 90);
const EARLY_SIGNAL_PRIORITY = Number(process.env.ALERT_EARLY_SIGNAL_PRIORITY || 82);
const warMemoryTrigger = /hiroshima|nagasaki|hibakusha|a-?bomb|atomic bomb(?:ing)?|atomic weapons?|nuclear weapons?|enola gay|pearl harbor|v-?j day|japan(?:ese)? surrender|広島|長崎|被爆|被爆者|原爆|核兵器|真珠湾|終戦|日本降伏/i;
const officialSpeechTrigger = /senator|representative|member of congress|statement|remarks?|speech|post(?:ed)?|米上院議員|米下院議員|米議員|声明|発言|演説|投稿/i;
const reportedObservationTrigger = /sources?|officials?|told reporters?|speaking to reporters?|interview|revealed|disclosed|expected|planning|considering|likely|関係者|政府筋|記者団|取材|インタビュー|明らかにした|述べた|語った|調整|検討|見通し|予定/i;
const highValueMoveTrigger = /summit|official visit|visit to (?:washington|tokyo|japan)|tariff|sanction|export control|resign|dismiss|首脳会談|訪米|訪日|会談|協議|関税|制裁|輸出管理|辞任|解任/i;

if (!endpoint.startsWith("http")) throw new Error("Set FEED_ENDPOINT or PUBLIC_DASHBOARD_URL");

const response = await fetch(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
const feed = await response.json();
if (!Array.isArray(feed?.items)) throw new Error("Feed response is missing items[]");

await mkdir("public/data", { recursive: true });
await writeFile(FEED_PATH, JSON.stringify(feed, null, 2) + "\n");

const now = Date.now();
const state = await readState();
const eligible = feed.items
  .filter(isFreshBreakingItem)
  .sort(compareRepresentative);
const clusters = clusterItems(eligible);

// The first stateful run establishes a clean baseline. It must not turn the current
// 24-hour feed into a burst of historical "breaking" emails.
if (!state.initialized) {
  state.initialized = true;
  state.events = clusters.map((cluster) => toHistoryRecord(selectRepresentative(cluster), true));
  state.updatedAt = new Date(now).toISOString();
  await writeState(state);
  console.log(JSON.stringify({ collected: feed.items.length, eligible: eligible.length, alerts: 0, bootstrap: true }));
  process.exit(0);
}

state.events = state.events.filter((event) => {
  const timestamp = Date.parse(event.notifiedAt || event.publishedAt || "");
  return Number.isFinite(timestamp) && now - timestamp <= HISTORY_RETENTION_MS;
});

const pending = clusters
  .map(selectRepresentative)
  .filter((item) => !state.events.some((event) => isSameArticle(item, event)));

const delivery = selectDeliveryChannel();
const delivered = [];
const failures = [];

for (const item of pending) {
  try {
    if (delivery === "resend") await sendResendAlert(item);
    else if (delivery === "github") await createGitHubIssue(item);
    else throw new Error("No alert delivery channel configured");
    delivered.push(item);
    state.events.push(toHistoryRecord(item, false));
  } catch (error) {
    failures.push({ title: item.title, error: error instanceof Error ? error.message : String(error) });
  }
}

state.updatedAt = new Date(now).toISOString();
await writeState(state);

console.log(JSON.stringify({
  collected: feed.items.length,
  eligible: eligible.length,
  events: clusters.length,
  pending: pending.length,
  alerts: delivered.length,
  delivery,
  failures,
}));

if (failures.length) throw new Error(`Alert delivery failed for ${failures.length} event(s)`);

function isFreshBreakingItem(item) {
  if (!item) return false;
  const priority = Number(item.priority);
  const text = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`;
  const earlyWarMemorySignal = priority >= EARLY_SIGNAL_PRIORITY
    && warMemoryTrigger.test(text)
    && officialSpeechTrigger.test(text)
    && (item.official || item.socialPost);
  const earlyReportedObservation = priority >= EARLY_SIGNAL_PRIORITY
    && !item.official
    && reportedObservationTrigger.test(text)
    && highValueMoveTrigger.test(text);
  if (priority < MIN_PRIORITY && !earlyWarMemorySignal && !earlyReportedObservation) return false;
  const published = Date.parse(item.publishedAt || "");
  if (!Number.isFinite(published)) return false;
  const age = now - published;
  return age >= -10 * 60 * 1000 && age <= MAX_ALERT_AGE_MS;
}

function clusterItems(items) {
  const clusters = [];
  for (const item of items) {
    const match = clusters.find((cluster) => cluster.some((candidate) => isSameArticle(item, candidate)));
    if (match) match.push(item);
    else clusters.push([item]);
  }
  return clusters;
}

function selectRepresentative(cluster) {
  return [...cluster].sort(compareRepresentative)[0];
}

function compareRepresentative(a, b) {
  return Number(Boolean(b.official)) - Number(Boolean(a.official))
    || Number(b.priority || 0) - Number(a.priority || 0)
    || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
}

function toHistoryRecord(item, baseline) {
  const notifiedAt = new Date(now).toISOString();
  const articleUrlKey = canonicalArticleUrl(item.url);
  const articleTitleKey = canonicalArticleTitle(item.title);
  const sourceKey = articleSourceKey(item);
  return {
    id: createHash("sha256").update(articleUrlKey || `${sourceKey}|${articleTitleKey}`).digest("hex").slice(0, 24),
    title: item.title,
    url: item.url,
    source: item.source || "",
    category: item.category || "",
    priority: Number(item.priority || 0),
    publishedAt: item.publishedAt,
    notifiedAt,
    baseline,
    articleUrlKey,
    articleTitleKey,
    articleSourceKey: sourceKey,
  };
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return { version: 1, initialized: Boolean(parsed.initialized), updatedAt: parsed.updatedAt || null, events: Array.isArray(parsed.events) ? parsed.events : [] };
  } catch {
    return { version: 1, initialized: false, updatedAt: null, events: [] };
  }
}

async function writeState(state) {
  await writeFile(STATE_PATH, JSON.stringify({ version: 1, initialized: state.initialized, updatedAt: state.updatedAt, events: state.events.slice(-500) }, null, 2) + "\n");
}

function selectDeliveryChannel() {
  const resendReady = process.env.RESEND_API_KEY && process.env.ALERT_TO_EMAIL && process.env.ALERT_FROM_EMAIL;
  if (resendReady) return "resend";
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) return "github";
  return "none";
}

async function createGitHubIssue(item) {
  const [owner] = process.env.GITHUB_REPOSITORY.split("/");
  const body = [
    `## ${escapeMarkdown(item.title)}`,
    "",
    `- **重要度:** ${Number(item.priority || 0)}`,
    `- **発信元:** ${escapeMarkdown(item.source || "不明")}`,
    `- **公表時刻:** ${escapeMarkdown(item.publishedAt || "不明")}`,
    `- **区分:** ${item.japanRelated ? "日本関連" : "重要速報"}`,
    "",
    item.summary ? escapeMarkdown(item.summary) : "",
    "",
    `[原文を開く](${item.url}) · [公開ダッシュボードを開く](${DASHBOARD_URL})`,
    "",
    "---",
    "同じ記事の再通知は行いません。24時間を超えた情報は通知対象外です。政策判断には原文をご確認ください。",
  ].filter(Boolean).join("\n");
  const created = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ title: `【JPUS速報】${truncate(item.title, 180)}`, body, assignees: [owner] }),
  });
  if (!created.ok) throw new Error(`GitHub issue failed: ${created.status} ${await created.text()}`);
}

async function sendResendAlert(item) {
  const html = `<h2>${escapeHtml(item.title)}</h2><p><b>重要度:</b> ${Number(item.priority || 0)}<br><b>発信元:</b> ${escapeHtml(item.source || "不明")}<br><b>公表時刻:</b> ${escapeHtml(item.publishedAt || "不明")}</p>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}<p><a href="${escapeHtml(item.url)}">原文を開く</a> · <a href="${escapeHtml(DASHBOARD_URL)}">公開ダッシュボード</a></p><hr><p>同じ記事の再通知は行いません。24時間を超えた情報は通知対象外です。</p>`;
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [process.env.ALERT_TO_EMAIL], subject: `【JPUS速報】${truncate(item.title, 150)}`, html }),
  });
  if (!sent.ok) throw new Error(`Email failed: ${sent.status} ${await sent.text()}`);
}

function truncate(value, max) { const text = String(value || ""); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeMarkdown(value) { return String(value).replace(/[\\`*_[\]<>]/g, "\\$&"); }
