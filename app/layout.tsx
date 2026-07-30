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
  const title = "日米政策OSINTタイムライン｜JPUS OSINT";
  const description = "日米の政府一次情報、公式SNS、主要報道を集約する政策OSINTタイムライン。";
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
      siteName: "JPUS OSINT",
      images: [{ url: image, width: 1734, height: 907, alt: "JPUS OSINT — 日米政策OSINTタイムライン" }],
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
