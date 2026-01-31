/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // For Netlify static export
  images: {
    unoptimized: true, // Required for static export
  },
  // Disable server components for full static export
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
