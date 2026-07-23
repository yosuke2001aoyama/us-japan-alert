import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPrincipalCommunication,
  assessPolicyItem,
  cleanNewsSummary,
  cleanNewsTitle,
} from "../lib/policy.ts";

test("keeps direct Japan-US policy developments", () => {
  const result = assessPolicyItem("高市総理、8月の訪米を調整　トランプ大統領と首脳会談へ");
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, true);
  assert.equal(result.category, "首脳・閣僚");
  assert.ok(result.priority >= 80);
});

test("keeps major US foreign-policy action without mislabeling it as Japan-related", () => {
  const result = assessPolicyItem("イスラエル情報機関トップが訪米、イラン巡り協議＝報道");
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, false);
});

test("keeps major US-China ministerial diplomacy", () => {
  const result = assessPolicyItem("米中外相が会談、習氏訪米へ地ならし　ハイレベル往来を協議");
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, false);
  assert.equal(result.category, "首脳・閣僚");
});

test("drops sports stories that happen to mention the White House", () => {
  const result = assessPolicyItem("Jalen Brunson says Knicks players have not discussed White House visit");
  assert.equal(result.relevant, false);
});

test("drops lifestyle stories that merely mention Japan", () => {
  const result = assessPolicyItem("A human-sized fridge to beat the heat in Japan");
  assert.equal(result.relevant, false);
});

test("drops foreign stories with no US policy actor", () => {
  const result = assessPolicyItem("China Tankers Head to Red Sea Chokepoint Despite Houthi Attacks");
  assert.equal(result.relevant, false);
});

test("drops generic ministry pages and non-US press-conference listings", () => {
  assert.equal(assessPolicyItem("防衛省・自衛隊ホームページ", "", true).relevant, false);
  assert.equal(assessPolicyItem("茂木外務大臣臨時会見記録｜外務省", "", true).relevant, false);
});

test("drops unrelated White House domestic releases", () => {
  assert.equal(
    assessPolicyItem(
      "S. 1003 Signed into Law",
      "The President signed a law permitting wireless emergency alerts for shark attacks.",
      true,
    ).relevant,
    false,
  );
  assert.equal(
    assessPolicyItem(
      "President Trump Advances Regenerative Agriculture",
      "A new executive order supports American farmers and rural communities.",
      true,
    ).relevant,
    false,
  );
});

test("keeps internationally consequential White House actions", () => {
  assert.equal(
    assessPolicyItem(
      "President Trump Announces Trade Deal with Jordan",
      "The United States will adjust tariffs under a bilateral agreement.",
      true,
    ).relevant,
    true,
  );
});

test("drops reports whose only Japan reference is a verbal gaffe", () => {
  assert.equal(
    assessPolicyItem("Trump mistakenly says ‘Islamic Republic of Japan’ instead of Iran").relevant,
    false,
  );
  assert.equal(
    assessPolicyItem("Trump says ‘Japan’ instead of Iran at meeting in Ankara").relevant,
    false,
  );
  assert.equal(
    assessPolicyItem("Trump confuses Iran, Japan in missile attack claim at NATO summit").relevant,
    false,
  );
});

test("drops ceremonial and exchange-program notices", () => {
  assert.equal(
    assessPolicyItem("Presidential Message on the Anniversary of the Liberation of Guam", "The Japanese occupation ended.", true).relevant,
    false,
  );
  assert.equal(
    assessPolicyItem("「アメリカで沖縄の未来を考える」（TOFU）プログラム｜外務省", "", true).relevant,
    false,
  );
});

test("removes Google News publisher suffixes and duplicate pseudo-summaries", () => {
  const title = cleanNewsTitle(
    "Japan, US Agree to Continue Tariff Talks - Reuters",
    "Reuters",
  );
  assert.equal(title, "Japan, US Agree to Continue Tariff Talks");
  assert.equal(
    cleanNewsSummary(
      "Japan, US Agree to Continue Tariff Talks Reuters",
      title,
      "Reuters",
    ),
    "",
  );
});

test("drops a re-indexed legacy conference page and cleans Japanese PDF headers", () => {
  assert.equal(
    assessPolicyItem('Pacific Forum CSIS Conference: "The Japan-U.S. Alliance at Fifty"').relevant,
    false,
  );
  assert.equal(
    cleanNewsTitle("令和８年７月２３日 海 上 幕 僚 監 部 （お知らせ） 日米共同訓練について 海上自衛隊"),
    "日米共同訓練について 海上自衛隊",
  );
});

test("keeps public communications from monitored US principals even when not Japan-specific", () => {
  const result = assessPrincipalCommunication(
    "Remarks by Vice President JD Vance at a manufacturing roundtable",
    "",
    true,
    "us",
  );
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, false);
  assert.equal(result.category, "首脳・閣僚");
});

test("keeps public communications from monitored Japanese principals", () => {
  const result = assessPrincipalCommunication(
    "高市総理大臣記者会見",
    "高市総理は記者団の質問に答えました。",
    true,
    "jp",
  );
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, true);
});
