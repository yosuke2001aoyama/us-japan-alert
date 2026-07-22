"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

type Feed = {
  generatedAt: string;
  mode: "live" | "snapshot";
  items: Item[];
  sources: { ok: number; failed: number; total: number };
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

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/feed?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("feed unavailable");
      setFeed(await res.json());
      setLastRefresh(new Date());
      setNow(Date.now());
    } catch {
      if (!feed.items.length) {
        try { setFeed(await fetch("/data/feed.json", { cache: "no-store" }).then((res) => res.json())); } catch { /* keep empty state */ }
      }
    } finally { if (!quiet) setLoading(false); }
  }, [feed.items.length]);

  useEffect(() => {
    const initial = window.setTimeout(() => refresh(), 0);
    const timer = window.setInterval(() => refresh(true), 120_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
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

  const important = filtered.filter((item) => item.priority >= 80).length;
  const japanCount = filtered.filter((item) => item.japanRelated).length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="mark">JP</span><div><strong>JPUS ALERT</strong><small>米国・日米関係 政策速報</small></div></div>
          <div className="system-status"><span className={`pulse ${loading ? "loading" : ""}`} />{loading ? "更新中" : "LIVE"}<span className="divider" />2分ごとに自動更新</div>
        </div>
      </header>

      <section className="briefing">
        <div className="brief-copy">
          <p className="eyebrow">EXECUTIVE POLICY MONITOR</p>
          <h1>日米政策の動きを、<br />意思決定の速さで。</h1>
          <p>首脳・閣僚、同盟・安保、通商、制裁、議会、重要人事。日本政府の局長・課長級がフォローすべき公開情報に限定して表示します。</p>
        </div>
        <div className="metrics" aria-label="表示中の概要">
          <div><b>{important}</b><span>重要案件</span></div>
          <div><b>{japanCount}</b><span>日本関連</span></div>
          <div><b>{filtered.length}</b><span>表示件数</span></div>
        </div>
      </section>

      <section className="toolbar" aria-label="絞り込みと並べ替え">
        <div className="toolbar-row">
          <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="人物・政策・機関を検索" /></label>
          <div className="segmented" aria-label="並べ替え">
            <button className={sort === "time" ? "active" : ""} onClick={() => setSort("time")}>時系列順</button>
            <button className={sort === "priority" ? "active" : ""} onClick={() => setSort("priority")}>重要度順</button>
          </div>
          <label className="period">期間<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{windows.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></label>
          <button className="refresh" onClick={() => refresh()} disabled={loading}>↻ 更新</button>
        </div>
        <div className="toolbar-row secondary">
          <div className="chips">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="toggles">
            <label><input type="checkbox" checked={japanOnly} onChange={(e) => setJapanOnly(e.target.checked)} />日本関連のみ</label>
            <label><input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />一次情報のみ</label>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="stream">
          <div className="section-title"><div><span className="live-dot" />LATEST INTELLIGENCE</div><span>{filtered.length}件</span></div>
          {loading && !feed.items.length && <div className="empty">政策情報を収集中…</div>}
          {!loading && filtered.length === 0 && <div className="empty">この条件に該当する重要情報はありません。</div>}
          {filtered.map((item) => <Story key={item.id} item={item} />)}
        </div>

        <aside>
          <div className="aside-card criteria">
            <div className="aside-title">掲載基準</div>
            <p>「公表されたか」ではなく、政策判断・対外説明・幹部報告に必要かで選別。</p>
            <div className="rule"><span>日米首脳・閣僚</span><b>最優先</b></div>
            <div className="rule"><span>同盟・安保・通商</span><b>優先</b></div>
            <div className="rule"><span>訪米観測・議員発言</span><b>対象</b></div>
            <div className="rule muted"><span>領事・在留・定例広報</span><b>除外</b></div>
          </div>
          <div className="aside-card">
            <div className="aside-title">主な監視対象</div>
            <ul><li>日米政府・議会の一次情報</li><li>首脳・閣僚・主要議員の発信</li><li>日米の主要紙・通信・TV</li><li>重要シンクタンク・政策媒体</li></ul>
          </div>
          <a className="export" href="/api/feed?format=csv">CSVを出力 <span>↗</span></a>
          <p className="updated">最終取得 {feed.generatedAt === EMPTY_DATE ? "待機中" : new Date(feed.generatedAt).toLocaleString("ja-JP")}<br />画面更新 {lastRefresh ? lastRefresh.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—"}<br />{feed.sources.ok}/{feed.sources.total || "—"} 経路正常</p>
        </aside>
      </section>
      <footer><span>JPUS ALERT</span> 公開情報を自動収集・整理しています。政策判断には必ず原文をご確認ください。</footer>
    </main>
  );
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

  return (
    <article className={`story ${urgent ? "urgent" : ""}`}>
      <div className="story-rail"><span>{item.priority}</span><small>重要度</small></div>
      <div className="story-body">
        <div className="meta">
          {urgent && <b className="urgent-label">重要</b>}{item.japanRelated && <b className="jp-label">日本関連</b>}{item.official && <b className="official-label">一次情報</b>}
          <span>{item.category}</span><span>·</span><time dateTime={item.publishedAt}>{relativeTime(item.publishedAt)}</time>
        </div>
        <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h2>
        {item.summary && <p>{item.summary}</p>}
        {translationOpen && <div className="translation" aria-live="polite"><b>仮訳</b>{translating ? <span>翻訳中…</span> : <p>{translation}</p>}<small>見出し・要旨の機械翻訳です。</small></div>}
        <div className="story-footer">
          <a className="source-link" href={item.url} target="_blank" rel="noreferrer"><span>{item.source.slice(0, 2).toUpperCase()}</span>{item.source}<i>原文 ↗</i></a>
          {item.english && <button className="translate-button" onClick={toggleTranslation}>{translationOpen ? "仮訳を閉じる" : "仮訳"}</button>}
        </div>
      </div>
    </article>
  );
}
