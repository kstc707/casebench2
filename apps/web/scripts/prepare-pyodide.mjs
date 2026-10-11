// The scikit-learn track runs scikit-learn's own tests in the student's browser with Pyodide (Python
// compiled to WebAssembly). This script self-hosts exactly the Pyodide files that needs, with no CDN and
// no PyPI, at the version the tasks were checked with:
//
// 1. gets the Pyodide 314.0.7 release tarball from GitHub once (into a local cache, or from a path you
//    give it) and refuses it unless its SHA-256 matches the pin below;
// 2. extracts only the core files and the packages scikit-learn, its tests and pytest need (worked out
//    from pyodide-lock.json), checking each core file against its pin and each package against the
//    SHA-256 the lock file lists;
// 3. copies them to public/pyodide/314.0.7/ (gitignored);
// 4. copies our test runner (scripts/runner-worker.mjs and lib/runner/runner.py) to public/pyodide/,
//    every time, so edits to them reach the browser.
//
// A second run checks the files already in public/pyodide/314.0.7/ and, if they all match, touches
// neither the network nor the tarball.
//
// Usage (from apps/web):
//   NODE_USE_ENV_PROXY=1 node scripts/prepare-pyodide.mjs              (`pnpm pyodide` does this)
//   node scripts/prepare-pyodide.mjs --tarball /path/to/pyodide-314.0.7.tar.bz2
//   PYODIDE_TARBALL=/path/to/pyodide-314.0.7.tar.bz2 node scripts/prepare-pyodide.mjs
// PYODIDE_CACHE_DIR changes where a downloaded tarball is kept (default: apps/web/.cache/pyodide).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PYODIDE_VERSION = "314.0.7";
export const TARBALL_NAME = `pyodide-${PYODIDE_VERSION}.tar.bz2`;
export const TARBALL_URL = `https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/${TARBALL_NAME}`;
export const TARBALL_SHA256 = "192b5864e6e6d30ab074861af800cb8b4acb0998ef0f9342c3367448aeb86645";

// Pyodide's core files and their SHA-256, taken from the pinned tarball above (the lock file doesn't
// list them). pyodide-lock.json is pinned too, because it holds every package's SHA-256.
export const CORE_FILES = {
  "pyodide.mjs": "6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109",
  "pyodide.asm.mjs": "f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635",
  "pyodide.asm.wasm": "cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6",
  "python_stdlib.zip": "fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a",
  "pyodide-lock.json": "5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010",
};

/** What the test runner loads; everything they depend on comes with them. */
export const ROOT_PACKAGES = ["scikit-learn", "scikit-learn-tests", "pytest"];

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

/**
 * The packages to self-host: the root packages plus everything they depend on, following `depends` in
 * pyodide-lock.json. Sorted by name. Throws if a package is missing from the lock file.
 * @param {{ packages: Record<string, { file_name: string; sha256: string; depends: string[] }> }} lock
 * @param {string[]} roots
 * @returns {{ name: string; file: string; sha256: string }[]}
 */
