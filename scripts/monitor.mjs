import { createCipheriv, createHash, createHmac } from "node:crypto";
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
const WATCH_MINUTES = Math.max(0, Number(process.env.ALERT_WATCH_MINUTES || 0));
const POLL_SECONDS = Math.max(30, Number(process.env.ALERT_POLL_SECONDS || 60));
const RESEND_API = "https://api.resend.com";
const RESEND_SEGMENT_NAME = "JPUS速報";
const warMemoryTrigger = /hiroshima|nagasaki|hibakusha|a-?bomb|atomic bomb(?:ing)?|atomic weapons?|nuclear weapons?|enola gay|pearl harbor|v-?j day|japan(?:ese)? surrender|広島|長崎|被爆|被爆者|原爆|核兵器|真珠湾|終戦|日本降伏/i;
const officialSpeechTrigger = /senator|representative|member of congress|statement|remarks?|speech|post(?:ed)?|米上院議員|米下院議員|米議員|声明|発言|演説|投稿/i;
const reportedObservationTrigger = /sources?|officials?|told reporters?|speaking to reporters?|interview|revealed|disclosed|expected|planning|considering|likely|関係者|政府筋|記者団|取材|インタビュー|明らかにした|述べた|語った|調整|検討|見通し|予定/i;
const highValueMoveTrigger = /summit|official visit|visit to (?:washington|tokyo|japan)|tariff|sanction|export control|resign|dismiss|currency intervention|foreign exchange|market access|summit|首脳会談|訪米|訪日|会談|協議|関税|制裁|輸出管理|為替介入|市場開放|輸入解禁|輸出解禁|辞任|解任/i;
let scanNow = Date.now();
let segmentIdCache;

if (!endpoint.startsWith("http")) throw new Error("Set FEED_ENDPOINT or PUBLIC_DASHBOARD_URL");

await mkdir("public/data", { recursive: true });
const startedAt = Date.now();
do {
  try {
    await runScan();
  } catch (error) {
    console.error(JSON.stringify({ scan: "failed", error: safeError(error) }));
  }
  if (!WATCH_MINUTES || Date.now() - startedAt >= WATCH_MINUTES * 60_000) break;
  await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1_000));
} while (true);

async function runScan() {
  scanNow = Date.now();
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
  const feed = await response.json();
  if (!Array.isArray(feed?.items)) throw new Error("Feed response is missing items[]");
  await writeFile(FEED_PATH, JSON.stringify(feed, null, 2) + "\n");

  const state = await readState();
  const eligible = feed.items.filter(isFreshBreakingItem).sort(compareRepresentative);
  const clusters = clusterItems(eligible);

  if (!state.initialized) {
    state.initialized = true;
    state.events = clusters.map((cluster) => toHistoryRecord(selectRepresentative(cluster), true));
    state.updatedAt = new Date(scanNow).toISOString();
    await writeState(state);
    console.log(JSON.stringify({ collected: feed.items.length, eligible: eligible.length, alerts: 0, bootstrap: true }));
    return;
  }

  state.events = state.events.filter((event) => {
    const timestamp = Date.parse(event.notifiedAt || event.publishedAt || "");
    return Number.isFinite(timestamp) && scanNow - timestamp <= HISTORY_RETENTION_MS;
  });
  const pending = clusters
    .map(selectRepresentative)
    .filter((item) => !state.events.some((event) => isSameArticle(item, event)));
  const recipients = resendReady() ? await listAlertRecipients() : [];
  const delivery = recipients.length ? "resend" : githubReady() ? "github" : "none";
  const delivered = [];
  let failed = 0;

  for (const item of pending) {
    try {
      if (delivery === "resend") await sendResendAlert(item, recipients);
      else if (delivery === "github") await createGitHubIssue(item);
      else throw new Error("No alert delivery channel configured");
      delivered.push(item);
      state.events.push(toHistoryRecord(item, false));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ delivery: "failed", article: articleId(item), error: safeError(error) }));
    }
  }

  state.updatedAt = new Date(scanNow).toISOString();
  await writeState(state);
  console.log(JSON.stringify({
    collected: feed.items.length,
    eligible: eligible.length,
    events: clusters.length,
    pending: pending.length,
    alerts: delivered.length,
    recipients: recipients.length,
    delivery,
    failures: failed,
  }));
}

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
  const age = scanNow - published;
  return age >= -10 * 60 * 1_000 && age <= MAX_ALERT_AGE_MS;
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

function selectRepresentative(cluster) { return [...cluster].sort(compareRepresentative)[0]; }
function compareRepresentative(a, b) {
  return Number(Boolean(b.official)) - Number(Boolean(a.official))
    || Number(b.priority || 0) - Number(a.priority || 0)
    || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
}

function articleId(item) {
  return createHash("sha256").update(canonicalArticleUrl(item.url) || `${articleSourceKey(item)}|${canonicalArticleTitle(item.title)}`).digest("hex").slice(0, 24);
}

