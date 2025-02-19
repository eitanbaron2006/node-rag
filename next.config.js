/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
  experimental: {},
  webpack(config) {
    config.experiments = { ...config.experiments, topLevelAwait: true }
    return config
  }
};

export default nextConfig;