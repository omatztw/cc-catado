/** @type {import('next').NextConfig} */
const nextConfig = {
  // WebSocketサーバーは別プロセスで動作するため、
  // Next.jsはクライアントアプリケーションのみを担当
  reactStrictMode: true,
  experimental: {
    // サーバーコンポーネントでの外部パッケージ最適化
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
