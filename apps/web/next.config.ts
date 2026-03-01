import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Next.js 15 React 19 uyumluluğu
    // reactCompiler: true,  // babel-plugin-react-compiler hazır olduğunda aktif edilecek
  },
  // API proxy — development'ta CORS sorununu önler
  async rewrites() {
    return [
      {
        source:      '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
