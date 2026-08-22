const routineMarketPattern = /^(?:【[^】]*】)?\s*(?:外為(?:8時30分|10時|12時|14時|17時)|NY円相場|NY円、|円相場[、,]|◎?円相場[、,]|東京円|ドル円(?:相場)?[、,]|株価[、,]|長期金利[、,])/i;
const nonBreakingPattern = /(?:解説|分析|検証|予想|見通しを聞く|仕組み|効果とは|理由とは|何が問題|背景(?:に何|を解説|を探る)|舞台裏|焦点|論点|ポイント|社説|寄稿|コラム|まとめ|週間|来週|今週|展望|シナリオ|歴史|その後|以降|受け止め|反応|懸念の声|不安の声|専門家|エコノミスト|ヘッジファンド|相場観|写真|画像|新刊|発売|著書|配信中|ポッドキャスト|podcast|explainer|analysis|outlook|forecast|opinion|editorial|what it means|history of|after intervention|since intervention)/i;
const routineDiplomacyPattern = /(?:thank you very much|warm and cordial|courtesy visit|do our best|pleased to meet|歓迎会|表敬|懇談|意見交換|緊密に連携|協力を加速するため最善)/i;

const currencyInterventionPattern = /(?:日米.{0,16}(?:協調)?介入|協調介入|為替介入|通貨介入|円買い介入|ドル売り円買い|currency intervention|foreign exchange intervention|yen intervention|interven(?:e|es|ed|ing).{0,40}(?:yen|currency|foreign exchange)|(?:yen|currency|foreign exchange).{0,40}interven)/i;
const japanTradePattern = /(?:(?:日米|日本|対日|日本製|日本企業|米国産|アメリカ産|ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯).{0,80}(?:関税|通商|貿易|輸入|輸出|市場開放|検疫|制裁|輸出管理|輸出規制|投資)|(?:関税|通商|貿易|輸入|輸出|市場開放|検疫|制裁|輸出管理|輸出規制|投資).{0,80}(?:日米|日本|対日|日本製|日本企業|米国産|アメリカ産|ジャガイモ|じゃがいも|ばれいしょ|馬鈴薯)|(?:u\.?s\.?|united states|american).{0,80}(?:japan|japanese).{0,80}(?:tariff|trade|import|export|market access|sanction|export control|investment)|(?:tariff|trade|import|export|market access|sanction|export control|investment).{0,80}(?:japan|japanese))/i;
const bilateralVisitPattern = /(?:(?:日本の)?(?:総理|首相|外相|外務大臣|防衛大臣|財務大臣|経産大臣).{0,45}(?:訪米|ワシントン訪問|トランプ.{0,18}会談)|(?:大統領|副大統領|国務長官|国防長官|財務長官|商務長官|通商代表).{0,45}(?:訪日|日本訪問)|日米首脳会談|日米.{0,24}(?:2\+2|閣僚会談)|(?:prime minister of japan|japan(?:ese)? prime minister).{0,50}(?:visit(?:s|ed|ing)? (?:the )?u\.?s\.?|washington|meet.{0,25}(?:president|trump))|(?:president|vice president|secretary of state|secretary of defense|treasury secretary|commerce secretary).{0,50}(?:visit(?:s|ed|ing)? japan|u\.?s\.?[-–— ]japan summit))/i;
const japanSecurityPattern = /(?:(?:日米|日本|在日米軍|沖縄|尖閣|台湾|北朝鮮).{0,90}(?:同盟|安全保障|防衛|基地|軍事|ミサイル|核|抑止|共同訓練|部隊|配備)|(?:同盟|安全保障|防衛|基地|軍事|ミサイル|核|抑止|共同訓練|部隊|配備).{0,90}(?:日米|日本|在日米軍|沖縄|尖閣|台湾|北朝鮮)|(?:japan|u\.?s\.?[-–— ]japan|usfj|okinawa|senkaku|taiwan|north korea).{0,90}(?:alliance|security|defen[cs]e|base|military|missile|nuclear|deterrence|deployment))/i;
const warMemoryPattern = /(?:hiroshima|nagasaki|hibakusha|a-?bomb|atomic bomb(?:ing)?|japan(?:ese)? surrender|pearl harbor|広島|長崎|被爆|被爆者|原爆|日本降伏|真珠湾)/i;
const emergencyPattern = /(?:(?:北朝鮮|中国|ロシア|north korea|china|russia).{0,60}(?:弾道ミサイル|ミサイル|発射|攻撃|領空|領海|スクランブル|ballistic missile|missile launch|attack|airspace|territorial waters)|(?:弾道ミサイル|ミサイル|発射|攻撃|領空|領海|スクランブル|ballistic missile|missile launch|attack|airspace|territorial waters).{0,60}(?:日本|北朝鮮|中国|ロシア|japan|north korea|china|russia))/i;
const keyPersonnelPattern = /(?:(?:総理|首相|官房長官|外相|防衛相|財務相|経産相|大統領|副大統領|国務長官|国防長官|財務長官|商務長官|通商代表|president|prime minister|vice president|secretary of state|secretary of defense|treasury secretary|commerce secretary|trade representative).{0,45}(?:辞任|解任|更迭|指名|就任|resign|dismiss|fire|nominate|appoint|confirm)|(?:辞任|解任|更迭|指名|就任|resign|dismiss|fire|nominate|appoint|confirm).{0,45}(?:総理|首相|官房長官|外相|防衛相|財務相|経産相|大統領|副大統領|国務長官|国防長官|財務長官|商務長官|通商代表|president|prime minister|vice president|secretary))/i;
const globalPrincipalPattern = /(?:核兵器|核武装|戦争|攻撃|停戦|イラン|台湾|北朝鮮|中国|ロシア|nuclear weapon|war|attack|strike|ceasefire|iran|taiwan|north korea|china|russia)/i;

