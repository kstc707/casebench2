const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: trace server files from the repo root, so content outside apps/web can be read at build time.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

module.exports = nextConfig;
