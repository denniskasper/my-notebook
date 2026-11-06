import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // pino resolves its transports at runtime; keep it out of the server bundle.
  serverExternalPackages: ['pino', 'pg'],
  // Pasted Source text can fill the whole token cap (~80K tokens), well past the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default nextConfig;
