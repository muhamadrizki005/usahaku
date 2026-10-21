/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
