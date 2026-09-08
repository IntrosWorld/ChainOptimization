import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  ...(process.env.VERCEL === '1' ? { output: 'export' as const } : {}),
};

export default nextConfig;
