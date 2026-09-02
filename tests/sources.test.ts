import assert from "node:assert/strict";
import test from "node:test";
import { coverageGroups, sources } from "../lib/feeds.ts";
import { parseNikkeiBilateralPage } from "../lib/nikkei-bilateral-media.ts";

test("covers every required public-information lane", () => {
  const present = new Set(sources.map((source) => source.coverage));
  for (const group of coverageGroups) {
    assert.ok(present.has(group.id), `missing coverage group: ${group.id}`);
  }
});

test("includes the previously missing official-policy routes", () => {
  const names = sources.map((source) => source.name).join("\n");
  for (const expected of [
    "USTR",
    "U.S. Treasury",
    "OFAC",
    "Commerce / BIS",
    "Federal Register",
    "U.S. Congressional Committees",
    "国会",
    "INDOPACOM / USFJ",
    "U.S. 7th Fleet",
    "Trump / Vance",
    "Rubio / Hegseth",
    "高市総理 / 木原官房長官",
    "日米要人接触（第三国含む）",
    "農林水産省",
  ]) {
    assert.match(names, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("uses 44 routes and stays below the conservative Worker subrequest ceiling", () => {
  assert.equal(sources.length, 44);
  assert.ok(sources.length < 45);
});

test("parses a Japan-US contact report directly from Nikkei before news aggregators index it", () => {
  const html = `<article><a href="/article/DGXZQOUA278DK0X20C26A8000000/">高市首相、米中会談前後にトランプ氏と接触へ　米朝やICCも懸案</a><h2><a href="/article/DGXZQOUA278DK0X20C26A8000000/">高市首相、米中会談前後にトランプ氏と接触へ　米朝やICCも懸案</a></h2><time dateTime="2026-09-01T07:19:34.000Z">1日 16:19</time><div class="excerpt_test">高市早苗首相は年内の国際会議の機会にトランプ米大統領との接触を探り、日米の認識を擦り合わせる。</div></article>`;
  const items = parseNikkeiBilateralPage(html, Date.parse("2026-09-01T08:00:00.000Z"));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "高市首相、米中会談前後にトランプ氏と接触へ 米朝やICCも懸案");
  assert.equal(items[0].category, "首脳・閣僚");
  assert.ok(items[0].priority >= 80);
});