const completedActionPattern = /(?:実施|発動|決定|合意|署名|成立|可決|否決|承認|解除|撤廃|禁止|停止|凍結|撤回|発射|攻撃|派遣|配備|辞任|解任|更迭|指名|就任|開始|妥結|最終工程へ|前進|announc(?:e|es|ed)|decid(?:e|es|ed)|agree(?:s|d)|sign(?:s|ed)|impos(?:e|es|ed)|launch(?:es|ed)|order(?:s|ed)|direct(?:s|ed)|confirm(?:s|ed)|approv(?:e|es|ed)|lift(?:s|ed)|ban(?:s|ned)|restrict(?:s|ed)|suspend(?:s|ed)|deploy(?:s|ed)|resign(?:s|ed)|dismiss(?:es|ed)|nominate(?:s|d)|appoint(?:s|ed)|reaches? (?:a )?(?:deal|agreement)|takes? effect)/i;
const imminentActionPattern = /(?:政府筋|関係者|複数の関係者|独自|調整(?:に入った|中|へ)?|検討(?:に入った|中|へ)?|方針(?:を固め|だ)?|見込み|見通し|予定|へ前進|最終段階|最終工程|秒読み|近く|にも(?:発表|実施|決定|開始)|sources? (?:say|said)|officials? (?:say|said)|expected to|planning to|plans? to|considering|likely to|set to|poised to|in talks|may visit)/i;
const materialStatementPattern = /(?:声明|演説|記者団|インタビュー|明らかにした|表明|警告|批判|否定|要求|要請|指示|容認できない|認めない|許さない|すべきだ|述べた|語った|statement|remarks?|speech|interview|told reporters?|warn(?:s|ed)?|demand(?:s|ed)?|oppose(?:s|d)?|support(?:s|ed)?|cannot|must not|will not|should not)/i;
const principalPattern = /(?:トランプ|大統領|副大統領|総理|首相|官房長官|国務長官|国防長官|財務長官|商務長官|通商代表|外相|防衛相|財務相|経産相|senator|representative|member of congress|president|vice president|prime minister|secretary of state|secretary of defense|treasury secretary|commerce secretary|trade representative)/i;

export const DEFAULT_MAX_ALERT_AGE_MS = 45 * 60 * 1_000;
export const STARTUP_RECOVERY_AGE_MS = 10 * 60 * 1_000;

