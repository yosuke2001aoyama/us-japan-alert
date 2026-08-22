import assert from "node:assert/strict";
import test from "node:test";
import {
  assessDirectPrincipalPost,
  assessPrincipalCommunication,
  assessPolicyItem,
  cleanNewsSummary,
  cleanNewsTitle,
} from "../lib/policy.ts";
import { passesFinalRelevanceGuard } from "../lib/relevance-guard.ts";
import type { AlertItem } from "../lib/feeds.ts";
import { assessJapaneseCriticalMedia } from "../lib/japanese-tariff-media.ts";

function item(overrides: Partial<AlertItem>): AlertItem {
  return {
    id: "test",
    title: "",
    url: "https://example.com",
    source: "test",
    publishedAt: "2026-07-30T00:00:00.000Z",
    summary: "",
    category: "外交・安保",
    priority: 90,
    japanRelated: false,
    official: false,
    english: false,
    ...overrides,
  };
}

test("keeps direct Japan-US policy developments", () => {
  const result = assessPolicyItem("高市総理、8月の訪米を調整　トランプ大統領と首脳会談へ");
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, true);
  assert.equal(result.category, "首脳・閣僚");
  assert.ok(result.priority >= 80);
});

test("keeps Japan-related statements, tariff coverage, and policy analysis", () => {
  assert.equal(
    assessPolicyItem(
      "Statement by the U.S. Ambassador to Japan on tariff negotiations",
      "The ambassador discussed the U.S.-Japan trade relationship.",
      true,
    ).relevant,
    true,
  );
  assert.equal(
    assessPolicyItem("米関税変更で日本企業への影響広がる　関連業界が対応を検討").relevant,
    true,
  );
  assert.equal(
    assessPolicyItem("日米同盟の今後を検証する政策分析").relevant,
    true,
  );
});

test("keeps coordinated yen intervention and immediate Trump comments", () => {
  for (const title of [
    "Japan and U.S. conducted coordinated yen-buying intervention, government sources say",
    "U.S. Treasury reports yen-buying intervention on the 31st",
    "Trump says Japan wanted a little help on its weakening yen after intervention",
    "日米が協調してドル売り円買いの為替介入、15年ぶり",
  ]) {
    const result = assessPolicyItem(title);
    assert.equal(result.relevant, true, title);
    assert.equal(result.japanRelated, true, title);
    assert.equal(result.category, "通商・経済", title);
  }
});

test("keeps Japanese market-access reporting even when the headline omits the U.S.", () => {
  const title = "生のジャガイモ 輸入解禁手続き進む";
  const assessment = assessJapaneseCriticalMedia(title);
  assert.equal(assessment.relevant, true);
  assert.equal(assessment.japanRelated, true);
  assert.ok(assessment.priority >= 90);
  assert.equal(
    passesFinalRelevanceGuard(item({
      title,
      source: "NHK",
      coverage: "major-media",
      japanRelated: true,
      priority: assessment.priority,
      category: "通商・経済",
    })),
    true,
  );
});

test("drops image-only derivatives of otherwise critical coverage", () => {
  const base = {
    id: "photo-derivative",
    url: "https://example.com/photo-gallery",
    source: "毎日新聞",
    publishedAt: "2026-07-31T01:04:05.000Z",
    summary: "政府・日銀が為替介入を実施",
    category: "通商・経済" as const,
    priority: 98,
    japanRelated: true,
    official: false,
    english: false,
    coverage: "major-media" as const,
  };

  assert.equal(passesFinalRelevanceGuard({ ...base, title: "為替介入か 急激な円高に [写真特集3/6]" }), false);
  assert.equal(passesFinalRelevanceGuard({ ...base, title: "【画像まとめ】トランプ大統領なぜ日本を支援？日米協調介入" }), false);
});

test("keeps verified White House remarks even before a detailed transcript is indexed", () => {
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "President Trump Delivers Remarks Aboard Air Force One",
      summary: "公式ページの更新を検知。",
      source: "White House · Videos",
      official: true,
      verifiedSource: true,
      actorCountry: "us",
      category: "首脳・閣僚",
      priority: 72,
    })),
    true,
  );
});

test("keeps an official White House press gaggle while captions are still processing", () => {
  const assessment = assessPrincipalCommunication(
    "President Trump Gaggles with Press on Air Force One En Route Joint Base Andrews",
    "",
    true,
    "us",
    true,
  );
  assert.equal(assessment.relevant, true);
});

