"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type Feed = {
  generatedAt: string;
  mode: "live" | "snapshot";
  items: Item[];
  sources: { ok: number; failed: number; total: number };
};

const fallback: Feed = {
  generatedAt: new Date(0).toISOString(),
  mode: "snapshot",
  sources: { ok: 0, failed: 0, total: 0 },
  items: [],
};

const categories = ["すべて", "日米関係", "外交・安保", "政治", "経済", "公式発表"];

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 1440)}日前`;
}

export default function Dashboard() {
  const [feed, setFeed] = useState<Feed>(fallback);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("すべて");
  const [japanOnly, setJapanOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);

  useEffect(() => {
    fetch("/api/feed", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("feed unavailable")))
      .then(setFeed)
      .catch(() => fetch("/data/feed.json").then((res) => res.json()).then(setFeed).catch(() => undefined))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => feed.items.filter((item) => {
    const q = query.toLowerCase().trim();
    return (!q || `${item.title} ${item.summary} ${item.source}`.toLowerCase().includes(q))
      && (category === "すべて" || item.category === category)
      && (!japanOnly || item.japanRelated)
      && (!officialOnly || item.official);
  }), [feed.items, query, category, japanOnly, officialOnly]);

  const urgent = filtered.filter((item) => item.priority >= 80);
  const normal = filtered.filter((item) => item.priority < 80);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">J/U</span>
          <div><strong>JPUS ALERT</strong><small>米国・日米関係速報</small></div>
        </div>
        <div className="system-status">
          <span className={`pulse ${loading ? "loading" : ""}`} />
          {loading ? "収集中" : "監視稼働中"}
          <span className="divider" />
          {feed.sources.ok}/{feed.sources.total || "—"} 経路正常
        </div>
      </header>

      <section className="briefing">
        <div>
          <p className="eyebrow">SITUATION ROOM / OPEN SOURCE</p>
          <h1>いま、日米で何が動いたか。</h1>
          <p>主要報道・公式発表・要人発信を横断し、日本関連は原則通知。その他は重大度で選別します。</p>
        </div>
        <div className="metrics">
          <div><b>{urgent.length}</b><span>重要速報</span></div>
          <div><b>{feed.items.filter((x) => x.japanRelated).length}</b><span>日本関連</span></div>
          <div><b>{feed.items.filter((x) => x.official).length}</b><span>一次情報</span></div>
        </div>
      </section>

      <section className="controls" aria-label="絞り込み">
        <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="人物・政策・機関を検索" /></label>
        <div className="chips">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <div className="toggles">
          <label><input type="checkbox" checked={japanOnly} onChange={(e) => setJapanOnly(e.target.checked)} />日本関連のみ</label>
          <label><input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />一次情報のみ</label>
        </div>
      </section>

      <section className="content-grid">
        <div className="stream">
          <div className="section-title"><div><span className="live-dot" />LIVE INTELLIGENCE</div><span>{filtered.length}件</span></div>
          {loading && <div className="empty">各ソースから最新情報を収集中…</div>}
          {!loading && filtered.length === 0 && <div className="empty">条件に一致する速報はありません。</div>}
          {urgent.map((item) => <Story key={item.id} item={item} urgent />)}
          {normal.map((item) => <Story key={item.id} item={item} />)}
        </div>

        <aside>
          <div className="aside-card watch">
            <div className="aside-title">監視ルール</div>
            <div className="rule"><span>日本関連</span><b>原則すべて</b></div>
            <div className="rule"><span>公式発表</span><b>優先</b></div>
            <div className="rule"><span>その他</span><b>重大度 80+</b></div>
          </div>
          <div className="aside-card">
            <div className="aside-title">主な監視対象</div>
            <ul>
              <li>White House / State / DoD</li>
              <li>Truth Social・要人発信</li>
              <li>米主要紙・通信・TV・政治媒体</li>
              <li>日本の全国紙・通信・TV・経済紙</li>
            </ul>
          </div>
          <a className="export" href="/api/feed?format=csv">CSVを出力 <span>↗</span></a>
          <p className="updated">最終更新<br />{feed.generatedAt === new Date(0).toISOString() ? "取得待ち" : new Date(feed.generatedAt).toLocaleString("ja-JP")}</p>
        </aside>
      </section>

      <footer>JPUS Alert · 公開情報を自動整理。原文と発表主体を必ず確認してください。</footer>
    </main>
  );
}

function Story({ item, urgent = false }: { item: Item; urgent?: boolean }) {
  return (
    <article className={`story ${urgent ? "urgent" : ""}`}>
      <div className="story-rail"><span>{item.priority}</span></div>
      <div className="story-body">
        <div className="meta">
          {urgent && <b className="urgent-label">重要</b>}
          {item.japanRelated && <b className="jp-label">日本関連</b>}
          {item.official && <b className="official-label">一次情報</b>}
          <span>{item.category}</span><span>·</span><span>{relativeTime(item.publishedAt)}</span>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer"><h2>{item.title}</h2></a>
        {item.summary && <p>{item.summary}</p>}
        <div className="source"><span>{item.source.slice(0, 2).toUpperCase()}</span>{item.source}</div>
      </div>
    </article>
  );
}
