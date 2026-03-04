import type { NextConfig } from 'next';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // API proxy — /api/* → NestJS backend
  async rewrites() {
    return [
      {
        source:      '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },

  images: {
    remotePatterns: [
      // Salon logo CDN'i (production'da güncellenir)
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
