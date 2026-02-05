/** @type {import("next").NextConfig} */
const nextConfig = {
  i18n: {
    locales: ["it", "en"],
    defaultLocale: "it",
    localeDetection: false,
  },

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



