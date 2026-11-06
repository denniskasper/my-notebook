import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // pino resolves its transports at runtime; keep it out of the server bundle.
  serverExternalPackages: ['pino', 'pg'],
};

export default nextConfig;
