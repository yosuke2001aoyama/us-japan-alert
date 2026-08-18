import { mkdir, writeFile } from "node:fs/promises";

const dashboard = process.env.PUBLIC_DASHBOARD_URL || "https://us-japan-alert.vercel.app";
const response = await fetch(`${dashboard}/api/feed`, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(90_000),
  cache: "no-store",
});
if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
const feed = await response.json();
if (!Array.isArray(feed?.items)) throw new Error("Feed response is missing items[]");
await mkdir("public/data", { recursive: true });
await writeFile("public/data/feed.json", JSON.stringify(feed, null, 2) + "\n");
console.log(JSON.stringify({ collected: feed.items.length, generatedAt: feed.generatedAt }));
