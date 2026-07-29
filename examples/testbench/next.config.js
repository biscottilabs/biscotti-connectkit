/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pino (via @walletconnect/logger) lazily requires pino-pretty, which is an
    // optional dev-only transport. It is never installed, so exclude it from the
    // bundle rather than letting webpack report it as unresolved.
    config.externals.push('pino-pretty');
    return config;
  },
};

module.exports = nextConfig;