test("keeps a prime minister visit leaked directly to reporters", () => {
  const result = assessPolicyItem(
    "高市総理、8月の訪米を記者団に明らかに　トランプ大統領との会談を調整",
    "総理は取材に対し、ワシントン訪問を検討していると述べた。",
    false,
  );
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

test("drops generic ministry pages but keeps substantive minister statements", () => {
  assert.equal(assessPolicyItem("防衛省・自衛隊ホームページ", "", true).relevant, false);
  assert.equal(assessPolicyItem("茂木外務大臣臨時会見記録｜外務省", "", true).relevant, true);
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

test("keeps systemic White House actions and drops routine third-country deals", () => {
  assert.equal(
    assessPolicyItem(
      "President Trump Announces Trade Deal with Jordan",
      "The United States will adjust tariffs under a bilateral agreement.",
      true,
    ).relevant,
    false,
  );
  assert.equal(
    assessPolicyItem(
      "President Trump Imposes New Export Controls on Advanced Semiconductors to China",
      "The United States will restrict chip exports and add Chinese firms to the Entity List.",
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
  assert.equal(
    assessPolicyItem("駐日エジプト大使による外務大臣政務官への表敬｜外務省", "", true).relevant,
    false,
  );
  assert.equal(
    assessPolicyItem("毎小ニュース：国際 アメリカ新関税 日本に12.5％").relevant,
    true,
  );
  assert.equal(
    assessPolicyItem("トランプ新関税、日本や企業はどう対処すべきか 有識者2人に聞く").relevant,
    true,
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

test("treats verified principal posts as communications without attribution words", () => {
  const tariffPost = assessDirectPrincipalPost(
    "The Supreme Court has cost our Nation TRILLIONS with its negative ruling on TARIFFS.",
    "",
    "us",
  );
  assert.equal(tariffPost.relevant, true);
  assert.equal(tariffPost.category, "通商・経済");
  assert.ok(tariffPost.priority >= 82);

  const diplomacyPost = assessDirectPrincipalPost(
    "Prime Minister Netanyahu and I had a very good meeting. Many important subjects were discussed.",
    "",
    "us",
  );
  assert.equal(diplomacyPost.relevant, true);
  assert.equal(diplomacyPost.japanRelated, false);

  const domesticPraise = assessDirectPrincipalPost(
    "Todd Blanche is a STAR, and everyone knows it!",
    "",
    "us",
  );
  assert.equal(domesticPraise.relevant, false);
  assert.equal(
    assessDirectPrincipalPost(
      "Senator Ron Johnson is working with Senate leadership on a budget resolution funding our troops and farmers.",
      "",
      "us",
    ).relevant,
    false,
  );
  assert.equal(
    assessDirectPrincipalPost(
      "I endorse Amir Hassan for Congress. He served in the U.S. Navy, will strengthen our military, keep our border SECURE, and fight for Michigan.",
      "",
      "us",
    ).relevant,
    false,
  );
});

test("treats an obscure lawmaker atomic-bomb remark as a critical Japan signal", () => {
  const result = assessPrincipalCommunication(
    "U.S. Senator issues remarks questioning the atomic bombing of Hiroshima",
    "The senator posted a statement about the A-bomb and Japan's surrender.",
    true,
    "us",
  );
  assert.equal(result.relevant, true);
  assert.equal(result.japanRelated, true);
  assert.ok(result.priority >= 90);
});

test("drops stories about fake posts, paid access, or trading on posts", () => {
  for (const title of [
    "Fake Truth Social post circulates as Trump bemoans Canadian wildfire smoke",
    "How Wall Street’s Bots Are Cashing In on Trump’s Truth Social Posts",
    "US senator urges Wall Street to reject offer of paid early access to Trump posts",
  ]) {
    assert.equal(assessPrincipalCommunication(title, "", false, "us").relevant, false);
  }
});

test("rejects a foreign ambassador courtesy post even when it arrives through a US lane", () => {
  const title = "Ambassador Yousef Mohammed Albalawi met with the First Lady of Nigeria during a courtesy visit";
  const summary = "The meeting provided an opportunity for a warm and cordial exchange between Saudi Arabia and Nigeria.";

  assert.equal(assessPrincipalCommunication(title, summary, true, "us").relevant, false);
  assert.equal(
    passesFinalRelevanceGuard(item({
      title,
      summary,
      source: "駐日米国大使館 · Ambassador/Deputy Chief of Mission",
      official: true,
      japanRelated: true,
      priority: 97,
    })),
    false,
  );
});

test("drops ceremonial bilateral embassy items from the executive briefing", () => {
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "U.S. Ambassador to Japan presents credentials at a reception in Tokyo",
      summary: "The embassy hosted a warm ceremonial gathering.",
      official: true,
      japanRelated: true,
      priority: 96,
    })),
    false,
  );
});

test("keeps Japan-related policy analysis, including reports and commentary", () => {
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "Beyond Deterrence: Evolving China-Russia Military Coordination and the U.S.-Japan Alliance",
      source: "CSIS",
      coverage: "policy-analysis",
      japanRelated: true,
      priority: 48,
    })),
    true,
  );
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "New war-game report warns China blockade could exhaust U.S.-Japan missile stocks",
      summary: "The CSIS study recommends immediate changes to alliance planning.",
      source: "CSIS",
      coverage: "policy-analysis",
      japanRelated: true,
      priority: 90,
    })),
    true,
  );
});

test("keeps high-value reports and direct disclosures that officials may be asked about", () => {
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "Statement by the U.S. Ambassador to Japan on tariff negotiations",
      summary: "The ambassador discussed the U.S.-Japan trade relationship.",
      source: "U.S. Embassy Japan",
      official: true,
      japanRelated: true,
      priority: 55,
    })),
    true,
  );
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "高市総理、8月の訪米を記者団に明らかに　トランプ大統領との会談を調整",
      summary: "総理は取材に対し、ワシントン訪問を検討していると述べた。",
      japanRelated: true,
      priority: 83,
    })),
    true,
  );
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "U.S. Senator questions the atomic bombing of Hiroshima in public remarks",
      summary: "The senator said the decision and Japan's surrender should be debated.",
      source: "U.S. Senate",
      official: true,
      japanRelated: true,
      priority: 98,
    })),
    true,
  );
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "Israeli intelligence chief visits Washington for talks on Iran",
      summary: "The official met U.S. senators and administration officials to discuss Iran policy.",
      source: "Reuters",
      priority: 78,
    })),
    true,
  );
  assert.equal(
    passesFinalRelevanceGuard(item({
      title: "The Supreme Court has cost our Nation TRILLIONS with its negative ruling on TARIFFS.",
      summary: "The Supreme Court has cost our Nation TRILLIONS with its negative ruling on TARIFFS.",
      source: "Truth Social · @realDonaldTrump · President Donald Trump",
      official: true,
      verifiedSource: true,
      actorCountry: "us",
      priority: 87,
    })),
    true,
  );
});
