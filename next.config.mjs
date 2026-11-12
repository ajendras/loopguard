import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // App Router is enabled by default in Next.js 15.
  // Socket.io is handled via a dedicated API route that manages
  // the WebSocket upgrade. No additional experimental flags are
  // required for compatibility in a self-hosted environment.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/api/socket',
        headers: [
          {
            key: 'Connection',
            value: 'keep-alive, Upgrade',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
