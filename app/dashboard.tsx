"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

type Verification = "official" | "reported-observation" | "media-report";
type Item = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  category: string;
  priority: number;
  japanRelated: boolean;
  official: boolean;
  english?: boolean;
  image?: string;
  socialPost?: boolean;
  verification?: Verification;
  verificationLabel?: string;
  verificationNote?: string;
};
type Coverage = { id: string; label: string; ok: number; total: number };
type Feed = {
  generatedAt: string;
  mode: "live" | "snapshot";
  items: Item[];
  sources: {
    ok: number;
    failed: number;
    total: number;
    failedNames?: string[];
    coverage?: Coverage[];
    capabilities?: { truthSocial?: boolean; xDirect?: boolean };
  };
};
type SourceFilter = { id: string; label: string; terms: string[] };
type DeskMode = "attention" | "early" | "unreviewed" | "all";
type SignalTier = "critical" | "review" | "monitor";

const EMPTY_DATE = new Date(0).toISOString();
const REVIEWED_STORAGE_KEY = "jpus-osint-reviewed-v1";
const fallback: Feed = {
  generatedAt: EMPTY_DATE,
  mode: "snapshot",
  sources: { ok: 0, failed: 0, total: 0 },
  items: [],
};

const categories = ["すべて", "日米関係", "首脳・閣僚", "外交・安保", "通商・経済", "議会・政治", "公式発表"];
const windows = [
  { label: "24時間", value: 1 },
  { label: "3日", value: 3 },
  { label: "7日", value: 7 },
  { label: "30日", value: 30 },
  { label: "すべて", value: 0 },
];
const deskModes: Array<{ id: DeskMode; label: string }> = [
  { id: "attention", label: "要確認" },
  { id: "early", label: "報道前候補" },
  { id: "unreviewed", label: "未確認" },
  { id: "all", label: "すべて" },
];
const sourceFilters: SourceFilter[] = [
  { id: "social", label: "公式SNS", terms: ["truth social", "x ·", "公開検索 ·"] },
  { id: "congress", label: "米議員・議会", terms: ["senator", "representative", "congress", "senate", "house", "米連邦議員", "米議会"] },
  { id: "whitehouse", label: "White House", terms: ["white house", "whitehouse.gov", "potus"] },
  { id: "state", label: "State / Embassy", terms: ["state department", "department of state", "state.gov", "embassy", "大使館"] },
  { id: "defense", label: "Defense / USFJ", terms: ["defense", "pentagon", "war.gov", "pacom", "7th fleet", "usfj", "mod.go.jp", "防衛省"] },
  { id: "economic", label: "通商・財務・商務", terms: ["treasury", "ustr", "trade representative", "commerce", "bis", "mof.go.jp", "meti.go.jp", "財務省", "経済産業省"] },
  { id: "japan", label: "日本政府", terms: ["首相官邸", "kantei", "内閣官房", "外務省", "mofa", "防衛省", "日本政府"] },
  { id: "media", label: "主要報道", terms: ["reuters", "ロイター", "ap", "bloomberg", "nhk", "共同", "時事", "new york times", "washington post", "wsj", "politico"] },
];

const warMemoryPattern =
  /hiroshima|nagasaki|hibakusha|atomic bomb(?:ing)?|nuclear abolition|v-?j day|pacific war|world war ii|japan(?:ese)? surrender|end of war|広島|長崎|被爆者|原爆|核廃絶|太平洋戦争|第二次世界大戦|終戦|日本降伏/i;
const lawmakerPattern =
  /\b(?:u\.?s\.? senator|senator|u\.?s\.? representative|representative|congress(?:man|woman)|member of congress|senate|house of representatives)\b|米上院議員|米下院議員|米国議員|米議員|米議会|上院|下院/i;
const securityPattern =
  /alliance|indo-pacific|security|defen[cs]e|military|base|okinawa|taiwan|china|missile|nuclear|同盟|インド太平洋|安全保障|防衛|軍事|基地|沖縄|台湾|中国|ミサイル|核/i;
const economyPattern =
  /trade|tariff|sanction|export control|semiconductor|investment|currency|supply chain|通商|貿易|関税|制裁|輸出管理|半導体|投資|為替|サプライチェーン/i;
const personnelPattern =
  /resign|dismiss|nomination|confirm|appoint|辞任|解任|更迭|指名|承認|人事/i;

