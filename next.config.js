/** @type {import('next').NextConfig} */
const nextConfig = {
  // Redirect root to /trawler (remove this block to show full site)
  // Access full site with ?dev=1
  async redirects() {
    return [
      {
        source: '/',
        destination: '/trawler',
        permanent: false,
        missing: [
          {
            type: 'query',
            key: 'dev',
          },
        ],
      },
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude native node modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        bufferutil: false,
        'utf-8-validate': false,
      };
    }

    // Ignore native dependencies that can't be bundled
    config.externals = config.externals || [];
    config.externals.push('bufferutil', 'utf-8-validate');

    // Add rule to ignore .node files
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    return config;
  },
}
module.exports = nextConfig
