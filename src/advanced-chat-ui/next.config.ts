import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: ['@lancedb/lancedb'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure lancedb is treated as an external commonjs module
      config.externals = [
        ...(config.externals || []),
        { '@lancedb/lancedb': 'commonjs @lancedb/lancedb' },
      ];

      // This is an alternative way to add the .node loader if the above doesn't work alone
      // or if serverComponentsExternalPackages isn't fully handling .node files.
      // However, serverComponentsExternalPackages should ideally make this unnecessary.
      // Keeping it commented out for now as the primary issue seems to be CJS/ESM interop.
      // config.module.rules.push({
      //   test: /\.node$/,
      //   use: [
      //     {
      //       loader: 'nextjs-node-loader', // This loader is deprecated, example only
      //       options: {
      //         flags: os.constants.dlopen.RTLD_NOW, // Requires import os
      //       },
      //     },
      //   ],
      // });
    }
    return config;
  },
  /* other config options can go here */
};

export default nextConfig;
