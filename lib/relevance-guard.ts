import type { AlertItem } from "./feeds.ts";
import { assessDirectPrincipalPost, assessPolicyItem, assessPrincipalCommunication } from "./policy.ts";

// Final safety gate applied after all collectors. It prevents generic domestic
// breaking news from entering either the dashboard or notification pipeline.
const clearlyNonPolicy = /(?:交通事故|列車.*衝突|電車.*衝突|車.*衝突|事故|意識不明|死亡事故|火災|住宅火災|山火事|地震|津波|大雨|台風|竜巻|猛暑|大雪|行方不明|殺人|強盗|傷害|逮捕|遺体|スポーツ|野球|サッカー|バスケット|芸能|俳優|歌手|映画|レシピ|天気予報)|\b(?:car crash|train crash|collision|traffic accident|fatal accident|house fire|wildfire|earthquake|tsunami|flood|tornado|weather forecast|murder|robbery|arrested|missing person|sports|baseball|basketball|soccer|celebrity|recipe)\b/i;

const policySubstance = /(?:日米|米国|アメリカ|米政府|米大統領|米財務省|ホワイトハウス|国務省|国防総省|米議会|外交|安全保障|防衛|軍事|同盟|中国|台湾|北朝鮮|ロシア|ウクライナ|イラン|イスラエル|関税|通商|貿易|為替|為替介入|協調介入|円相場|ドル円|輸入解禁|輸出解禁|市場開放|検疫協議|農産物|ジャガイモ|ばれいしょ|制裁|輸出管理|半導体|経済安全保障|首脳会談|外相|国務長官|国防長官|大統領令|法案|議会)|\b(?:u\.?s\.?|united states|u\.?s\.? treasury|white house|state department|pentagon|congress|foreign policy|diplomacy|security|defen[cs]e|military|alliance|china|taiwan|north korea|russia|ukraine|iran|israel|tariff|trade|currency|foreign exchange|forex|yen|intervention|market access|import ban|export ban|agriculture|potato|sanction|export control|semiconductor|economic security|summit|secretary of state|executive order|legislation)\b/i;

const criticalJapanEconomicSignal = /為替介入|協調介入|通貨介入|円買い(?:介入)?|円売り(?:介入)?|ドル売り円買い|ドル買い円売り|ドル円|円相場|輸入解禁|輸出解禁|市場開放|検疫協議|(?:ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯).{0,35}(?:輸入|輸出|解禁|検疫|市場)|(?:輸入|輸出|解禁|検疫|市場).{0,35}(?:ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯)|(?:currency|foreign exchange|forex|yen).{0,50}interven|interven.{0,50}(?:currency|foreign exchange|forex|yen)|market access|potato(?:es)?.{0,30}(?:import|export|market)/i;

const japanNationalEmergency = /\b(?:(?:kumamoto(?: prefecture| region)?|kyushu|southern japan|southwestern japan|japan(?:ese)?).{0,100}(?:earthquake|tsunami|aftershock|tremor|seismic)|(?:earthquake|tsunami|aftershock|tremor|seismic).{0,100}(?:kumamoto(?: prefecture| region)?|kyushu|southern japan|southwestern japan|japan(?:ese)?))\b|(?:熊本|九州|日本).{0,50}(?:地震|津波|余震|強い揺れ)|(?:地震|津波|余震|強い揺れ).{0,50}(?:熊本|九州|日本)/i;
const japaneseOfficialResponse = /\b(?:prime minister(?: of japan)?|chief cabinet secretary|prime minister'?s office of japan|government of japan)\b|高市|総理|首相|官房長官|首相官邸|日本政府|政府.{0,30}(?:指示|対応)|救命|救助|災害対策本部|自衛隊/i;

const genericBreakingPrefix = /^(?:【?(?:速報|続報|独自|緊急)】?[\s　]*)+/i;
const mediaDerivativePage = /(?:【?画像(?:まとめ|集)?】?|写真特集|\[写真特集(?:\s*\d+\/\d+)?\])/i;
const indexedPrincipalLane = /^(?:公開検索 ·|米連邦議員公式発信 ·|日米関係重要議員 ·|米議会委員会・日米議連 ·|駐日米国大使館 ·|米国務省EAP・日本部 ·|ホワイトハウスNSC ·|米太平洋軍・在日米軍 ·|米通商・財務・商務 ·|日本政府・主要閣僚 ·|米政府・議会 · 日本戦争記憶関連発信 ·)/;

export function passesFinalRelevanceGuard(item: AlertItem): boolean {
  const title = item.title.replace(genericBreakingPrefix, "").trim();
  const text = `${title} ${item.summary || ""}`;

  // Photo galleries and image-only derivatives do not add briefing substance,
  // even when their parent story is a critical policy development.
  if (mediaDerivativePage.test(title)) return false;

  const officialJapanEmergency = item.official && japanNationalEmergency.test(text) && japaneseOfficialResponse.test(text);
  const countryContext = item.verifiedSource
    ? item.actorCountry === "jp" ? "Japan" : item.actorCountry === "us" ? "United States" : ""
    : "";
  const executiveAssessment = assessPolicyItem(`${countryContext} ${title}`.trim(), item.summary || "", item.official);
  const verifiedDirectSocial = item.verifiedSource && /^(?:Truth Social|X) · @/i.test(item.source);
  const directSocialAssessment = verifiedDirectSocial
    ? assessDirectPrincipalPost(title, item.summary || "", item.actorCountry === "jp" ? "jp" : "us")
    : null;
  const verifiedOfficialPrincipal = item.verifiedSource
    && item.official
    && !verifiedDirectSocial
    && assessPrincipalCommunication(
      title,
      item.summary || "",
      true,
      item.actorCountry === "jp" ? "jp" : "us",
      true,
    ).relevant;
  const criticalMediaSignal = item.coverage === "major-media"
    && item.japanRelated
    && criticalJapanEconomicSignal.test(text);
  const indexedCountry = item.source.startsWith("日本政府・主要閣僚") || /Prime Minister|Ministry of .*Japan/.test(item.source)
    ? "jp"
    : "us";

  // Generic disasters remain excluded. The only exception is a verified Japanese
  // government or senior-official response to a major national emergency.
  if (clearlyNonPolicy.test(text) && !policySubstance.test(text) && !officialJapanEmergency) return false;

  // Extremely short generic breaking-news headlines must contain real policy substance.
  if (genericBreakingPrefix.test(item.title) && !policySubstance.test(text) && !officialJapanEmergency) return false;

  // Indexed search results must identify the expected principal in their own
  // content unless the publisher/account was independently verified.
  if (
    indexedPrincipalLane.test(item.source)
    && !item.verifiedSource
    && !assessPrincipalCommunication(title, item.summary || "", false, indexedCountry).relevant
  ) return false;

  // A source lane or search query is not evidence of relevance. Reassess only the
  // actual headline/summary, adding a country context solely for verified authors.
  return executiveAssessment.relevant
    || Boolean(directSocialAssessment?.relevant)
    || Boolean(verifiedOfficialPrincipal)
    || criticalMediaSignal
    || officialJapanEmergency;
}
