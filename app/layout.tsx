import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "カタド - カタン風ボードゲーム",
  description: "ブラウザで遊べるマルチプレイヤー型カタン風ボードゲーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
