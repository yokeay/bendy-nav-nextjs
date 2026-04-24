/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "138.199.165.36"],
  outputFileTracingIncludes: {
    "/**": [
      "./plugins/**/*",
      "./app/view/**/*"
    ]
  }
};

export default nextConfig;
