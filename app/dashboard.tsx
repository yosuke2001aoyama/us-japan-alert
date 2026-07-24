"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string; title: string; url: string; source: string; publishedAt: string; summary: string;
  category: string; priority: number; japanRelated: boolean; official: boolean; english?: boolean; image?: string;
  socialPost?: boolean; verificationLabel?: string;
};
type Feed = {
  generatedAt: string; mode: "live" | "snapshot"; items: Item[];
  sources: { ok: number; failed: number; total: number; failedNames?: string[]; coverage?: Array<{ id: string; label: string; ok: number; total: number }> };
};
type SourceFilter = { id: string; label: string; terms: string[] };

const EMPTY_DATE = new Date(0).toISOString();
const fallback: Feed = { generatedAt: EMPTY_DATE, mode: "snapshot", sources: { ok: 0, failed: 0, total: 0 }, items: [] };
const categories = ["すべて", "日米関係", "首脳・閣僚", "外交・安保", "通商・経済", "議会・政治", "公式発表"];
const windows = [{ label: "24時間", value: 1 }, { label: "3日", value: 3 }, { label: "7日", value: 7 }, { label: "30日", value: 30 }, { label: "すべて", value: 0 }];
const sourceFilters: SourceFilter[] = [
  { id: "trump", label: "Trump / Truth", terms: ["trump", "truth social", "realdonaldtrump"] },
  { id: "whitehouse", label: "White House", terms: ["white house", "whitehouse.gov", "potus"] },
  { id: "state", label: "State", terms: ["state department", "department of state", "state.gov", "secrubio"] },
  { id: "defense", label: "Defense", terms: ["defense", "pentagon", "war.gov", "pacom", "7th fleet", "mod.go.jp", "防衛省"] },
  { id: "treasury", label: "Treasury", terms: ["treasury", "mof.go.jp", "財務省"] },
  { id: "ustr", label: "USTR / Commerce", terms: ["ustr", "trade representative", "commerce", "meti.go.jp", "経済産業省"] },
  { id: "kantei", label: "官邸", terms: ["首相官邸", "kantei", "内閣官房"] },
  { id: "mofa", label: "外務省", terms: ["mofa", "外務省", "ministry of foreign affairs"] },
  { id: "media", label: "主要報道", terms: ["reuters", "ロイター", "ap", "bloomberg", "nhk", "共同", "時事", "new york times", "washington post", "wsj", "politico"] },
];

const tagRules: Array<[string, RegExp]> = [
  ["Japan", /japan|japanese|日米|日本|在日米軍/i], ["Trade", /trade|tariff|関税|通商|輸出|import|export/i],
  ["Security", /security|defen[cs]e|military|安全保障|防衛|軍事|同盟/i], ["China", /china|chinese|中国|習近平/i],
  ["Taiwan", /taiwan|台湾/i], ["Sanctions", /sanction|制裁|ofac/i], ["Technology", /technology|tech|半導体|semiconductor|ai\b|cyber/i],
  ["Diplomacy", /summit|meeting|visit|会談|訪問|外交|首脳/i], ["Congress", /congress|senate|house|国会|議会/i],
  ["Indo-Pacific", /indo-pacific|インド太平洋|quad/i], ["Ukraine", /ukraine|ウクライナ/i], ["Middle East", /iran|israel|gaza|lebanon|イラン|イスラエル|ガザ/i],
  ["Social", /truth social|x ·|social media|sns|投稿/i],
];

