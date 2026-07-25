import type { AlertItem } from "./feeds";

// Final safety gate applied after all collectors. It prevents generic domestic
// breaking news from entering either the dashboard or notification pipeline.
const clearlyNonPolicy = /(?:交通事故|列車.*衝突|電車.*衝突|車.*衝突|事故|意識不明|死亡事故|火災|住宅火災|山火事|地震|津波|大雨|台風|竜巻|猛暑|大雪|行方不明|殺人|強盗|傷害|逮捕|遺体|スポーツ|野球|サッカー|バスケット|芸能|俳優|歌手|映画|レシピ|天気予報)|\b(?:car crash|train crash|collision|traffic accident|fatal accident|house fire|wildfire|earthquake|tsunami|flood|tornado|weather forecast|murder|robbery|arrested|missing person|sports|baseball|basketball|soccer|celebrity|recipe)\b/i;

const policySubstance = /(?:日米|米国|アメリカ|米政府|米大統領|ホワイトハウス|国務省|国防総省|米議会|外交|安全保障|防衛|軍事|同盟|中国|台湾|北朝鮮|ロシア|ウクライナ|イラン|イスラエル|関税|通商|貿易|制裁|輸出管理|半導体|経済安全保障|首脳会談|外相|国務長官|国防長官|大統領令|法案|議会)|\b(?:u\.?s\.?|united states|white house|state department|pentagon|congress|foreign policy|diplomacy|security|defen[cs]e|military|alliance|china|taiwan|north korea|russia|ukraine|iran|israel|tariff|trade|sanction|export control|semiconductor|economic security|summit|secretary of state|executive order|legislation)\b/i;

const genericBreakingPrefix = /^(?:【?(?:速報|続報|独自|緊急)】?[\s　]*)+/i;

export function passesFinalRelevanceGuard(item: AlertItem): boolean {
  const title = item.title.replace(genericBreakingPrefix, "").trim();
  const text = `${title} ${item.summary || ""}`;

  // A source/category label such as “日本関連” is never sufficient by itself.
  if (clearlyNonPolicy.test(text) && !policySubstance.test(text)) return false;

  // Extremely short generic breaking-news headlines must contain real policy substance.
  if (genericBreakingPrefix.test(item.title) && !policySubstance.test(text)) return false;

  return true;
}
