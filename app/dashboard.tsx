"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
};

type Feed = {
  generatedAt: string;
  mode: "live" | "snapshot";
  items: Item[];
  sources: {
    ok: number;
    failed: number;
    total: number;
    failedNames?: string[];
    coverage?: Array<{ id: string; label: string; ok: number; total: number }>;
  };
};

const EMPTY_DATE = new Date(0).toISOString();
const fallback: Feed = { generatedAt: EMPTY_DATE, mode: "snapshot", sources: { ok: 0, failed: 0, total: 0 }, items: [] };
const categories = ["すべて", "日米関係", "首脳・閣僚", "外交・安保", "通商・経済", "議会・政治", "公式発表"];
const windows = [
  { label: "24時間", value: 1 },
  { label: "3日", value: 3 },
  { label: "7日", value: 7 },
  { label: "30日", value: 30 },
  { label: "すべて", value: 0 },
];

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 1440)}日前`;
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const [feed, setFeed] = useState<Feed>(fallback);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [days, setDays] = useState(7);
  const [sort, setSort] = useState<"time" | "priority">("time");
  const [japanOnly, setJapanOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [now, setNow] = useState(0);
  const hasLiveItems = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/feed?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("feed unavailable");
      const next = await res.json() as Feed;
      if (!next.items.length && next.sources.ok === 0) throw new Error("all live sources unavailable");
      setFeed(next);
      hasLiveItems.current = next.items.length > 0;
      setLastRefresh(new Date());
      setNow(Date.now());
    } catch {
      if (!hasLiveItems.current) {
        try {
          const snapshot = await fetch("/data/feed.json", { cache: "no-store" }).then((res) => res.json()) as Feed;
          setFeed(snapshot);
          hasLiveItems.current = snapshot.items.length > 0;
        } catch { /* keep empty state */ }
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => refresh(), 0);
    const timer = window.setInterval(() => refresh(true), 110_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const cutoff = days && now ? now - days * 86_400_000 : 0;
    const q = query.toLowerCase().trim();
    return feed.items.filter((item) =>
      (!q || `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(q)) &&
      (category === "すべて" || item.category === category) &&
      (!japanOnly || item.japanRelated) &&
      (!officialOnly || item.official) &&
      (!cutoff || new Date(item.publishedAt).getTime() >= cutoff)
    ).sort((a, b) => sort === "priority"
      ? b.priority - a.priority || +new Date(b.publishedAt) - +new Date(a.publishedAt)
      : +new Date(b.publishedAt) - +new Date(a.publishedAt) || b.priority - a.priority);
  }, [feed.items, query, category, japanOnly, officialOnly, days, sort, now]);

  const priorityItems = useMemo(() => [...filtered].sort((a, b) => b.priority - a.priority || +new Date(b.publishedAt) - +new Date(a.publishedAt)).slice(0, 7), [filtered]);
  const officialItems = filtered.filter((item) => item.official).slice(0, 6);
  const important = filtered.filter((item) => item.priority >= 80).length;
  const japanCount = filtered.filter((item) => item.japanRelated).length;
  const lead = filtered[0];
  const streamItems = filtered.slice(1);
  const healthPercent = feed.sources.total ? Math.round((feed.sources.ok / feed.sources.total) * 100) : 0;

  return (
    <main className="shell" data-generated-at={feed.generatedAt}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="mark">日米</span><div><strong>日米公開情報bot</strong><small>JP / US PUBLIC INFORMATION</small></div></div>
          <div className="system-status"><span className={`pulse ${loading ? "loading" : ""}`} />{loading ? "更新中" : "LIVE"}<span className="divider" />2分以内に自動更新</div>
        </div>
      </header>

      <section className="command-bar">
        <div className="command-title">
          <p>PUBLIC INFORMATION MONITOR</p>
          <h1>日米公開情報bot</h1>
          <span>首脳・閣僚、同盟・安保、通商、制裁、議会、重要人事</span>
        </div>
        <div className="command-metrics" aria-label="表示中の概要">
          <div><b>{important}</b><span>重要案件</span></div>
          <div><b>{japanCount}</b><span>日本関連</span></div>
          <div><b>{filtered.length}</b><span>表示件数</span></div>
          <div><b>{healthPercent}%</b><span>取得稼働率</span></div>
        </div>
      </section>

      <section className="toolbar" aria-label="絞り込みと並べ替え">
        <div className="toolbar-main">
          <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="人物・政策・機関を検索" /></label>
          <div className="segmented" aria-label="並べ替え">
            <button className={sort === "time" ? "active" : ""} onClick={() => setSort("time")}>時系列</button>
            <button className={sort === "priority" ? "active" : ""} onClick={() => setSort("priority")}>重要度</button>
          </div>
          <label className="period">期間<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{windows.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></label>
          <button className="refresh" onClick={() => refresh()} disabled={loading}>↻ 更新</button>
        </div>
        <div className="toolbar-secondary">
          <div className="chips">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="toggles">
            <label><input type="checkbox" checked={japanOnly} onChange={(e) => setJapanOnly(e.target.checked)} />日本関連のみ</label>
            <label><input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />一次情報のみ</label>
          </div>
        </div>
      </section>

      <section className="console">
        <aside className="priority-panel panel">
          <PanelHeading label="優先確認" count={priorityItems.length} />
          <div className="priority-list">
            {priorityItems.map((item, index) => <PriorityItem key={item.id} item={item} rank={index + 1} />)}
            {!priorityItems.length && <div className="panel-empty">該当案件なし</div>}
          </div>
        </aside>

        <section className="main-feed panel">
          <PanelHeading label="最新フィード" count={filtered.length} live />
          {loading && !feed.items.length && <div className="empty">政策情報を収集中…</div>}
          {!loading && filtered.length === 0 && <div className="empty">この条件に該当する重要情報はありません。</div>}
          {lead && <LeadStory item={lead} />}
          <div className="story-list">{streamItems.map((item) => <Story key={item.id} item={item} />)}</div>
        </section>

        <aside className="intel-column">
          <section className="panel official-panel">
            <PanelHeading label="一次情報速報" count={officialItems.length} />
            <div className="ticker-list">
              {officialItems.map((item) => <TickerItem key={item.id} item={item} />)}
              {!officialItems.length && <div className="panel-empty">一次情報なし</div>}
            </div>
          </section>

          <section className="panel health-panel">
            <PanelHeading label="システム稼働" />
            <div className="health-body">
              <div className="health-score"><strong>{feed.sources.ok}</strong><span>/ {feed.sources.total || "—"} 経路</span></div>
              <div className="health-track"><i style={{ width: `${healthPercent}%` }} /></div>
              <div className="health-row"><span>正常</span><b>{feed.sources.ok}</b></div>
              <div className="health-row"><span>失敗</span><b className={feed.sources.failed ? "warn" : ""}>{feed.sources.failed}</b></div>
              <div className="health-row"><span>取得時刻</span><b>{feed.generatedAt === EMPTY_DATE ? "—" : shortTime(feed.generatedAt)}</b></div>
              {feed.sources.failedNames?.length ? <details><summary>失敗経路を表示</summary><p>{feed.sources.failedNames.join("、")}</p></details> : null}
            </div>
          </section>

          <section className="panel monitor-note">
            <b>運用上の注意</b>
            <p>要約・分類・重要度は補助情報です。政策判断や起案には必ずリンク先の原文をご確認ください。</p>
          </section>
        </aside>
      </section>

      <footer>
        <span>日米公開情報bot</span>
        <span>取得 {feed.generatedAt === EMPTY_DATE ? "—" : shortTime(feed.generatedAt)} · {feed.sources.ok}/{feed.sources.total || "—"}経路</span>
        <span>画面更新 {lastRefresh ? lastRefresh.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
      </footer>
    </main>
  );
}

function PanelHeading({ label, count, live = false }: { label: string; count?: number; live?: boolean }) {
  return <div className="panel-heading"><div>{live && <span className="live-dot" />}{label}</div>{typeof count === "number" && <span>{count}</span>}</div>;
}

function PriorityItem({ item, rank }: { item: Item; rank: number }) {
  return <a className="priority-item" href={item.url} target="_blank" rel="noreferrer">
    <span className="priority-rank">{String(rank).padStart(2, "0")}</span>
    <div><div className="priority-meta"><b className={item.priority >= 80 ? "hot" : ""}>{item.priority}</b><span>{item.category}</span><time>{relativeTime(item.publishedAt)}</time></div><h3>{item.title}</h3><small>{item.source}</small></div>
  </a>;
}

function TickerItem({ item }: { item: Item }) {
  return <a className="ticker-item" href={item.url} target="_blank" rel="noreferrer"><time>{shortTime(item.publishedAt)}</time><div><h3>{item.title}</h3><span>{item.source}</span></div></a>;
}

function Visual({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  if (item.image && !failed) return <div className="visual"><img src={item.image} alt="" onError={() => setFailed(true)} /></div>;
  return <div className="visual fallback" aria-hidden="true"><span>{item.source.slice(0, 2).toUpperCase()}</span><small>{item.category}</small></div>;
}

function LeadStory({ item }: { item: Item }) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translating, setTranslating] = useState(false);

  async function toggleTranslation() {
    if (translationOpen) return setTranslationOpen(false);
    setTranslationOpen(true);
    if (translation !== null) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: [item.title, item.summary].filter(Boolean).join("\n\n") }) });
      if (!res.ok) throw new Error();
      setTranslation((await res.json()).translation || "仮訳を取得できませんでした。");
    } catch { setTranslation("仮訳を取得できませんでした。原文をご確認ください。"); }
    finally { setTranslating(false); }
  }

  return <article className="lead-story">
    <a className="lead-visual-link" href={item.url} target="_blank" rel="noreferrer"><Visual item={item} /></a>
    <div className="lead-content">
      <div className="meta">{item.priority >= 80 && <b className="urgent-label">重要</b>}{item.japanRelated && <b className="jp-label">日本関連</b>}{item.official && <b className="official-label">一次情報</b>}<span>{item.category}</span><time>{relativeTime(item.publishedAt)}</time></div>
      <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
      {item.summary && <p>{item.summary}</p>}
      {translationOpen && <Translation text={translation} translating={translating} />}
      <div className="lead-actions"><a href={item.url} target="_blank" rel="noreferrer">{item.source}<span>原文を読む ↗</span></a>{item.english && <button className="translate-button" onClick={toggleTranslation}>{translationOpen ? "仮訳を閉じる" : "仮訳"}</button>}</div>
    </div>
  </article>;
}

