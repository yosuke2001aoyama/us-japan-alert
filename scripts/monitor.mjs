import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DASHBOARD_URL = process.env.PUBLIC_DASHBOARD_URL || "https://us-japan-alert.vercel.app";
const endpoint = process.env.FEED_ENDPOINT || `${DASHBOARD_URL}/api/feed`;
const STATE_PATH = "public/data/notified-events.json";
const FEED_PATH = "public/data/feed.json";
const MAX_ALERT_AGE_MS = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 72 * 60 * 60 * 1000;
const MIN_PRIORITY = Number(process.env.ALERT_MIN_PRIORITY || 90);

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
  .filter((item) => !state.events.some((event) => isSameEvent(item, event)));

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
  if (!item || Number(item.priority) < MIN_PRIORITY) return false;
  const published = Date.parse(item.publishedAt || "");
  if (!Number.isFinite(published)) return false;
  const age = now - published;
  return age >= -10 * 60 * 1000 && age <= MAX_ALERT_AGE_MS;
}

function clusterItems(items) {
  const clusters = [];
  for (const item of items) {
    const match = clusters.find((cluster) => cluster.some((candidate) => isSameEvent(item, candidate)));
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

function isSameEvent(left, right) {
  const leftPublished = Date.parse(left.publishedAt || left.notifiedAt || "");
  const rightPublished = Date.parse(right.publishedAt || right.notifiedAt || "");
  if (!Number.isFinite(leftPublished) || !Number.isFinite(rightPublished)) return false;
  if (Math.abs(leftPublished - rightPublished) > DUPLICATE_WINDOW_MS) return false;

  const leftStage = eventStage(`${left.title || ""} ${left.summary || ""}`);
  const rightStage = right.stage || eventStage(`${right.title || ""} ${right.summary || ""}`);
  if (leftStage && rightStage && leftStage !== rightStage) return false;

  const leftCanonical = canonicalText(`${left.title || ""} ${left.summary || ""}`);
  const rightCanonical = right.canonical || canonicalText(`${right.title || ""} ${right.summary || ""}`);
  if (leftCanonical && leftCanonical === rightCanonical) return true;

  const leftTokens = tokenSet(leftCanonical);
  const rightTokens = new Set(Array.isArray(right.tokens) ? right.tokens : tokenSet(rightCanonical));
  if (!leftTokens.size || !rightTokens.size) return false;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const sameCategory = Boolean(left.category && right.category && left.category === right.category);

  return containment >= 0.78
    || (containment >= 0.66 && jaccard >= 0.46 && sameCategory)
    || (jaccard >= 0.58 && sameCategory);
}

function canonicalText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(?:reuters|associated press|ap news|bloomberg|cnn|fox news|nhk|共同通信|時事通信)\b/gi, " ")
    .replace(/\b(?:breaking|exclusive|update|live|速報|詳報|更新)\b/gi, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "from", "at", "as", "is", "are", "was", "were", "be", "has", "have", "had",
    "says", "said", "statement", "remarks", "press", "release", "official", "officials", "secretary", "senator", "representative", "president", "minister", "department",
    "japan", "japanese", "united", "states", "u", "s", "日米", "日本", "米国", "発表", "声明", "会見", "について", "による", "との", "および",
  ]);
  const tokens = new Set();
  for (const token of String(value || "").match(/[a-z0-9][a-z0-9'-]{1,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}/gu) || []) {
    if (/^[a-z0-9]/.test(token)) {
      if (token.length > 2 && !stop.has(token)) tokens.add(token);
      continue;
    }
    const compact = token.replace(/(?:について|による|として|および|または|発表|声明|会見|日本|米国|日米)/g, "");
    if (compact.length <= 6) {
      if (compact.length >= 2 && !stop.has(compact)) tokens.add(compact);
      continue;
    }
    for (let index = 0; index <= compact.length - 3; index += 1) tokens.add(compact.slice(index, index + 3));
  }
  return tokens;
}

function eventStage(value) {
  const text = String(value || "").normalize("NFKC").toLowerCase();
  const stages = [
    ["proposal", /\b(?:plan|plans|planning|consider|considering|proposal|propose|scheduled|expected|may|could)\b|調整|検討|予定|見通し|提案/],
    ["meeting", /\b(?:meet|meets|meeting|met|talks|held talks|visit|visited)\b|会談|協議|訪問|面会/],
    ["agreement", /\b(?:agree|agreed|agreement|deal|announce|announced|sign|signed|finalize|finalized)\b|合意|妥結|署名|決定|発表/],
    ["action", /\b(?:impose|imposed|launch|launched|order|ordered|approve|approved|enact|enacted|pass|passed)\b|発動|実施|命令|承認|成立|可決/],
    ["response", /\b(?:condemn|condemned|welcome|welcomed|mourn|mourns|tribute|commemorate|commemorates|response|support)\b|非難|歓迎|哀悼|追悼|慰霊|支援|お見舞い/],
  ];
  return stages.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

function toHistoryRecord(item, baseline) {
  const canonical = canonicalText(`${item.title || ""} ${item.summary || ""}`);
  const notifiedAt = new Date(now).toISOString();
  return {
    id: createHash("sha256").update(`${canonical}|${item.publishedAt || notifiedAt}`).digest("hex").slice(0, 24),
    title: item.title,
    url: item.url,
    category: item.category || "",
    priority: Number(item.priority || 0),
    publishedAt: item.publishedAt,
    notifiedAt,
    baseline,
    stage: eventStage(`${item.title || ""} ${item.summary || ""}`),
    canonical,
    tokens: [...tokenSet(canonical)].slice(0, 80),
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
    "1イベントにつき1回だけ送信する自動速報です。24時間を超えた情報は通知対象外です。政策判断には原文をご確認ください。",
  ].filter(Boolean).join("\n");
  const created = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ title: `【JPUS速報】${truncate(item.title, 180)}`, body, assignees: [owner] }),
  });
  if (!created.ok) throw new Error(`GitHub issue failed: ${created.status} ${await created.text()}`);
}

async function sendResendAlert(item) {
  const html = `<h2>${escapeHtml(item.title)}</h2><p><b>重要度:</b> ${Number(item.priority || 0)}<br><b>発信元:</b> ${escapeHtml(item.source || "不明")}<br><b>公表時刻:</b> ${escapeHtml(item.publishedAt || "不明")}</p>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}<p><a href="${escapeHtml(item.url)}">原文を開く</a> · <a href="${escapeHtml(DASHBOARD_URL)}">公開ダッシュボード</a></p><hr><p>1イベントにつき1回だけ送信する自動速報です。24時間を超えた情報は通知対象外です。</p>`;
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