function tagsFor(item: Item) {
  const text = `${item.title} ${item.summary} ${item.source}`;
  const tags = tagRules.filter(([, rule]) => rule.test(text)).map(([tag]) => tag);
  if (item.official) tags.unshift("Official");
  return [...new Set(tags)].slice(0, 5);
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "たった今"; if (minutes < 60) return `${minutes}分前`; if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`; return `${Math.floor(minutes / 1440)}日前`;
}
function shortTime(value: string) { return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }); }
function dateLabel(value: string) { return new Date(value).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }); }
function sourceMatches(item: Item, filter: SourceFilter) { const text = `${item.source} ${item.title}`.toLowerCase(); return filter.terms.some((term) => text.includes(term.toLowerCase())); }

export default function Dashboard() {
  const [feed, setFeed] = useState<Feed>(fallback);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [days, setDays] = useState(7);
  const [sort, setSort] = useState<"time" | "priority">("time");
  const [japanOnly, setJapanOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [now, setNow] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasLiveItems = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/feed?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const next = await res.json() as Feed;
      if (!next.items.length && next.sources.ok === 0) throw new Error();
      setFeed(next); hasLiveItems.current = next.items.length > 0; setLastRefresh(new Date()); setNow(Date.now());
    } catch {
      if (!hasLiveItems.current) try { const snapshot = await fetch("/data/feed.json", { cache: "no-store" }).then((r) => r.json()) as Feed; setFeed(snapshot); hasLiveItems.current = snapshot.items.length > 0; } catch {}
    } finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => refresh(), 0);
    const timer = window.setInterval(() => refresh(true), 110_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const key = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", key);
    return () => { clearTimeout(initial); clearInterval(timer); clearInterval(clock); window.removeEventListener("keydown", key); };
  }, [refresh]);

  const filtered = useMemo(() => {
    const cutoff = days && now ? now - days * 86_400_000 : 0;
    const q = query.toLowerCase().trim();
    return feed.items.filter((item) => {
      const tags = tagsFor(item);
      return (!q || `${item.title} ${item.summary} ${item.source} ${tags.join(" ")}`.toLowerCase().includes(q))
        && (category === "すべて" || item.category === category)
        && (!japanOnly || item.japanRelated)
        && (!officialOnly || item.official)
        && (!selectedTag || tags.includes(selectedTag))
        && (!selectedSources.length || sourceFilters.some((f) => selectedSources.includes(f.id) && sourceMatches(item, f)))
        && (!cutoff || new Date(item.publishedAt).getTime() >= cutoff);
    }).sort((a, b) => sort === "priority" ? b.priority - a.priority || +new Date(b.publishedAt) - +new Date(a.publishedAt) : +new Date(b.publishedAt) - +new Date(a.publishedAt) || b.priority - a.priority);
  }, [feed.items, query, category, japanOnly, officialOnly, selectedSources, selectedTag, days, sort, now]);

  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    feed.items.forEach((item) => tagsFor(item).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [feed.items]);
  const important = filtered.filter((item) => item.priority >= 80).length;
  const healthPercent = feed.sources.total ? Math.round((feed.sources.ok / feed.sources.total) * 100) : 0;
  const toggleSource = (id: string) => setSelectedSources((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const resetFilters = () => { setSelectedSources([]); setSelectedTag(""); setCategory("すべて"); setJapanOnly(false); setOfficialOnly(false); setQuery(""); };

  return <main className="shell">
    <header className="topbar"><div className="topbar-inner">
      <div className="brand"><span className="mark">日米</span><div><strong>日米公開情報bot</strong><small>JP / US PUBLIC INFORMATION</small></div></div>
      <div className="system-status"><span className={`pulse ${loading ? "loading" : ""}`} />{loading ? "更新中" : "LIVE"}<span className="divider" />{feed.sources.ok}/{feed.sources.total || "—"}経路<span className="divider" />{lastRefresh ? `${relativeTime(lastRefresh.toISOString())}更新` : "起動中"}</div>
    </div></header>

    <section className="command-bar compact-command"><div className="command-title"><p>PUBLIC INFORMATION MONITOR</p><h1>政策実務向けライブ・タイムライン</h1><span>一次情報、主要報道、公式SNSを時系列で横断監視</span></div>
      <div className="command-metrics"><div><b>{important}</b><span>重要案件</span></div><div><b>{filtered.length}</b><span>表示件数</span></div><div><b>{feed.items.filter((x) => x.official).length}</b><span>一次情報</span></div><div><b>{healthPercent}%</b><span>取得稼働率</span></div></div>
    </section>

    <section className="toolbar sticky-tools"><div className="toolbar-main">
      <label className="search"><span>⌕</span><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="人物・政策・機関・タグを全文検索（/ でフォーカス）" />{query && <button className="clear-search" onClick={() => setQuery("")}>×</button>}</label>
      <div className="segmented"><button className={sort === "time" ? "active" : ""} onClick={() => setSort("time")}>時系列</button><button className={sort === "priority" ? "active" : ""} onClick={() => setSort("priority")}>重要度</button></div>
      <label className="period">期間<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{windows.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></label>
      <button className="refresh" onClick={() => refresh()} disabled={loading}>↻ 更新</button>
    </div><div className="toolbar-secondary"><div className="chips">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="toggles"><label><input type="checkbox" checked={japanOnly} onChange={(e) => setJapanOnly(e.target.checked)} />日本関連</label><label><input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />一次情報</label></div></div></section>

    <section className="workspace">
      <aside className="filter-sidebar panel"><PanelHeading label="発信元フィルタ" count={selectedSources.length || undefined} />
        <div className="filter-section"><button className={`source-option ${!selectedSources.length ? "active" : ""}`} onClick={() => setSelectedSources([])}><span>ALL SOURCES</span><b>{feed.items.length}</b></button>
          {sourceFilters.map((filter) => { const count = feed.items.filter((item) => sourceMatches(item, filter)).length; return <button key={filter.id} className={`source-option ${selectedSources.includes(filter.id) ? "active" : ""}`} onClick={() => toggleSource(filter.id)}><span>{filter.label}</span><b>{count}</b></button>; })}
        </div>
        <PanelHeading label="スマートタグ" count={popularTags.length} /><div className="tag-cloud">{popularTags.map(([tag, count]) => <button key={tag} className={selectedTag === tag ? "active" : ""} onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}>{tag}<span>{count}</span></button>)}</div>
        <button className="reset-filters" onClick={resetFilters}>フィルタをすべて解除</button>
      </aside>

      <section className="timeline-panel panel"><PanelHeading label="ライブ・タイムライン" count={filtered.length} live />
        {loading && !feed.items.length && <div className="empty">政策情報を収集中…</div>}
        {!loading && !filtered.length && <div className="empty">該当情報がありません。フィルタを解除してください。</div>}
        <div className="timeline-list">{filtered.map((item, index) => {
          const previous = filtered[index - 1]; const showDate = !previous || dateLabel(previous.publishedAt) !== dateLabel(item.publishedAt);
          return <div key={item.id}>{showDate && <div className="timeline-date"><span>{dateLabel(item.publishedAt)}</span></div>}<TimelineItem item={item} onTag={setSelectedTag} /></div>;
        })}</div>
      </section>

      <aside className="status-sidebar"><section className="panel"><PanelHeading label="システム稼働" /><div className="health-body"><div className="health-score"><strong>{feed.sources.ok}</strong><span>/ {feed.sources.total || "—"} 経路</span></div><div className="health-track"><i style={{ width: `${healthPercent}%` }} /></div><div className="health-row"><span>正常</span><b>{feed.sources.ok}</b></div><div className="health-row"><span>失敗</span><b className={feed.sources.failed ? "warn" : ""}>{feed.sources.failed}</b></div><div className="health-row"><span>最終取得</span><b>{feed.generatedAt === EMPTY_DATE ? "—" : shortTime(feed.generatedAt)}</b></div>{feed.sources.failedNames?.length ? <details><summary>失敗経路</summary><p>{feed.sources.failedNames.join("、")}</p></details> : null}</div></section>
        <section className="panel monitor-note"><b>表示ルール</b><p>タグは見出し・要旨・発信元から自動付与。重要度と分類は補助情報のため、起案時は原文を確認してください。</p></section>
      </aside>
    </section>
    <footer><span>日米公開情報bot</span><span>取得 {feed.generatedAt === EMPTY_DATE ? "—" : shortTime(feed.generatedAt)} · {feed.sources.ok}/{feed.sources.total || "—"}経路</span><span>公開URL: us-japan-alert.vercel.app</span></footer>
  </main>;
}

function PanelHeading({ label, count, live = false }: { label: string; count?: number; live?: boolean }) { return <div className="panel-heading"><div>{live && <span className="live-dot" />}{label}</div>{typeof count === "number" && <span>{count}</span>}</div>; }
function TimelineItem({ item, onTag }: { item: Item; onTag: (tag: string) => void }) {
  const tags = tagsFor(item); const urgent = item.priority >= 80;
  return <article className={`timeline-item ${urgent ? "urgent" : ""}`}>
    <div className="timeline-time"><time>{shortTime(item.publishedAt)}</time><small>{relativeTime(item.publishedAt)}</small><i /></div>
    <div className="timeline-card"><div className="timeline-meta"><b className={urgent ? "hot" : ""}>{item.priority}</b>{item.official && <span className="official-label">一次情報</span>}{item.japanRelated && <span className="jp-label">日本関連</span>}<span>{item.category}</span></div>
      <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>{item.summary && <p>{item.summary}</p>}
      <div className="timeline-bottom"><a href={item.url} target="_blank" rel="noreferrer" className="timeline-source">{item.source}<span>原文 ↗</span></a><div className="item-tags">{tags.map((tag) => <button key={tag} onClick={() => onTag(tag)}>{tag}</button>)}</div></div>
    </div>
  </article>;
}
