import assert from "node:assert/strict";
import test from "node:test";
import { coverageGroups, sources } from "../lib/feeds.ts";

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
  ]) {
    assert.match(names, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("uses 44 routes and stays below the conservative Worker subrequest ceiling", () => {
  assert.equal(sources.length, 44);
  assert.ok(sources.length < 45);
});