function toHistoryRecord(item, baseline) {
  const articleUrlKey = canonicalArticleUrl(item.url);
  const articleTitleKey = canonicalArticleTitle(item.title);
  const sourceKey = articleSourceKey(item);
  return {
    id: articleId(item),
    title: item.title,
    url: item.url,
    source: item.source || "",
    category: item.category || "",
    priority: Number(item.priority || 0),
    publishedAt: item.publishedAt,
    notifiedAt: new Date(scanNow).toISOString(),
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

function resendReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}
function githubReady() { return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY); }

async function resend(path, init = {}) {
  const response = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Email provider request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

async function alertSegmentId() {
  if (process.env.RESEND_ALERT_SEGMENT_ID) return process.env.RESEND_ALERT_SEGMENT_ID;
  if (segmentIdCache !== undefined) return segmentIdCache;
  const result = await resend("/segments?limit=100");
  segmentIdCache = result?.data?.find((segment) => segment.name === RESEND_SEGMENT_NAME)?.id || null;
  return segmentIdCache;
}

async function listAlertRecipients() {
  const direct = String(process.env.ALERT_TO_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email, publicSubscriber: false }));
  let segmentId = null;
  try {
    segmentId = await alertSegmentId();
  } catch (error) {
    console.error(JSON.stringify({ subscribers: "unavailable", error: safeError(error) }));
    if (!direct.length) throw error;
  }
  const subscribers = [];
  let after = "";
  while (segmentId) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const page = await resend(`/segments/${segmentId}/contacts?${query}`);
    const contacts = Array.isArray(page?.data) ? page.data : [];
    subscribers.push(...contacts
      .filter((contact) => contact.email && !contact.unsubscribed)
      .map((contact) => ({ email: String(contact.email).trim().toLowerCase(), publicSubscriber: true })));
    if (!page?.has_more || !contacts.length) break;
    after = contacts.at(-1)?.id || "";
    if (!after) break;
  }
  const unique = new Map();
  for (const recipient of [...subscribers, ...direct]) unique.set(recipient.email, recipient);
  return [...unique.values()];
}

async function sendResendAlert(item, recipients) {
  for (const [index, recipient] of recipients.entries()) {
    const recipientKey = createHash("sha256").update(recipient.email).digest("hex").slice(0, 20);
    await resend("/emails", {
      method: "POST",
      headers: { "Idempotency-Key": `alert-${articleId(item)}-${recipientKey}` },
      body: JSON.stringify(buildAlertEmail(item, recipient)),
    });
    if (index < recipients.length - 1) await new Promise((resolve) => setTimeout(resolve, 225));
  }
}

function buildAlertEmail(item, recipient) {
  const unsubscribeToken = recipient.publicSubscriber ? sealUnsubscribeToken(recipient.email, item) : "";
  const unsubscribeUrl = unsubscribeToken ? `${DASHBOARD_URL}/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` : "";
  const html = `<h2>${escapeHtml(item.title)}</h2><p><b>重要度:</b> ${Number(item.priority || 0)}<br><b>発信元:</b> ${escapeHtml(item.source || "不明")}<br><b>公表時刻:</b> ${escapeHtml(item.publishedAt || "不明")}</p>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}<p><a href="${escapeHtml(item.url)}">原文を開く</a> · <a href="${escapeHtml(DASHBOARD_URL)}">タイムライン</a></p>${unsubscribeUrl ? `<p><a href="${escapeHtml(unsubscribeUrl)}">速報メールを解除</a></p>` : ""}`;
  const text = `${item.title}\n\n重要度: ${Number(item.priority || 0)}\n発信元: ${item.source || "不明"}\n公表時刻: ${item.publishedAt || "不明"}\n\n${item.summary || ""}\n\n原文: ${item.url}\nタイムライン: ${DASHBOARD_URL}${unsubscribeUrl ? `\n解除: ${unsubscribeUrl}` : ""}`;
  return {
    from: process.env.ALERT_FROM_EMAIL,
    to: [recipient.email],
    subject: `【JPUS速報】${truncate(item.title, 150)}`,
    html,
    text,
    ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
  };
}

function sealUnsubscribeToken(email, item) {
  const secret = process.env.ALERT_SIGNING_SECRET || process.env.RESEND_API_KEY || "";
  if (secret.length < 32) throw new Error("ALERT_SIGNING_SECRET is required for public subscribers");
  const key = createHmac("sha256", secret).update("jpus-alert-token-v1").digest();
  const event = articleId(item);
  const exp = Math.floor(Date.parse(item.publishedAt) / 1_000) + 400 * 24 * 60 * 60;
  const iv = createHmac("sha256", key).update(`unsubscribe|${email}|${event}|${exp}`).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify({ email, purpose: "unsubscribe", exp, event }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
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
    `[原文を開く](${item.url}) · [タイムラインを開く](${DASHBOARD_URL})`,
  ].filter(Boolean).join("\n");
  const created = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ title: `【JPUS速報】${truncate(item.title, 180)}`, body, assignees: [owner] }),
  });
  if (!created.ok) throw new Error(`GitHub issue failed (${created.status})`);
}

function safeError(error) { return error instanceof Error ? error.message.slice(0, 180) : "Unknown error"; }
function truncate(value, max) { const text = String(value || ""); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeMarkdown(value) { return String(value).replace(/[\\`*_[\]<>]/g, "\\$&"); }
