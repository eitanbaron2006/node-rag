/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp', 'onnxruntime-node','tesseract.js'],
  experimental: {},
  webpack(config) {
    config.experiments = { ...config.experiments, topLevelAwait: true }
    return config
  }
};

export default nextConfig;