const watchlists = [
  {
    id: "war-memory",
    label: "原爆・戦争認識",
    test: (item: Item) => warMemoryPattern.test(itemText(item)),
  },
  {
    id: "lawmakers",
    label: "米議員発言",
    test: (item: Item) => lawmakerPattern.test(itemText(item)),
  },
  {
    id: "official-social",
    label: "公式SNS",
    test: (item: Item) => Boolean(item.socialPost) || /truth social|^x ·|公開検索 ·/i.test(item.source),
  },
  {
    id: "security",
    label: "同盟・安保",
    test: (item: Item) => securityPattern.test(itemText(item)),
  },
  {
    id: "economy",
    label: "通商・制裁",
    test: (item: Item) => economyPattern.test(itemText(item)),
  },
  {
    id: "personnel",
    label: "人事・辞任",
    test: (item: Item) => personnelPattern.test(itemText(item)),
  },
];

const tagRules: Array<[string, RegExp]> = [
  ["原爆・戦争認識", warMemoryPattern],
  ["米議会", lawmakerPattern],
  ["日米", /japan|japanese|日米|日本|在日米軍/i],
  ["通商", /trade|tariff|関税|通商|輸出|import|export/i],
  ["安保", /security|defen[cs]e|military|安全保障|防衛|軍事|同盟/i],
  ["中国", /china|chinese|中国|習近平/i],
  ["台湾", /taiwan|台湾/i],
  ["制裁", /sanction|制裁|ofac/i],
  ["技術", /technology|tech|半導体|semiconductor|ai\b|cyber/i],
  ["外交", /summit|meeting|visit|会談|訪問|外交|首脳/i],
  ["公式SNS", /truth social|^x ·|social media|sns|投稿/i],
];

function itemText(item: Item) {
  return `${item.title} ${item.summary} ${item.source}`;
}

function tagsFor(item: Item) {
  const text = itemText(item);
  const tags = tagRules.filter(([, rule]) => rule.test(text)).map(([tag]) => tag);
  if (item.official) tags.unshift("一次情報");
  return [...new Set(tags)].slice(0, 5);
}

