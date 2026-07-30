import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "us-japan-alert.vercel.app")
    .split(",")[0]
    .trim();
  const protocol = (requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https"))
    .split(",")[0]
    .trim();
  const origin = `${protocol}://${host}`;
  const title = "JPUS SIGNAL DESK｜日米政策シグナル監視";
  const description = "全米議員の公式発信・政府一次情報・公式SNS・主要報道を横断し、報道前に確認すべき日米政策シグナルを集約します。";
  const image = `${origin}/og.png`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: origin,
      locale: "ja_JP",
      siteName: "JPUS SIGNAL DESK",
      images: [{ url: image, width: 1734, height: 907, alt: "JPUS SIGNAL DESK — 重要発言を、ニュースになる前に。" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
