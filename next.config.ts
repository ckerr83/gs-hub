import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Assets stay with their module, including in traced production deployments.
  outputFileTracingIncludes: {
    "/wine-database/images/*": [
      "./src/modules/wine-database/assets/images/**/*",
    ],
    "/wine-library/images/*": [
      "./src/modules/wine-database/assets/images/**/*",
    ],
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
