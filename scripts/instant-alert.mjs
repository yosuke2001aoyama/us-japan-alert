const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const feedUrl = process.env.JPUS_FEED_URL || "https://us-japan-alert.vercel.app/api/feed";

if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");

const now = Date.now();
const maxAgeMs = 20 * 60 * 1000;
const hardTrigger = /tariff|関税|sanction|制裁|export control|輸出規制|military strike|missile|nuclear|核|ミサイル|攻撃|首脳会談|summit|emergency|緊急|辞任|解任|resign|dismiss|truth social|公式sns/i;
const anomalyTrigger = /reports?|sources?|関係者|政府筋|観測|調整|検討|見通し|unexpected|surprise|abrupt|突然|異例|おかしな|unconfirmed/i;

const headers = {
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "jpus-alert-instant-dispatcher",
};

const feedResponse = await fetch(`${feedUrl}?instant=${now}`, { cache: "no-store" });
if (!feedResponse.ok) throw new Error(`feed ${feedResponse.status}`);
const feed = await feedResponse.json();

const candidates = (feed.items || []).filter((item) => {
  const age = now - new Date(item.publishedAt).getTime();
  if (!Number.isFinite(age) || age < -5 * 60 * 1000 || age > maxAgeMs) return false;
  const text = `${item.title} ${item.summary || ""}`;
  const critical = item.priority >= 90;
  const policyShock = item.priority >= 82 && hardTrigger.test(text);
  const anomalousReport = !item.official && item.priority >= 84 && anomalyTrigger.test(text) && hardTrigger.test(text);
  return critical || policyShock || anomalousReport;
});

if (!candidates.length) {
  console.log("No instant alerts.");
  process.exit(0);
}

const issuesResponse = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`, { headers });
if (!issuesResponse.ok) throw new Error(`issues ${issuesResponse.status}`);
const issues = await issuesResponse.json();
const existingText = issues.map((issue) => `${issue.title}\n${issue.body || ""}`).join("\n");

const fresh = candidates.filter((item) => !existingText.includes(item.url));
if (!fresh.length) {
  console.log("All instant alerts already dispatched.");
  process.exit(0);
}

for (const item of fresh.slice(0, 5)) {
  const title = `【JPUS緊急速報】${String(item.title).slice(0, 180)}`;
  const body = [
    `**重要度 ${item.priority}｜${item.verificationLabel || (item.official ? "一次情報" : "報道")}**`,
    "",
    `- 発信元: ${item.source}`,
    `- 公開時刻: ${item.publishedAt}`,
    `- 分類: ${item.category}`,
    `- 日本関連: ${item.japanRelated ? "はい" : "いいえ"}`,
    "",
    item.summary ? `> ${String(item.summary).replace(/\s+/g, " ").slice(0, 600)}` : "",
    "",
    `[原文を確認](${item.url})`,
    "",
    "---",
    "通常の定期配信を待たず、重大な政策変更・公式発表・異例報道として即時通知しました。",
  ].filter(Boolean).join("\n");

  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ title, body, assignees: [repo.split("/")[0]] }),
  });
  if (!response.ok) throw new Error(`create issue ${response.status}: ${await response.text()}`);
  console.log(`Dispatched: ${item.title}`);
}
