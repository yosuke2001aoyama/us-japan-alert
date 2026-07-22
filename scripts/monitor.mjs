import { mkdir, readFile, writeFile } from "node:fs/promises";

const endpoint = process.env.FEED_ENDPOINT || `${process.env.PUBLIC_DASHBOARD_URL || ""}/api/feed`;
if (!endpoint.startsWith("http")) throw new Error("Set FEED_ENDPOINT or PUBLIC_DASHBOARD_URL");
const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
const feed = await response.json();
await mkdir("public/data", { recursive: true });
let previous = { items: [] };
try { previous = JSON.parse(await readFile("public/data/feed.json", "utf8")); } catch {}
const seen = new Set(previous.items.map((item) => item.url));
const alerts = feed.items.filter((item) => !seen.has(item.url) && (item.japanRelated || item.priority >= 80));
await writeFile("public/data/feed.json", JSON.stringify(feed, null, 2) + "\n");

if (alerts.length && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  const [owner] = process.env.GITHUB_REPOSITORY.split("/");
  const body = alerts.slice(0, 20).map((item) => `- **[${item.priority}] [${escapeMarkdown(item.title)}](${item.url})**\n  ${escapeMarkdown(item.source)} · ${item.japanRelated ? "日本関連" : "重要速報"}`).join("\n");
  const created = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ title: `【JPUS Alert】重要新着 ${alerts.length}件`, body: `${body}\n\n---\n自動収集された速報です。政策判断には原文をご確認ください。`, assignees: [owner] }),
  });
  if (!created.ok) throw new Error(`GitHub issue failed: ${created.status} ${await created.text()}`);
}

if (alerts.length && process.env.RESEND_API_KEY && process.env.ALERT_TO_EMAIL && process.env.ALERT_FROM_EMAIL) {
  const html = `<h2>JPUS Alert — 新着 ${alerts.length}件</h2>${alerts.slice(0, 20).map((item) => `<p><b>[${item.priority}] ${escapeHtml(item.title)}</b><br>${escapeHtml(item.source)} · ${item.japanRelated ? "日本関連" : "重要速報"}<br><a href="${escapeHtml(item.url)}">原文を開く</a></p>`).join("")}`;
  const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [process.env.ALERT_TO_EMAIL], subject: `【JPUS Alert】新着 ${alerts.length}件`, html }) });
  if (!sent.ok) throw new Error(`Email failed: ${sent.status} ${await sent.text()}`);
}
console.log(JSON.stringify({ collected: feed.items.length, alerts: alerts.length }));
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function escapeMarkdown(value) { return String(value).replace(/[\\`*_[\]<>]/g, "\\$&"); }
