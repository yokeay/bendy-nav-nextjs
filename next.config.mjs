/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"]
};

export default nextConfig;
