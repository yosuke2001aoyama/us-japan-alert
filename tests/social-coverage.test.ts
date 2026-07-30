import assert from "node:assert/strict";
import test from "node:test";
import { indexedSweeps, isExpectedIndexedSource, isWithinDays, publicFigures } from "../lib/social-direct.ts";
import { assessPrincipalCommunication } from "../lib/policy.ts";

test("covers every U.S. lawmaker through official Senate and House domains", () => {
  const senate = indexedSweeps.find((sweep) => sweep.name === "全米上院議員公式サイト");
  const house = indexedSweeps.find((sweep) => sweep.name === "全米下院議員公式サイト");
  assert.deepEqual(senate?.domains, ["senate.gov"]);
  assert.deepEqual(house?.domains, ["house.gov"]);
});

test("covers Hagerty and core bilateral operators", () => {
  const corpus = JSON.stringify({ indexedSweeps, publicFigures });
  for (const expected of [
    "Bill Hagerty",
    "George Glass",
    "U.S. Mission Japan",
    "USAmbJapan",
    "Office of Japanese Affairs",
    "Samuel Paparo",
    "Stephen Jost",
    "USFJ",
    "Congressional Japan Caucus",
  ]) {
    assert.match(corpus, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("indexed social results must prove the expected author", () => {
  const embassyOptions = {
    allowedDomains: ["jp.usembassy.gov", "state.gov", "x.com", "twitter.com"],
    identityTerms: ["George Glass", "U.S. Ambassador to Japan", "U.S. Mission Japan", "Embassy Tokyo", "USAmbJapan"],
    maxAgeDays: 21,
  };

  assert.equal(
    isExpectedIndexedSource(
      "Ambassador Yousef Mohammed Albalawi met with the First Lady of Nigeria during a courtesy visit.",
      "https://x.com",
      embassyOptions,
    ),
    false,
  );
  assert.equal(
    isExpectedIndexedSource(
      "U.S. Ambassador to Japan George Glass issued a statement on the alliance.",
      "https://x.com",
      embassyOptions,
    ),
    true,
  );
  assert.equal(
    isExpectedIndexedSource(
      "Statement on U.S.-Japan relations",
      "https://jp.usembassy.gov",
      embassyOptions,
    ),
    true,
  );
  assert.equal(
    isExpectedIndexedSource(
      "Unrelated third-country embassy statement",
      "https://example.com",
      embassyOptions,
    ),
    false,
  );
});

test("indexed results must fall inside their actual collection window", () => {
  const now = Date.parse("2026-07-30T17:00:00.000Z");
  assert.equal(isWithinDays("2026-07-29T12:00:00.000Z", 14, now), true);
  assert.equal(isWithinDays("2025-07-29T12:00:00.000Z", 14, now), false);
  assert.equal(isWithinDays("2026-07-30T18:00:00.000Z", 14, now), false);
});

test("accepts ambassador and military commander statements about Japan", () => {
  const ambassador = assessPrincipalCommunication(
    "U.S. Ambassador to Japan George Glass issues statement on the U.S.-Japan alliance",
    "Ambassador Glass said the United States stands with Japan.",
    true,
    "us",
  );
  assert.equal(ambassador.relevant, true);
  assert.equal(ambassador.japanRelated, true);

  const commander = assessPrincipalCommunication(
    "U.S. Forces Japan Commander Stephen Jost remarks on alliance readiness",
    "The commander announced a new U.S.-Japan exercise.",
    true,
    "us",
  );
  assert.equal(commander.relevant, true);
  assert.equal(commander.japanRelated, true);
});

test("the all-member sweep explicitly covers atomic-bomb and surrender language", () => {
  const memberSweeps = indexedSweeps
    .filter((sweep) => sweep.name === "全米上院議員公式サイト" || sweep.name === "全米下院議員公式サイト")
    .map((sweep) => sweep.topics)
    .join(" ");
  for (const term of ["A-bomb", "atomic weapon", "unconditional surrender", "原爆", "被爆"]) {
    assert.match(memberSweeps, new RegExp(term, "i"));
  }
});