export function classifyImmediateAlert(item, options = {}) {
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? DEFAULT_MAX_ALERT_AGE_MS);
  if (!item) return rejected("missing-item");

  const publishedAt = Date.parse(item.publishedAt || "");
  if (!Number.isFinite(publishedAt)) return rejected("missing-published-at");
  const ageMs = now - publishedAt;
  if (ageMs < -10 * 60 * 1_000 || ageMs > maxAgeMs) return rejected("outside-breaking-window");

  const title = cleanText(item.title || "");
  const rawSummary = String(item.summary || "");
  const summary = /(?:news\.google\.com\/rss\/articles|&lt;a\s+href=|<a\s+href=)/i.test(rawSummary)
    ? ""
    : cleanText(rawSummary);
  const text = `${title} ${summary} ${cleanText(item.transcript || "")}`;
  if (!title) return rejected("missing-title");
  if (routineMarketPattern.test(title)) return rejected("routine-market-update");
  if (nonBreakingPattern.test(title)) return rejected("important-but-not-breaking");
  if (item.coverage === "policy-analysis") return rejected("policy-analysis");

  const priority = Number(item.priority || 0);
  const direct = Boolean(item.official || item.socialPost || item.spokenEvent || item.verifiedSource);
  const verifiedDirect = Boolean(item.verifiedSource && (item.official || item.socialPost || item.spokenEvent));
  const media = item.coverage === "major-media" || item.verification === "media-report" || item.verification === "reported-observation";
  if (!direct && !media) return rejected("unverified-source");

  const currency = currencyInterventionPattern.test(text);
  const trade = japanTradePattern.test(text);
  const visit = bilateralVisitPattern.test(text);
  const security = japanSecurityPattern.test(text);
  const warMemory = warMemoryPattern.test(text) && principalPattern.test(text);
  const emergency = emergencyPattern.test(text);
  const personnel = keyPersonnelPattern.test(text);
  const principalGlobal = verifiedDirect && principalPattern.test(text) && globalPrincipalPattern.test(text);
  const highImpact = currency || trade || visit || security || warMemory || emergency || personnel || principalGlobal;
  if (!highImpact) return rejected("no-immediate-japan-us-impact");

  const completed = completedActionPattern.test(text);
  const imminent = imminentActionPattern.test(text);
  const statement = materialStatementPattern.test(text);
  if (routineDiplomacyPattern.test(text) && !completed) return rejected("routine-diplomacy");

  if (warMemory && direct && statement && priority >= 80) {
    return accepted("要人の原爆・戦争認識発言", "principal-war-memory-statement");
  }
  if (principalGlobal && statement && priority >= 85) {
    return accepted("日米要人の重大な直接発信", "verified-principal-statement");
  }
  if (direct && completed && priority >= 75) {
    return accepted("政府・要人による新たな決定・実施", "official-action");
  }
  if ((media || item.spokenEvent) && completed && priority >= 78) {
    return accepted("重大な新事実の報道", "breaking-report");
  }
  if (media && imminent && priority >= 80 && (currency || trade || visit || personnel)) {
    return accepted("公式発表前の重要な観測報道", "early-reported-signal");
  }
  if (direct && statement && priority >= 88 && (currency || trade || visit || security || emergency)) {
    return accepted("政府・要人の重大発言", "official-statement");
  }
  return rejected("important-but-not-breaking");
}

export function classifyTimelineImportance(item, options = {}) {
  const immediate = classifyImmediateAlert(item, options);
  if (immediate.notify) return { tier: "breaking", label: "速報", code: immediate.code };
  if (!item) return { tier: "monitor", label: "監視", code: "missing-item" };

  const title = cleanText(item.title || "");
  const rawSummary = String(item.summary || "");
  const summary = /(?:news\.google\.com\/rss\/articles|&lt;a\s+href=|<a\s+href=)/i.test(rawSummary)
    ? ""
    : cleanText(rawSummary);
  const text = `${title} ${summary} ${cleanText(item.transcript || "")}`;
  if (routineMarketPattern.test(title)) return { tier: "monitor", label: "監視", code: "routine-market-update" };
  if (routineDiplomacyPattern.test(text)) return { tier: "monitor", label: "監視", code: "routine-diplomacy" };
  if (/(?:新刊|発売|著書|配信中|写真|画像|セミナー|説明会)/i.test(title)) {
    return { tier: "monitor", label: "監視", code: "promotional-or-derivative" };
  }

  const highImpact = currencyInterventionPattern.test(text)
    || japanTradePattern.test(text)
    || bilateralVisitPattern.test(text)
    || japanSecurityPattern.test(text)
    || (warMemoryPattern.test(text) && principalPattern.test(text))
    || emergencyPattern.test(text)
    || keyPersonnelPattern.test(text);
  const directPrincipal = Boolean(item.official || item.socialPost || item.spokenEvent || item.verifiedSource)
    && principalPattern.test(text);
  const relevantAnalysis = item.coverage === "policy-analysis" && Boolean(item.japanRelated);
  if (highImpact || directPrincipal || relevantAnalysis) {
    return { tier: "important", label: "重要", code: "important-non-breaking" };
  }
  return { tier: "monitor", label: "監視", code: immediate.code };
}

function accepted(label, code) {
  return { notify: true, label, code };
}

function rejected(code) {
  return { notify: false, label: "", code };
}

function cleanText(value) {
  return String(value)
    .replace(/&lt;[^&]*?&gt;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp;)?nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