function Story({ item }: { item: Item }) {
  const urgent = item.priority >= 80;
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translating, setTranslating] = useState(false);

  async function toggleTranslation() {
    if (translationOpen) return setTranslationOpen(false);
    setTranslationOpen(true);
    if (translation !== null) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: [item.title, item.summary].filter(Boolean).join("\n\n") }) });
      if (!res.ok) throw new Error();
      setTranslation((await res.json()).translation || "仮訳を取得できませんでした。");
    } catch { setTranslation("仮訳を取得できませんでした。原文をご確認ください。"); }
    finally { setTranslating(false); }
  }

  return <article className={`story ${urgent ? "urgent" : ""}`}>
    <div className="story-score"><span>{item.priority}</span><small>PRI</small></div>
    <div className="story-body">
      <div className="meta">{urgent && <b className="urgent-label">重要</b>}{item.japanRelated && <b className="jp-label">日本関連</b>}{item.official && <b className="official-label">一次情報</b>}<span>{item.category}</span><time>{relativeTime(item.publishedAt)}</time></div>
      <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
      {item.summary && <p>{item.summary}</p>}
      {translationOpen && <Translation text={translation} translating={translating} />}
      <div className="story-footer"><a className="source-link" href={item.url} target="_blank" rel="noreferrer"><span>{item.source.slice(0, 2).toUpperCase()}</span>{item.source}<i>原文 ↗</i></a>{item.english && <button className="translate-button" onClick={toggleTranslation}>{translationOpen ? "仮訳を閉じる" : "仮訳"}</button>}</div>
    </div>
  </article>;
}

function Translation({ text, translating }: { text: string | null; translating: boolean }) {
  return <div className="translation" aria-live="polite"><b>仮訳</b>{translating ? <span>翻訳中…</span> : <p>{text}</p>}<small>見出し・要旨の機械翻訳です。</small></div>;
}
