export type PolicyCategory =
  | "日米関係"
  | "首脳・閣僚"
  | "外交・安保"
  | "通商・経済"
  | "議会・政治"
  | "公式発表";

export type PolicyAssessment = {
  relevant: boolean;
  japanRelated: boolean;
  category: PolicyCategory;
  priority: number;
  english: boolean;
};

const bilateralPattern =
  /\b(?:u\.?s\.?|united states)[-–—\s]+japan(?:ese)?\b|\bjapan(?:ese)?[-–—\s]+(?:u\.?s\.?|united states)\b|日米|米日|日・米|米・日/i;
const japanPattern =
  /\bjapan(?:ese)?\b|\btokyo\b|\bokinawa\b|日本|東京|沖縄|高市|石破|岸田|総理|日本の首相|外務省|防衛省|経産省/i;
const usPattern =
  /\b(?:u\.?s\.?a?|united states|america(?:n)?|washington|white house|pentagon|state department|department of state|department of defense|congress|senate|trump|rubio|hegseth)\b|米国|アメリカ|米政府|米大統領|米政権|ホワイトハウス|国務省|国防総省|米議会|米上院|米下院|トランプ|ルビオ|ヘグセス|米軍|米中|米露|米韓|訪米|対米/i;
const leadershipPattern =
  /\b(?:president|prime minister|vice president|secretary of state|secretary of defense|foreign minister|defen[cs]e minister|commerce secretary|treasury secretary|cabinet|senator|congress(?:man|woman)|ambassador|special envoy|director|chief)\b|大統領|副大統領|首相|総理|国務長官|国防長官|外相|外務大臣|防衛大臣|経産大臣|財務大臣|閣僚|上院議員|下院議員|大使|特使|長官|トップ/i;
const institutionPattern =
  /\b(?:white house|state department|department of state|pentagon|department of defense|congress|senate|house of representatives|national security council|nsc)\b|ホワイトハウス|国務省|国防総省|米議会|国家安全保障会議|首相官邸|外務省|防衛省|経産省/i;
const strategicPattern =
  /\b(?:alliance|indo-pacific|china|taiwan|north korea|russia|iran|security|defen[cs]e|military|nuclear|missile|base|deterrence|arms|ceasefire|trade|tariff|sanction|export control|semiconductor|critical mineral|currency|forex|investment screening|economic security|supply chain|technology transfer|visa policy)\b|同盟|インド太平洋|中国|台湾|北朝鮮|ロシア|イラン|米中|米露|米韓|安全保障|防衛|軍事|核|ミサイル|基地|抑止|武器|停戦|通商|貿易|関税|制裁|輸出管理|輸出規制|半導体|重要鉱物|為替|対米投資|投資審査|経済安全保障|サプライチェーン|技術移転|査証政策/i;
const externalPolicyPattern =
  /\b(?:alliance|indo-pacific|foreign policy|diplomat|bilateral|multilateral|nato|g7|g20|china|taiwan|north korea|russia|ukraine|iran|israel|middle east|european union|asean|military|nuclear|missile|base|deterrence|arms|ceasefire|trade|tariff|sanction|export control|semiconductor|critical mineral|investment screening|economic security|supply chain|technology transfer|import|export)\b|同盟|インド太平洋|外交|二国間|多国間|NATO|G7|G20|中国|台湾|北朝鮮|ロシア|ウクライナ|イラン|イスラエル|中東|欧州連合|ASEAN|米中|米露|米韓|軍事|核|ミサイル|基地|抑止|武器|停戦|通商|貿易|関税|制裁|輸出管理|輸出規制|半導体|重要鉱物|投資審査|経済安全保障|サプライチェーン|技術移転|輸入|輸出/i;
const actionPattern =
  /\b(?:announc|approv|authoriz|ban(?:ned)?|block|cancel|confirm|consider|decid|deploy|designat|dismiss|fir(?:e|ed)|impos|launch|lift|meet|negotiat|nominat|order|plan|prepar|propos|reach(?:ed)? (?:an? )?(?:deal|agreement)|resign|restrict|sign|strike|suspend|threaten|visit|vote|warn|joint statement|readout|agreement|talks?|summit|executive order|legislation)\b|発表|表明|合意|決定|検討|調整|見通し|指名|承認|発動|会談|協議|訪問|訪米|辞任|解任|派遣|攻撃|署名|声明|方針|要請|警告|法案|可決|否決|訓練|共同声明/i;
const defensePattern =
  /\b(?:alliance|indo-pacific|security|defen[cs]e|military|pentagon|navy|army|air force|nuclear|missile|base|deterrence|arms|ceasefire|attack|strike)\b|同盟|インド太平洋|安全保障|防衛|軍事|米軍|核|ミサイル|基地|抑止|武器|停戦|攻撃|共同訓練/i;
