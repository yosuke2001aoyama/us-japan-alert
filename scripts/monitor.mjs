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
// The first run establishes the baseline instead of notifying every historical item.
const isBootstrap = !Array.isArray(previous.items) || previous.items.length === 0;
const alerts = isBootstrap ? [] : feed.items.filter((item) => !seen.has(item.url) && (item.japanRelated || item.priority >= 80));
await writeFile("public/data/feed.json", JSON.stringify(feed, null, 2) + "\n");

if (alerts.length && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  const rows = alerts.slice(0, 20).map((item) =>
    `- **[${item.priority}] [${escapeMarkdown(item.title)}](${item.url})**\n  ${escapeMarkdown(item.source)} · ${item.japanRelated ? "日本関連" : "重要速報"}`
  ).join("\n");
  const extra = alerts.length > 20 ? `\n\nほか ${alerts.length - 20}件。ダッシュボードで確認してください。` : "";
  const body = `JPUS Alertが新着の重要案件を検知しました。\n\n${rows}${extra}\n\n[公開ダッシュボードを開く](${process.env.PUBLIC_DASHBOARD_URL || "https://jpus-alert.yosuke2001aoyama.chatgpt.site"})`;
  const issue = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      title: `【JPUS Alert】重要速報 ${alerts.length}件`,
      body,
      assignees: process.env.ALERT_ASSIGNEE ? [process.env.ALERT_ASSIGNEE] : [],
    }),
  });
  if (!issue.ok) throw new Error(`GitHub notification failed: ${issue.status} ${await issue.text()}`);
}
console.log(JSON.stringify({ collected: feed.items.length, alerts: alerts.length, bootstrap: isBootstrap }));
function escapeMarkdown(value) { return String(value).replace(/[\\`*_[\]<>]/g, "\\$&"); }
