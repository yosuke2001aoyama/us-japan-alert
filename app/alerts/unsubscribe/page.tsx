import type { Metadata } from "next";
import Link from "next/link";
import AlertTokenAction from "../../components/alert-token-action";

export const metadata: Metadata = { title: "速報メール解除 | JPUS OSINT", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="token-page">
      <section>
        <span>JPUS OSINT</span>
        <h1>速報メール解除</h1>
        <AlertTokenAction token={token} mode="unsubscribe" />
        <Link href="/">タイムラインへ戻る</Link>
      </section>
    </main>
  );
}
