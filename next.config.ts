import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // pino resolves its transports at runtime; keep it out of the server bundle. The Agent SDK
  // finds its Claude Code binary relative to its own files, so it must stay a real package.
  serverExternalPackages: ['pino', 'pg', '@anthropic-ai/claude-agent-sdk'],
  // The SDK resolves that binary (an optional, per-platform package) at runtime, which file
  // tracing can't see: copy it into the standalone output explicitly.
  outputFileTracingIncludes: {
    // Route keys are globs, so `*` stands for the dynamic segment (brackets would be a class).
    '/api/notebooks/*/agent': [
      './node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-linux*/node_modules/@anthropic-ai/*/**/*',
      './node_modules/.pnpm/@anthropic-ai+claude-agent-sdk@*/node_modules/@anthropic-ai/claude-agent-sdk-linux*',
    ],
  },
  // Pasted Source text can fill the whole token cap (~80K tokens), well past the 1 MB default.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // The proxy buffers request bodies up to this size; PDF uploads go up to 10 MB plus the multipart envelope.
    proxyClientMaxBodySize: '11mb',
  },
};

export default nextConfig;