const economyPattern =
  /\b(?:econom|trade|tariff|market|currency|forex|sanction|export control|semiconductor|critical mineral|investment|supply chain)\b|経済|通商|貿易|関税|市場|為替|制裁|輸出管理|輸出規制|半導体|重要鉱物|投資|サプライチェーン/i;
const legislaturePattern =
  /\b(?:congress|senate|house of representatives|lawmaker|legislation|bill|nomination|confirmation|resign|dismiss)\b|議会|上院|下院|議員|法案|指名|承認|辞任|解任|人事/i;
const noisePattern =
  /\b(?:nba|nfl|mlb|nhl|ncaa|knicks|lakers|celtics|warriors|dodgers|indycar|grand prix|world series|championship|baseball|basketball|soccer|tennis|athlete|player|coach|sports team|box office|celebrity|recipe|fashion|wedding|fridge|tourism|travel guide|weather forecast|gaffe|mistakenly|misspoke|islamic republic of japan|japan.{0,5}instead of iran)\b|スポーツ|野球|バスケット|サッカー|テニス|ゴルフ|選手|監督|優勝|映画|俳優|歌手|芸能|レシピ|観光案内|旅行ガイド|天気予報|冷蔵庫|失言|言い間違|誤って日本/i;
const lowValuePattern =
  /\b(?:passport|routine visa|travel advisory|travel information|consular|citizen services|holiday closure|remarks at (?:a |the )?(?:reception|ceremony)|daily press briefing schedule|business meeting to consider|student exchange|youth program|presidential message on the anniversary|commemorative message|death of|mark of respect|half-staff)\b|パスポート|たびレジ|在留届|領事|休館|募集|文化交流|記念行事|定例会見|査証申請|ビザ申請|学生交流|青少年交流|TOFU.*プログラム|交流プログラム|招聘プログラム|研修プログラム|未来を考える|追悼|半旗/i;
const genericPagePattern =
  /\b(?:home ?page|official web ?site)\b|ホームページ|公式Webサイト|サイトトップ/i;

export function assessPolicyItem(
  title: string,
  summary = "",
  official = false,
): PolicyAssessment {
  const text = `${title} ${summary}`.replace(/\s+/g, " ").trim();
  const bilateral = bilateralPattern.test(text);
  const japan = japanPattern.test(text);
  const us = usPattern.test(text);
  const senior = leadershipPattern.test(text);
  const institution = institutionPattern.test(text);
  const strategic = strategicPattern.test(text);
  const external = externalPolicyPattern.test(text);
  const action = actionPattern.test(text);
  const excluded = noisePattern.test(text) || lowValuePattern.test(text) || genericPagePattern.test(text);

  const directJapanUS = (bilateral || (japan && us)) && (strategic || senior || action || institution);
  const majorUSPolicy = us && action && external && (strategic || senior || institution);
  const officialStrategicAction = official && us && external && strategic && (action || senior);
  const relevant = !excluded && (directJapanUS || majorUSPolicy || officialStrategicAction);

  let category: PolicyCategory = official ? "公式発表" : "議会・政治";
  if (bilateral) category = "日米関係";
  if (defensePattern.test(text)) category = "外交・安保";
  if (economyPattern.test(text)) category = "通商・経済";
  if (legislaturePattern.test(text)) category = "議会・政治";
  if (senior && /\b(?:summit|visit|meet|talks?)\b|首脳会談|会談|訪米|訪問/i.test(text)) category = "首脳・閣僚";

  let priority = official ? 48 : 38;
  if (bilateral) priority += 30;
  else if (japan && us) priority += 25;
  else if (majorUSPolicy) priority += 10;
  if (senior) priority += 12;
  if (strategic) priority += 10;
  if (action) priority += 8;
  if (official) priority += 3;
  if (!relevant) priority = 0;

  return {
    relevant,
    japanRelated: japan || bilateral,
    category,
    priority: Math.min(99, priority),
    english: isEnglish(title),
  };
}

export function cleanNewsTitle(title: string, publisher = "") {
  let cleaned = title.replace(/\s+/g, " ").trim();
  if (publisher) {
    const escaped = publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s[-–—]\\s${escaped}$`, "i"), "").trim();
  }
  return cleaned;
}

export function cleanNewsSummary(summary: string, title: string, publisher = "") {
  const cleaned = summary.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const comparable = cleaned.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const repeated = `${title} ${publisher}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return comparable === repeated || comparable === title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
    ? ""
    : cleaned;
}

export function canonicalHeadline(title: string) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 180);
}

function isEnglish(text: string) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const japanese = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  return letters > japanese * 2 && letters > 12;
}
