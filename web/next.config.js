/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://wetrust-frontend.onrender.com/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
