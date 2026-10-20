/** @type {import('next').NextConfig} */
export default {
  // the gateway code uses NodeNext-style "./x.js" imports of .ts files
  webpack: (config) => { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mjs', '.mts'] }; return config; },
  serverExternalPackages: ['fastify', '@fastify/cors', '@fastify/helmet', '@fastify/rate-limit', 'postgres', 'pdf-lib', 'qrcode', 'pino'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