export function packagesNeeded(lock, roots = ROOT_PACKAGES) {
  const seen = new Map();
  const todo = [...roots];
  while (todo.length) {
    const name = todo.pop();
    if (seen.has(name)) continue;
    const pkg = lock.packages[name];
    if (!pkg) throw new Error(`pyodide-lock.json has no package "${name}"`);
    seen.set(name, { name, file: pkg.file_name, sha256: pkg.sha256 });
    todo.push(...pkg.depends);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Explains a Node file-system error in plain words, naming the path. */
export function explain(what, file, err) {
  const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
  const why =
    code === "ENOENT" ? "it (or a folder above it) doesn't exist" :
    code === "EACCES" || code === "EPERM" ? "permission denied" :
    code === "EISDIR" ? "it is a folder, not a file" :
    code === "ENOTDIR" ? "a part of the path is a file, not a folder" :
    code === "ENOSPC" ? "the disk is full" :
    String(err instanceof Error ? err.message : err);
  return new Error(`Couldn't ${what} ${file}: ${why}`);
}

/** Runs a file-system step, turning a raw Node error into one that names the path and the problem. */
async function onFile(what, file, step) {
  try {
    return await step();
  } catch (err) {
    throw err && typeof err === "object" && "code" in err ? explain(what, file, err) : err;
  }
}

/** SHA-256 of a file, streamed (the tarball is 337 MB). */
export async function sha256File(file) {
  return onFile("read", file, async () => {
    const hash = createHash("sha256");
    await pipeline(createReadStream(file), hash);
    return hash.digest("hex");
  });
}

const exists = (p) => stat(p).then(() => true, () => false);

/** True when the file exists and its SHA-256 is the expected one. */
export async function fileMatches(file, expected) {
  return (await exists(file)) && (await sha256File(file)) === expected;
}

/** Throws unless the file's SHA-256 is the expected one. */
export async function assertSha256(file, expected) {
  const actual = await sha256File(file);
  if (actual !== expected) {
    throw new Error(`${path.basename(file)}: SHA-256 is ${actual}, expected ${expected}; refusing it`);
  }
}

/**
 * Downloads url to dest, keeping it only if its SHA-256 matches. The download goes to dest + ".part"
 * first, so a cut-off or wrong download never looks like a finished one.
 */
export async function download(url, dest, expectedSha256, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`Downloading ${url}: HTTP ${res.status}`);
  const part = dest + ".part";
  await onFile("create the download folder", path.dirname(dest), () => mkdir(path.dirname(dest), { recursive: true }));
  await onFile("write", part, () => pipeline(Readable.fromWeb(res.body), createWriteStream(part)));
  try {
    await assertSha256(part, expectedSha256);
  } catch (err) {
    await rm(part, { force: true });
    throw err;
  }
  await rename(part, dest);
}

/** Extracts the named members of a .tar.bz2 (paths inside the archive) into dir, with the system `tar`. */
function extract(tarball, members, dir) {
  return new Promise((resolve, reject) => {
    const tar = spawn("tar", ["-xjf", tarball, "-C", dir, ...members], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    tar.stderr.on("data", (d) => (err += d));
    tar.on("error", (e) => reject(e && e.code === "ENOENT" ? new Error("The system `tar` command wasn't found; it's needed to unpack the Pyodide tarball") : e));
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}: ${err.trim()}`))));
  });
}

/**
 * Removes anything in outDir that isn't one of the expected files: everything there is served publicly,
 * so a stray file must not linger.
 */
async function removeExtras(outDir, expected, log) {
  const keep = new Set(expected);
  for (const name of (await readdir(outDir)).sort()) {
    if (keep.has(name)) continue;
    await rm(path.join(outDir, name), { recursive: true, force: true });
    log(`pyodide: removed ${name}, which isn't part of the pinned release`);
  }
}

/** The verified tarball's path: the one given, else the cached one, else a fresh download. */
async function obtainTarball({ tarball, cacheDir, log, fetchImpl, tarballSha256 }) {
  if (tarball) return tarball; // checked at the start of preparePyodide

  const cached = path.join(cacheDir, TARBALL_NAME);
  if (await fileMatches(cached, tarballSha256)) {
    log(`pyodide: using the cached ${cached}`);
    return cached;
  }
  log(`pyodide: downloading ${TARBALL_URL} (about 337 MB, once)`);
  await download(TARBALL_URL, cached, tarballSha256, fetchImpl);
  log(`pyodide: downloaded and checked ${cached}`);
  return cached;
}

/** Every file that should be in the output folder, with its SHA-256, or null if the lock file isn't there yet. */
async function expectedFiles(dir, coreFiles) {
  const lockFile = path.join(dir, "pyodide-lock.json");
  if (!(await fileMatches(lockFile, coreFiles["pyodide-lock.json"]))) return null;
  const lock = JSON.parse(await readFile(lockFile, "utf8"));
  return [
    ...Object.entries(coreFiles).map(([file, sha256]) => ({ file, sha256 })),
    ...packagesNeeded(lock).map(({ file, sha256 }) => ({ file, sha256 })),
  ];
}

/**
 * Makes outDir (public/pyodide/<version>) hold exactly-pinned Pyodide core files and packages.
 * Returns what it did: "already prepared" or "prepared".
 * The pins (tarballSha256, coreFiles) default to the real ones; tests pass their own for a tiny fake release.
 * @param {{ outDir?: string; cacheDir?: string; tarball?: string; log?: (msg: string) => void; fetchImpl?: typeof fetch;
 *   tarballSha256?: string; coreFiles?: Record<string, string> }} [options]
 */
export async function preparePyodide({
  outDir = path.join(appDir, "public/pyodide", PYODIDE_VERSION),
  cacheDir = process.env.PYODIDE_CACHE_DIR || path.join(appDir, ".cache/pyodide"),
  tarball = undefined,
  log = console.log,
  fetchImpl = fetch,
  tarballSha256 = TARBALL_SHA256,
  coreFiles = CORE_FILES,
} = {}) {
  if (!coreFiles["pyodide-lock.json"]) throw new Error("coreFiles must pin pyodide-lock.json");
  // A tarball you name is always checked, even when nothing needs it, so a wrong path or file is never
  // silently ignored.
  if (tarball) {
    await assertSha256(tarball, tarballSha256);
    log(`pyodide: ${tarball} is the pinned release (SHA-256 matches)`);
  }
  const want = await expectedFiles(outDir, coreFiles);
  if (want) {
    const ok = await Promise.all(want.map((f) => fileMatches(path.join(outDir, f.file), f.sha256)));
    if (ok.every(Boolean)) {
      await removeExtras(outDir, want.map((f) => f.file), log);
      log(`pyodide: ${PYODIDE_VERSION} already prepared in ${path.relative(process.cwd(), outDir) || "."} (${want.length} files checked)`);
      return "already prepared";
    }
  }

  const source = await obtainTarball({ tarball, cacheDir, log, fetchImpl, tarballSha256 });
  const tmp = await mkdtemp(path.join(os.tmpdir(), "casebench2-pyodide-"));
  try {
    // First the core files (the lock file says which packages we need), then the packages.
    log("pyodide: extracting the core files (decompresses the whole tarball; can take a minute)");
    await extract(source, Object.keys(coreFiles).map((f) => `pyodide/${f}`), tmp);
    for (const [file, sha256] of Object.entries(coreFiles)) await assertSha256(path.join(tmp, "pyodide", file), sha256);
    const lock = JSON.parse(await readFile(path.join(tmp, "pyodide", "pyodide-lock.json"), "utf8"));
    const packages = packagesNeeded(lock);
    log(`pyodide: extracting ${packages.length} packages`);
    await extract(source, packages.map((p) => `pyodide/${p.file}`), tmp);
    for (const p of packages) await assertSha256(path.join(tmp, "pyodide", p.file), p.sha256);

    await onFile("create the output folder", outDir, () => mkdir(outDir, { recursive: true }));
    const files = [...Object.keys(coreFiles), ...packages.map((p) => p.file)];
    for (const f of files) {
      await onFile("write", path.join(outDir, f), () => copyFile(path.join(tmp, "pyodide", f), path.join(outDir, f)));
    }
    await removeExtras(outDir, files, log);
    log(`pyodide: ${files.length} files checked and copied to ${path.relative(process.cwd(), outDir)}`);
    return "prepared";
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Copies the test runner (the module worker and the Python it loads) next to the versioned Pyodide folder. */
export async function copyRunner(dir = path.join(appDir, "public/pyodide"), log = console.log) {
  await mkdir(dir, { recursive: true });
  await copyFile(path.join(appDir, "scripts/runner-worker.mjs"), path.join(dir, "runner-worker.mjs"));
  await copyFile(path.join(appDir, "lib/runner/runner.py"), path.join(dir, "runner.py"));
  log("pyodide: copied the test runner (runner-worker.mjs, runner.py)");
}

/** --tarball <path> or PYODIDE_TARBALL. */
export function tarballFromArgs(argv, env) {
  const i = argv.indexOf("--tarball");
  if (i !== -1) {
    if (!argv[i + 1]) throw new Error("--tarball needs a path");
    return path.resolve(argv[i + 1]);
  }
  return env.PYODIDE_TARBALL ? path.resolve(env.PYODIDE_TARBALL) : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await preparePyodide({ tarball: tarballFromArgs(process.argv.slice(2), process.env) });
    await copyRunner();
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}
