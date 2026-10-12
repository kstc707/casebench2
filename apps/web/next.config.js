const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: trace server files from the repo root, so content outside apps/web can be read at build time.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // The coach reuses the team librarian's passage splitter and BM25 search (TypeScript source).
  transpilePackages: ["@casebench2/team-memory"],
  // Pyodide's files (scripts/prepare-pyodide.mjs) live under a versioned folder and never change, so the
  // browser may keep them for a year: the 39 MB download happens once. Files outside the versioned
  // folder (our test runner) are cached normally, so a new deploy reaches students.
  async headers() {
    return [
      {
        source: "/pyodide/:version(\\d+\\.\\d+\\.\\d+)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = nextConfig;
