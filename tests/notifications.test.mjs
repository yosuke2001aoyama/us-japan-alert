import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyImmediateAlert,
  classifyTimelineImportance,
  STARTUP_RECOVERY_AGE_MS,
} from "../scripts/alert-eligibility.mjs";
import { isSameArticle } from "../scripts/article-identity.mjs";

const base = {
  title: "米中外相会談、首脳往来を協議",
  source: "NHK",
  url: "https://example.com/articles/123",
};

test("the same article is suppressed across repeated collection routes", () => {
  assert.equal(
    isSameArticle(base, {
      ...base,
      url: "https://example.com/articles/123?utm_source=alert",
    }),
    true,
  );
  assert.equal(
    isSameArticle(
      {
        title: "President Trump Announces New Export Controls on China",
        source: "White House · News",
        url: "https://www.whitehouse.gov/news/export-controls",
      },
      {
        title: "President Trump Announces New Export Controls on China",
        source: "The White House (.gov)",
        url: "https://news.google.com/rss/articles/white-house-copy",
      },
    ),
    true,
  );
  assert.equal(
    isSameArticle(base, {
      ...base,
      url: "https://news.google.com/rss/articles/different-route",
    }),
    true,
  );
});

test("separate publishers covering the same event remain separate alerts", () => {
  assert.equal(
    isSameArticle(base, {
      ...base,
      source: "Reuters",
      url: "https://reuters.com/world/another-story",
    }),
    false,
  );
});

const NOW = Date.parse("2026-08-21T07:05:00.000Z");
const recent = (overrides = {}) => ({
  title: "高市総理、9月の訪米を調整　トランプ大統領との会談を検討",
  summary: "政府関係者が明らかにした。",
  source: "NHKニュース",
  url: "https://example.com/new",
  publishedAt: "2026-08-21T07:01:00.000Z",
  priority: 88,
  japanRelated: true,
  official: false,
  coverage: "major-media",
  verification: "reported-observation",
  ...overrides,
});

test("immediate alerts require a new actionable fact, not a high score alone", () => {
  for (const title of [
    "外為14時 円相場、安値圏 159円台",
    "【来週の円相場】対ドル160円手前でもみ合い",
    "ジャガイモの輸入解禁を検討、何が問題か解説",
    "日米の協調介入の背景に何があった？ 日本経済を救う3つの条件とは",
    "【現役閣僚が執筆】新刊『トランプ関税 交渉の記録』発売",
  ]) {
    assert.equal(classifyImmediateAlert(recent({ title, priority: 99 }), { now: NOW }).notify, false, title);
  }
});

test("important but routine official activity stays on the timeline without an email", () => {
  assert.equal(classifyImmediateAlert(recent({
    title: "北朝鮮に関する日米韓外交当局間電話協議",
    summary: "三者は意見交換を行い、緊密に連携していくことで一致した。",
    source: "mofa.go.jp",
    official: true,
    verifiedSource: true,
    coverage: "jp-leadership",
    priority: 99,
  }), { now: NOW }).notify, false);

  assert.equal(classifyImmediateAlert(recent({
    title: "Thank you very much for your time today. We will do our best to accelerate U.S.-Japan defense cooperation.",
    summary: "",
    source: "X · @minister · Defense Minister",
    official: true,
    socialPost: true,
    verifiedSource: true,
    coverage: "principals",
    priority: 99,
  }), { now: NOW }).notify, false);
});

test("early bilateral visit and market-access reports are immediate alerts", () => {
  const visit = classifyImmediateAlert(recent(), { now: NOW });
  assert.equal(visit.notify, true);
  assert.equal(visit.code, "early-reported-signal");

  const potatoes = classifyImmediateAlert(recent({
    title: "米国産生食用ジャガイモの輸入解禁へ前進　農水省、9月にも最終工程",
    summary: "政府が手続きを最終段階に移す方針を固めた。",
    priority: 94,
  }), { now: NOW });
  assert.equal(potatoes.notify, true);
});

test("a reported Japan-US principal contact around a third-country summit is immediate", () => {
  const result = classifyImmediateAlert(recent({
    title: "高市首相、米中会談前後にトランプ氏と接触へ　米朝やICCも懸案",
    summary: "高市早苗首相は国際会議の機会にトランプ米大統領との接触を探り、日米の認識を擦り合わせる。",
    priority: 98,
  }), { now: NOW });
  assert.equal(result.notify, true);
  assert.equal(result.code, "early-reported-signal");
});

test("currency intervention action and a principal's spoken disclosure are immediate", () => {
  const action = classifyImmediateAlert(recent({
    title: "日米政府が円買いの協調介入を実施",
    summary: "財務省が実施を発表した。",
    priority: 98,
  }), { now: NOW });
  assert.equal(action.notify, true);

  const spoken = classifyImmediateAlert(recent({
    title: "トランプ大統領、機中取材で日米の為替介入を支持すると表明",
    summary: "大統領専用機内で記者団に語った発言を文字起こしした。",
    source: "機中取材・動画文字起こし",
    spokenEvent: true,
    coverage: "major-media",
    priority: 98,
  }), { now: NOW });
  assert.equal(spoken.notify, true);
  assert.equal(spoken.code, "official-statement");
});

test("verified principal social posts still alert when they contain a consequential policy statement", () => {
  const result = classifyImmediateAlert(recent({
    title: "Iran cannot have a Nuclear Weapon. We will not allow it.",
    summary: "President Donald Trump posted the statement directly.",
    source: "Truth Social · @realDonaldTrump · President Donald Trump",
    official: true,
    socialPost: true,
    verifiedSource: true,
    actorCountry: "us",
    coverage: "principals",
    priority: 95,
  }), { now: NOW });
  assert.equal(result.notify, true);
  assert.equal(result.code, "verified-principal-statement");
});

test("startup recovery never turns an old important article into a batch alert", () => {
  const result = classifyImmediateAlert(recent({
    publishedAt: "2026-08-21T06:40:00.000Z",
    title: "日米政府が円買いの協調介入を実施",
    priority: 99,
  }), { now: NOW, maxAgeMs: STARTUP_RECOVERY_AGE_MS });
  assert.equal(result.notify, false);
  assert.equal(result.code, "outside-breaking-window");
});

test("the timeline distinguishes breaking, important non-breaking, and monitoring items", () => {
  assert.equal(classifyTimelineImportance(recent({
    title: "日米政府が円買いの協調介入を実施",
    summary: "財務省が実施を発表した。",
    priority: 98,
  }), { now: NOW }).tier, "breaking");

  assert.equal(classifyTimelineImportance(recent({
    title: "日米の協調介入の背景に何があった？ 日本経済への影響を分析",
    publishedAt: "2026-08-20T07:01:00.000Z",
    priority: 98,
  }), { now: NOW }).tier, "important");

  assert.equal(classifyTimelineImportance(recent({
    title: "外為14時 円相場、安値圏 159円台",
    priority: 99,
  }), { now: NOW }).tier, "monitor");
});
