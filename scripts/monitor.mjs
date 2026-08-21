import { createCipheriv, createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  articleSourceKey,
  canonicalArticleTitle,
  canonicalArticleUrl,
  isSameArticle,
} from "./article-identity.mjs";
import {
  classifyImmediateAlert,
  DEFAULT_MAX_ALERT_AGE_MS,
  STARTUP_RECOVERY_AGE_MS,
} from "./alert-eligibility.mjs";

const DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || "https://us-japan-alert.vercel.app";
const endpoint = process.env.FEED_ENDPOINT || `${DASHBOARD_URL}/api/feed`;
const STATE_PATH = "public/data/notified-events.json";
const FEED_PATH = "public/data/feed.json";
const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ALERTS_PER_SCAN = Math.max(1, Number(process.env.ALERT_MAX_PER_SCAN || 2));
const WATCH_MINUTES = Math.max(0, Number(process.env.ALERT_WATCH_MINUTES || 0));
const POLL_SECONDS = Math.max(30, Number(process.env.ALERT_POLL_SECONDS || 60));
const RESEND_API = "https://api.resend.com";
const RESEND_SEGMENT_NAME = "JPUS速報";
let scanNow = Date.now();
let segmentIdCache;
let completedScans = 0;
const observedThisRun = [];

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
  state.events = state.events.filter((event) => {
    const timestamp = Date.parse(event.notifiedAt || event.publishedAt || "");
    return Number.isFinite(timestamp) && scanNow - timestamp <= HISTORY_RETENTION_MS;
  });
  const maximumAge = completedScans === 0 ? STARTUP_RECOVERY_AGE_MS : DEFAULT_MAX_ALERT_AGE_MS;
  const novel = clusterItems(feed.items)
    .map(selectRepresentative)
    .filter((item) => !observedThisRun.some((seen) => isSameArticle(item, seen)))
    .filter((item) => !state.events.some((event) => isSameArticle(item, event)));
  const assessed = novel.map((item) => ({
    item,
    assessment: classifyImmediateAlert(item, { now: scanNow, maxAgeMs: maximumAge }),
  }));
  const actionable = assessed
    .filter(({ assessment }) => assessment.notify)
    .sort((a, b) => compareRepresentative(a.item, b.item));
  const pending = actionable.slice(0, MAX_ALERTS_PER_SCAN);
  const deferred = actionable.slice(MAX_ALERTS_PER_SCAN);
  const rejectionCounts = countBy(assessed.filter(({ assessment }) => !assessment.notify), ({ assessment }) => assessment.code);

  for (const { item, assessment } of assessed) {
    if (!assessment.notify) observedThisRun.push(item);
  }
  const recipients = resendReady() ? await listAlertRecipients() : [];
  const delivery = recipients.length ? "resend" : githubReady() ? "github" : "none";
  const delivered = [];
  let failed = 0;

  for (const { item, assessment } of pending) {
    try {
      if (delivery === "resend") await sendResendAlert(item, assessment, recipients);
      else if (delivery === "github") await createGitHubIssue(item, assessment);
      else throw new Error("No alert delivery channel configured");
      delivered.push(item);
      observedThisRun.push(item);
      state.events.push(toHistoryRecord(item, assessment));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ delivery: "failed", article: articleId(item), error: safeError(error) }));
    }
  }

  state.initialized = true;
  state.updatedAt = new Date(scanNow).toISOString();
  await writeState(state);
  completedScans += 1;
  if (observedThisRun.length > 1_400) observedThisRun.splice(0, observedThisRun.length - 1_000);
  console.log(JSON.stringify({
    collected: feed.items.length,
    novel: novel.length,
    urgent: actionable.length,
    pending: pending.length,
    deferred: deferred.length,
    alerts: delivered.length,
    recipients: recipients.length,
    delivery,
    failures: failed,
    startupRecovery: completedScans === 1,
    rejected: rejectionCounts,
  }));
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

function toHistoryRecord(item, assessment) {
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
    baseline: false,
    alertCode: assessment.code,
    alertLabel: assessment.label,
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

async function sendResendAlert(item, assessment, recipients) {
  for (const [index, recipient] of recipients.entries()) {
    const recipientKey = createHash("sha256").update(recipient.email).digest("hex").slice(0, 20);
    await resend("/emails", {
      method: "POST",
      headers: { "Idempotency-Key": `alert-${articleId(item)}-${recipientKey}` },
      body: JSON.stringify(buildAlertEmail(item, assessment, recipient)),
    });
    if (index < recipients.length - 1) await new Promise((resolve) => setTimeout(resolve, 225));
  }
}

function buildAlertEmail(item, assessment, recipient) {
  const unsubscribeToken = recipient.publicSubscriber ? sealUnsubscribeToken(recipient.email, item) : "";
  const unsubscribeUrl = unsubscribeToken ? `${DASHBOARD_URL}/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}` : "";
  const html = `<h2>${escapeHtml(item.title)}</h2><p><b>速報理由:</b> ${escapeHtml(assessment.label)}<br><b>発信元:</b> ${escapeHtml(item.source || "不明")}<br><b>公表時刻:</b> ${escapeHtml(item.publishedAt || "不明")}</p>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}<p><a href="${escapeHtml(item.url)}">原文を開く</a> · <a href="${escapeHtml(DASHBOARD_URL)}">タイムライン</a></p>${unsubscribeUrl ? `<p><a href="${escapeHtml(unsubscribeUrl)}">速報メールを解除</a></p>` : ""}`;
  const text = `${item.title}\n\n速報理由: ${assessment.label}\n発信元: ${item.source || "不明"}\n公表時刻: ${item.publishedAt || "不明"}\n\n${item.summary || ""}\n\n原文: ${item.url}\nタイムライン: ${DASHBOARD_URL}${unsubscribeUrl ? `\n解除: ${unsubscribeUrl}` : ""}`;
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

async function createGitHubIssue(item, assessment) {
  const [owner] = process.env.GITHUB_REPOSITORY.split("/");
  if (await githubIssueExists(item)) return;
  const body = [
    `## ${escapeMarkdown(item.title)}`,
    "",
    `- **速報理由:** ${escapeMarkdown(assessment.label)}`,
    `- **発信元:** ${escapeMarkdown(item.source || "不明")}`,
    `- **公表時刻:** ${escapeMarkdown(item.publishedAt || "不明")}`,
    `- **区分:** ${item.japanRelated ? "日本関連" : "重要速報"}`,
    "",
    item.summary ? escapeMarkdown(item.summary) : "",
    "",
    `[原文を開く](${item.url}) · [タイムラインを開く](${DASHBOARD_URL})`,
    "",
    `<!-- jpus-article-id:${articleId(item)} -->`,
  ].filter(Boolean).join("\n");
  const created = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ title: `【JPUS速報】${truncate(item.title, 180)}`, body, assignees: [owner] }),
  });
  if (!created.ok) throw new Error(`GitHub issue failed (${created.status})`);
}

async function githubIssueExists(item) {
  const query = new URLSearchParams({ state: "all", sort: "created", direction: "desc", per_page: "100" });
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues?${query}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub issue lookup failed (${response.status})`);
  const marker = `<!-- jpus-article-id:${articleId(item)} -->`;
  return (await response.json()).some((issue) => String(issue?.body || "").includes(marker));
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function safeError(error) { return error instanceof Error ? error.message.slice(0, 180) : "Unknown error"; }
function truncate(value, max) { const text = String(value || ""); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function escapeMarkdown(value) { return String(value).replace(/[\\`*_[\]<>]/g, "\\$&"); }
