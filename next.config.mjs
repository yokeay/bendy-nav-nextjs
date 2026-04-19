/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  outputFileTracingIncludes: {
    "/**": [
      "./plugins/**/*",
      "./app/view/**/*"
    ]
  }
};

export default nextConfig;
