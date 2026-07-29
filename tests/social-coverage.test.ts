import assert from "node:assert/strict";
import test from "node:test";
import { indexedSweeps, publicFigures } from "../lib/social-direct.ts";
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
    "Office of Japanese Affairs",
    "Samuel Paparo",
    "Stephen Jost",
    "USFJ",
    "Congressional Japan Caucus",
  ]) {
    assert.match(corpus, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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