function relativeTime(value: string, now: number) {
  if (!now) return "時刻を計算中";
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 1_440)}日前`;
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exactTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function sourceMatches(item: Item, filter: SourceFilter) {
  const text = itemText(item).toLowerCase();
  return filter.terms.some((term) => text.includes(term.toLowerCase()));
}

function isEarlySignal(item: Item) {
  return Boolean(item.socialPost) || item.official || item.verification === "reported-observation";
}

function signalTier(item: Item): SignalTier {
  const text = itemText(item);
  const highConsequence = warMemoryPattern.test(text)
    || personnelPattern.test(text)
    || /attack|strike|missile|nuclear|tariff|sanction|emergency|攻撃|ミサイル|核|関税|制裁|緊急/i.test(text);
  if (item.priority >= 90 || (item.priority >= 84 && isEarlySignal(item) && highConsequence)) return "critical";
  if (item.priority >= 80 || (isEarlySignal(item) && item.japanRelated)) return "review";
  return "monitor";
}

function tierLabel(tier: SignalTier) {
  if (tier === "critical") return "今すぐ確認";
  if (tier === "review") return "要確認";
  return "監視";
}

function verificationLabel(item: Item) {
  if (item.verificationLabel) return item.verificationLabel;
  if (item.socialPost) return "公式SNS";
  if (item.official) return "一次情報";
  if (item.verification === "reported-observation") return "報道・観測";
  return "報道";
}

export default function Dashboard() {
  const [feed, setFeed] = useState<Feed>(fallback);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [days, setDays] = useState(7);
  const [sort, setSort] = useState<"priority" | "time">("priority");
  const [deskMode, setDeskMode] = useState<DeskMode>("all");
  const [selectedWatch, setSelectedWatch] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [now, setNow] = useState(0);
  const [copiedId, setCopiedId] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const hasItems = useRef(false);
  const deferredQuery = useDeferredValue(query);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/feed?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("live feed unavailable");
      const next = await response.json() as Feed;
      if (!next.items.length && next.sources.ok === 0) throw new Error("live feed empty");
      setFeed(next);
      hasItems.current = next.items.length > 0;
      setLastRefresh(new Date());
      setNow(Date.now());
    } catch {
      if (!hasItems.current) {
        try {
          const snapshot = await fetch("/data/feed.json", { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("snapshot unavailable");
            return response.json();
          }) as Feed;
          setFeed({ ...snapshot, mode: "snapshot" });
          hasItems.current = snapshot.items.length > 0;
          setLastRefresh(new Date());
          setNow(Date.now());
          setLoadError("ライブ取得に接続できないため、直近の保存データを表示しています。");
        } catch {
          setLoadError("情報を取得できません。時間をおいて更新してください。");
        }
      } else {
        setLoadError("最新情報の取得に失敗しました。表示中の情報は保持しています。");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let storedReviewed: string[] = [];
    try {
      const stored = JSON.parse(window.localStorage.getItem(REVIEWED_STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) storedReviewed = stored.filter((value) => typeof value === "string");
    } catch {
      // A blocked or malformed local preference must not block the monitoring desk.
    }
    const restoreReviewed = window.setTimeout(() => setReviewed(new Set(storedReviewed)), 0);
    const initial = window.setTimeout(() => refresh(), 0);
    const timer = window.setInterval(() => refresh(true), 110_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const key = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(restoreReviewed);
      clearTimeout(initial);
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("keydown", key);
    };
  }, [refresh]);

  const translate = useCallback(async (item: Item) => {
    if (translations[item.id]) {
      setTranslations((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      return;
    }
    setTranslating((current) => ({ ...current, [item.id]: true }));
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: [item.title, item.summary].filter(Boolean).join("\n\n") }),
      });
      const data = await response.json() as { translation?: string };
      if (!response.ok || !data.translation) throw new Error();
      setTranslations((current) => ({ ...current, [item.id]: data.translation! }));
    } catch {
      setTranslations((current) => ({
        ...current,
        [item.id]: "仮訳を取得できませんでした。",
      }));
    } finally {
      setTranslating((current) => ({ ...current, [item.id]: false }));
    }
  }, [translations]);

  const toggleReviewed = useCallback((id: string) => {
    setReviewed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(REVIEWED_STORAGE_KEY, JSON.stringify([...next].slice(-1_500)));
      } catch {
        // Review state remains usable in memory when storage is unavailable.
      }
      return next;
    });
  }, []);

  const copyLink = useCallback(async (item: Item) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => current === item.id ? "" : current), 1_600);
    } catch {
      setCopiedId("");
    }
  }, []);

  const scoped = useMemo(() => {
    const cutoff = days && now ? now - days * 86_400_000 : 0;
    const normalizedQuery = deferredQuery.toLowerCase().trim();
    const watch = watchlists.find((item) => item.id === selectedWatch);
    return feed.items.filter((item) => {
      const text = `${itemText(item)} ${tagsFor(item).join(" ")}`.toLowerCase();
      return (!normalizedQuery || text.includes(normalizedQuery))
        && (category === "すべて" || item.category === category)
        && (!watch || watch.test(item))
        && (!selectedSources.length || sourceFilters.some((filter) => selectedSources.includes(filter.id) && sourceMatches(item, filter)))
        && (!cutoff || new Date(item.publishedAt).getTime() >= cutoff);
    });
  }, [feed.items, deferredQuery, category, selectedWatch, selectedSources, days, now]);

  const filtered = useMemo(() => {
    return scoped
      .filter((item) => {
        if (deskMode === "attention") return signalTier(item) !== "monitor" && !reviewed.has(item.id);
        if (deskMode === "early") return isEarlySignal(item) && !reviewed.has(item.id);
        if (deskMode === "unreviewed") return !reviewed.has(item.id);
        return true;
      })
      .sort((left, right) => sort === "priority"
        ? right.priority - left.priority || +new Date(right.publishedAt) - +new Date(left.publishedAt)
        : +new Date(right.publishedAt) - +new Date(left.publishedAt) || right.priority - left.priority);
  }, [scoped, deskMode, reviewed, sort]);

  const counts = useMemo(() => ({
    attention: scoped.filter((item) => signalTier(item) !== "monitor" && !reviewed.has(item.id)).length,
    early: scoped.filter((item) => isEarlySignal(item) && !reviewed.has(item.id)).length,
    unreviewed: scoped.filter((item) => !reviewed.has(item.id)).length,
    all: scoped.length,
    critical: scoped.filter((item) => signalTier(item) === "critical" && !reviewed.has(item.id)).length,
  }), [scoped, reviewed]);

  const healthPercent = feed.sources.total ? Math.round(feed.sources.ok / feed.sources.total * 100) : 0;
  const activeFilterCount = selectedSources.length + Number(Boolean(selectedWatch)) + Number(category !== "すべて") + Number(Boolean(query));
  const toggleSource = (id: string) => setSelectedSources((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const resetFilters = () => {
    setSelectedSources([]);
    setSelectedWatch("");
    setCategory("すべて");
    setQuery("");
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">JP</span>
            <strong>JPUS OSINT</strong>
          </div>
          <div className="system-status" aria-live="polite">
            <span className={`pulse ${loading ? "loading" : ""}`} />
            <b>{loading ? "更新中" : feed.mode === "snapshot" ? "保存データ" : "LIVE"}</b>
            <span>{feed.sources.ok}/{feed.sources.total || "—"}経路</span>
            <span>{lastRefresh ? `${relativeTime(lastRefresh.toISOString(), now)}更新` : "起動中"}</span>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">JPUS OSINT / POLICY TIMELINE</p>
          <h1>日米政策OSINTタイムライン</h1>
        </div>
      </section>

      <section className="toolbar" aria-label="タイムライン操作">
        <div className="toolbar-main">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="人物・発言・政策・機関を検索　/ でフォーカス"
              aria-label="人物・発言・政策・機関を全文検索"
            />
            {query && <button type="button" className="clear-search" onClick={() => setQuery("")} aria-label="検索を消去">×</button>}
          </label>
          <div className="segmented" aria-label="並び順">
            <button type="button" className={sort === "priority" ? "active" : ""} onClick={() => setSort("priority")}>判断優先</button>
            <button type="button" className={sort === "time" ? "active" : ""} onClick={() => setSort("time")}>新着順</button>
          </div>
          <label className="period">
            期間
            <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {windows.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}
            </select>
          </label>
          <button type="button" className="refresh" onClick={() => refresh()} disabled={loading}>↻ 更新</button>
          <a className="export-link" href="/api/feed?format=csv" download>CSV</a>
        </div>
        <div className="category-row">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {loadError && <div className="service-notice" role="status">{loadError}</div>}

      <section className="workspace">
        <aside className="filter-sidebar">
          <section className="panel queue-panel">
            <PanelHeading label="確認キュー" count={counts[deskMode]} />
            <div className="desk-modes">
              {deskModes.map((mode) => (
                <button
                  type="button"
                  key={mode.id}
                  className={deskMode === mode.id ? "active" : ""}
                  onClick={() => setDeskMode(mode.id)}
                >
                  <span>{mode.label}</span>
                  <b>{counts[mode.id]}</b>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelHeading label="重点ウォッチ" count={selectedWatch ? 1 : undefined} />
            <div className="watchlist">
              {watchlists.map((watch) => (
                <button
                  type="button"
                  key={watch.id}
                  className={selectedWatch === watch.id ? "active" : ""}
                  onClick={() => setSelectedWatch((current) => current === watch.id ? "" : watch.id)}
                >
                  <span>{watch.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel source-panel">
            <PanelHeading label="発信元" count={selectedSources.length || undefined} />
            <div className="source-list">
              <button type="button" className={!selectedSources.length ? "active" : ""} onClick={() => setSelectedSources([])}>
                <span>すべて</span><b>{feed.items.length}</b>
              </button>
              {sourceFilters.map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  className={selectedSources.includes(filter.id) ? "active" : ""}
                  onClick={() => toggleSource(filter.id)}
                >
                  <span>{filter.label}</span>
                  <b>{feed.items.filter((item) => sourceMatches(item, filter)).length}</b>
                </button>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button type="button" className="reset-filters" onClick={resetFilters}>
                条件をすべて解除
              </button>
            )}
          </section>

          <section className="coverage-card">
            <div>
              <span>監視経路</span>
              <strong>{healthPercent}%</strong>
            </div>
            {feed.sources.failed > 0 && (
              <details>
                <summary>{feed.sources.failed}経路で取得失敗</summary>
                <p>{feed.sources.failedNames?.join("、")}</p>
              </details>
            )}
          </section>
        </aside>

        <section className="timeline-panel panel">
          <div className="timeline-heading">
            <div>
              <span className="live-dot" />
              <div>
                <strong>{deskModes.find((mode) => mode.id === deskMode)?.label}</strong>
              </div>
            </div>
            <span>{filtered.length}件</span>
          </div>
          {loading && !feed.items.length && <TimelineSkeleton />}
          {!loading && !filtered.length && (
            <div className="empty">
              <strong>該当情報はありません</strong>
            </div>
          )}
          <div className="timeline-list">
            {filtered.map((item, index) => {
              const previous = filtered[index - 1];
              const showDate = !previous || dateLabel(previous.publishedAt) !== dateLabel(item.publishedAt);
              return (
                <div key={item.id}>
                  {showDate && <div className="timeline-date"><span>{dateLabel(item.publishedAt)} · JST</span></div>}
                  <SignalCard
                    item={item}
                    now={now}
                    reviewed={reviewed.has(item.id)}
                    copied={copiedId === item.id}
                    translation={translations[item.id]}
                    translating={Boolean(translating[item.id])}
                    onTranslate={() => translate(item)}
                    onReviewed={() => toggleReviewed(item.id)}
                    onCopy={() => copyLink(item)}
                    onTag={(tag) => {
                      const matchingWatch = watchlists.find((watch) => watch.label === tag);
                      if (matchingWatch) setSelectedWatch(matchingWatch.id);
                      setDeskMode("all");
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </section>

      <footer>
        <span>JPUS OSINT</span>
        <span>取得 {feed.generatedAt === EMPTY_DATE ? "—" : exactTime(feed.generatedAt)} JST · {feed.sources.ok}/{feed.sources.total || "—"}経路</span>
      </footer>
    </main>
  );
}

function PanelHeading({ label, count }: { label: string; count?: number }) {
  return (
    <div className="panel-heading">
      <strong>{label}</strong>
      {typeof count === "number" && <span>{count}</span>}
    </div>
  );
}

function SignalCard({
  item,
  now,
  reviewed,
  copied,
  translation,
  translating,
  onTranslate,
  onReviewed,
  onCopy,
  onTag,
}: {
  item: Item;
  now: number;
  reviewed: boolean;
  copied: boolean;
  translation?: string;
  translating: boolean;
  onTranslate: () => void;
  onReviewed: () => void;
  onCopy: () => void;
  onTag: (tag: string) => void;
}) {
  const tier = signalTier(item);
  const tags = tagsFor(item);
  const early = isEarlySignal(item);
  return (
    <article className={`signal-card tier-${tier} ${reviewed ? "reviewed" : ""}`}>
      <div className="signal-time">
        <time dateTime={item.publishedAt}>{shortTime(item.publishedAt)}</time>
        <span>{relativeTime(item.publishedAt, now)}</span>
        <small>JST</small>
      </div>
      <div className="signal-content">
        <div className="signal-badges">
          <span className={`tier-badge ${tier}`}>{tierLabel(tier)}</span>
          {early && <span className="early-badge">報道前候補</span>}
          <span className="verification-badge">{verificationLabel(item)}</span>
          {item.japanRelated && <span className="japan-badge">日本関連</span>}
          <span className="category-label">{item.category}</span>
          <span className="priority-score">判断スコア {item.priority}</span>
        </div>
        <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
        {item.summary && <p className="signal-summary">{item.summary}</p>}
        {translation && (
          <div className="translation-box">
            <b>機械仮訳</b>
            <p>{translation}</p>
          </div>
        )}
        <div className="signal-footer">
          <div className="source-block">
            <span className="source-name">{item.source}</span>
            <span className="exact-time">公表 {exactTime(item.publishedAt)} JST</span>
          </div>
          <div className="card-actions">
            <a className="primary-action" href={item.url} target="_blank" rel="noreferrer">原文を開く ↗</a>
            {item.english && (
              <button type="button" onClick={onTranslate} disabled={translating}>
                {translating ? "翻訳中…" : translation ? "仮訳を閉じる" : "仮訳"}
              </button>
            )}
            <button type="button" onClick={onCopy}>{copied ? "コピー済み" : "URLコピー"}</button>
            <button type="button" className={reviewed ? "reviewed-action" : ""} onClick={onReviewed}>
              {reviewed ? "未確認に戻す" : "確認済みにする"}
            </button>
          </div>
        </div>
        <div className="item-tags">
          {tags.map((tag) => <button type="button" key={tag} onClick={() => onTag(tag)}>{tag}</button>)}
        </div>
      </div>
    </article>
  );
}

function TimelineSkeleton() {
  return (
    <div className="timeline-skeleton" aria-label="政策情報を収集中">
      {[0, 1, 2].map((item) => (
        <div key={item}>
          <span />
          <div><i /><i /><i /></div>
        </div>
      ))}
    </div>
  );
}
