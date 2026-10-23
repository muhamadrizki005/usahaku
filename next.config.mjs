/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: process.cwd() },
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
