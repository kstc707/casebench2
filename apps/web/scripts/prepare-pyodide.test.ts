import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSha256,
  CORE_FILES,
  download,
  explain,
  packagesNeeded,
  preparePyodide,
  tarballFromArgs,
  TARBALL_SHA256,
  TARBALL_URL,
} from "./prepare-pyodide.mjs";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const pkg = (file: string, depends: string[] = []) => ({ file_name: file, sha256: sha(file), depends });

describe("packagesNeeded", () => {
  const lock = {
    packages: {
      "scikit-learn": pkg("sk.whl", ["scipy", "joblib"]),
      "scikit-learn-tests": pkg("sk-tests.zip", ["scikit-learn"]),
      scipy: pkg("scipy.whl", ["numpy"]),
      numpy: pkg("numpy.whl"),
      joblib: pkg("joblib.whl"),
      pytest: pkg("pytest.whl", ["pluggy"]),
      pluggy: pkg("pluggy.whl"),
      pandas: pkg("pandas.whl", ["numpy"]),
    },
  };

  it("follows dependencies, lists each package once, sorted, and leaves out the rest", () => {
    const names = packagesNeeded(lock).map((p) => p.name);
    expect(names).toEqual(["joblib", "numpy", "pluggy", "pytest", "scikit-learn", "scikit-learn-tests", "scipy"]);
    expect(names).not.toContain("pandas");
    expect(packagesNeeded(lock)[0]).toEqual({ name: "joblib", file: "joblib.whl", sha256: sha("joblib.whl") });
  });

  it("refuses a lock file that is missing a dependency", () => {
    expect(() => packagesNeeded({ packages: { pytest: pkg("pytest.whl", ["pluggy"]) } }, ["pytest"])).toThrow(/no package "pluggy"/);
  });

  // The real lock file, when `pnpm pyodide` has been run: the plan's 18 packages, about 26 MB.
  const realLock = path.resolve(__dirname, "../public/pyodide/314.0.7/pyodide-lock.json");
  it.skipIf(!existsSync(realLock))("gives the 18 packages scikit-learn, its tests and pytest need (real lock file)", async () => {
    const packages = packagesNeeded(JSON.parse(await readFile(realLock, "utf8")));
    expect(packages.map((p) => p.name)).toEqual([
      "atomicwrites", "attrs", "exceptiongroup", "iniconfig", "joblib", "more-itertools", "numpy", "pluggy", "py",
      "pygments", "pyparsing", "pytest", "scikit-learn", "scikit-learn-tests", "scipy", "setuptools", "six", "threadpoolctl",
    ]);
    expect(packages.find((p) => p.name === "pytest")?.file).toBe("pytest-9.0.2-py3-none-any.whl");
  });
});

describe("SHA-256 pins", () => {
  let dir: string;
  let server: Server;
  let base: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "prepare-pyodide-test-"));
    server = createServer((req, res) => {
      if (req.url === "/file") res.end("the real bytes");
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("pins the release tarball from GitHub", () => {
    expect(TARBALL_URL).toBe("https://github.com/pyodide/pyodide/releases/download/314.0.7/pyodide-314.0.7.tar.bz2");
    expect(TARBALL_SHA256).toMatch(/^192b5864[0-9a-f]{48}aeb86645$/);
    expect(Object.keys(CORE_FILES)).toContain("pyodide-lock.json");
  });

  it("CI caches the tarball under the same SHA-256 the script pins", async () => {
    const ci = await readFile(path.resolve(__dirname, "../../../.github/workflows/ci.yml"), "utf8");
    expect(ci).toContain(`key: pyodide-tarball-${TARBALL_SHA256}`);
    expect(ci).toContain("path: apps/web/.cache/pyodide");
  });

  it("accepts a file whose SHA-256 matches and refuses one that doesn't", async () => {
    const f = path.join(dir, "a.whl");
    await writeFile(f, "hello");
    await expect(assertSha256(f, sha("hello"))).resolves.toBeUndefined();
    await expect(assertSha256(f, sha("tampered"))).rejects.toThrow(/a\.whl: SHA-256 is .*refusing it/);
  });

  it("keeps a download only when its SHA-256 matches, and leaves nothing behind when it doesn't", async () => {
    const good = path.join(dir, "good.bin");
    await download(`${base}/file`, good, sha("the real bytes"));
    expect(await readFile(good, "utf8")).toBe("the real bytes");

    const bad = path.join(dir, "bad.bin");
    await expect(download(`${base}/file`, bad, sha("other bytes"))).rejects.toThrow(/refusing it/);
    expect(existsSync(bad)).toBe(false);
    expect(existsSync(bad + ".part")).toBe(false);

    await expect(download(`${base}/missing`, path.join(dir, "x.bin"), sha(""))).rejects.toThrow(/HTTP 404/);
  });

  it("refuses a local tarball that isn't the pinned release", async () => {
    const fake = path.join(dir, "pyodide-314.0.7.tar.bz2");
    await writeFile(fake, "not the release");
    const out = path.join(dir, "out");
    await expect(preparePyodide({ outDir: out, tarball: fake, log: () => {} })).rejects.toThrow(/refusing it/);
    expect(existsSync(out)).toBe(false);
  });
});

describe("tarballFromArgs", () => {
  it("takes --tarball, then PYODIDE_TARBALL, else nothing (download)", () => {
    expect(tarballFromArgs(["--tarball", "/x/p.tar.bz2"], { PYODIDE_TARBALL: "/y" })).toBe("/x/p.tar.bz2");
    expect(tarballFromArgs([], { PYODIDE_TARBALL: "/y/p.tar.bz2" })).toBe("/y/p.tar.bz2");
    expect(tarballFromArgs([], {})).toBeUndefined();
    expect(() => tarballFromArgs(["--tarball"], {})).toThrow(/needs a path/);
  });
});

// End to end on a tiny fake release: a .tar.bz2 with the same layout as Pyodide's (pyodide/<file>),
// made with the system tar, and pins worked out from its bytes.
describe("preparePyodide on a fake release", () => {
  let dir: string;
  const noFetch = (() => {
    throw new Error("fetch must not be called");
  }) as unknown as typeof fetch;

  const lock = (shaOf: Record<string, string>) =>
    JSON.stringify({
      packages: {
        "scikit-learn": { file_name: "sk.whl", sha256: shaOf["sk.whl"], depends: ["scipy"] },
        "scikit-learn-tests": { file_name: "sk-tests.zip", sha256: shaOf["sk-tests.zip"], depends: ["scikit-learn"] },
        scipy: { file_name: "scipy.whl", sha256: shaOf["scipy.whl"], depends: [] },
        pytest: { file_name: "pytest.whl", sha256: shaOf["pytest.whl"], depends: [] },
        pandas: { file_name: "pandas.whl", sha256: shaOf["pandas.whl"], depends: [] },
      },
    });
  const packageBytes = { "sk.whl": "sk", "sk-tests.zip": "tests", "scipy.whl": "scipy", "pytest.whl": "pytest", "pandas.whl": "pandas" };

  /** Builds <name>.tar.bz2; `tamper` changes one file's bytes after the lock was written. Returns its path and pins. */
  async function fakeRelease(name: string, tamper: Record<string, string> = {}) {
    const root = path.join(dir, name);
    await mkdir(path.join(root, "pyodide"), { recursive: true });
    const lockText = lock(Object.fromEntries(Object.entries(packageBytes).map(([f, b]) => [f, sha(b)])));
    const files: Record<string, string> = { ...packageBytes, "pyodide.mjs": "export {}", "pyodide-lock.json": lockText, ...tamper };
    for (const [f, b] of Object.entries(files)) await writeFile(path.join(root, "pyodide", f), b);
    const tarball = path.join(dir, `${name}.tar.bz2`);
    execFileSync("tar", ["-cjf", tarball, "-C", root, "pyodide"]);
    const coreFiles = { "pyodide.mjs": sha("export {}"), "pyodide-lock.json": sha(lockText) };
    return { tarball, coreFiles, tarballSha256: createHash("sha256").update(await readFile(tarball)).digest("hex") };
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "prepare-pyodide-e2e-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("copies the core files and only the needed packages; a second run touches nothing; a corrupted file is redone", async () => {
    const release = await fakeRelease("good");
    const outDir = path.join(dir, "out-good");
    const cacheDir = path.join(dir, "empty-cache");
    const opts = { outDir, cacheDir, coreFiles: release.coreFiles, tarballSha256: release.tarballSha256, log: () => {} };

    expect(await preparePyodide({ ...opts, tarball: release.tarball, fetchImpl: noFetch })).toBe("prepared");
    expect((await readdir(outDir)).sort()).toEqual(["pyodide-lock.json", "pyodide.mjs", "pytest.whl", "scipy.whl", "sk-tests.zip", "sk.whl"]);

    // (b) no tarball given, an empty cache, and fetch throws: it must not need any of them.
    expect(await preparePyodide({ ...opts, fetchImpl: noFetch })).toBe("already prepared");
    expect(existsSync(cacheDir)).toBe(false);

    // (c) one corrupted output file among several (so "some match" isn't mistaken for "all match").
    await writeFile(path.join(outDir, "scipy.whl"), "corrupted");
    expect(await preparePyodide({ ...opts, tarball: release.tarball, fetchImpl: noFetch })).toBe("prepared");
    expect(await readFile(path.join(outDir, "scipy.whl"), "utf8")).toBe("scipy");
  });

  it("checks a tarball you name even when nothing needs it, naming a bad path plainly", async () => {
    const release = await fakeRelease("named");
    const outDir = path.join(dir, "out-named");
    const opts = { outDir, cacheDir: dir, coreFiles: release.coreFiles, tarballSha256: release.tarballSha256, log: () => {}, fetchImpl: noFetch };
    expect(await preparePyodide({ ...opts, tarball: release.tarball })).toBe("prepared");
    const missing = path.join(dir, "no-such.tar.bz2");
    await expect(preparePyodide({ ...opts, tarball: missing })).rejects.toThrow(`Couldn't read ${missing}: it (or a folder above it) doesn't exist`);
    await expect(preparePyodide({ ...opts, tarball: dir })).rejects.toThrow(`Couldn't read ${dir}: it is a folder, not a file`);
    const wrong = path.join(dir, "wrong.tar.bz2");
    await writeFile(wrong, "not it");
    await expect(preparePyodide({ ...opts, tarball: wrong })).rejects.toThrow(/wrong\.tar\.bz2: SHA-256 is .*refusing it/);
  });

  it("removes files and folders that aren't part of the release (they would be served publicly)", async () => {
    const release = await fakeRelease("extras");
    const outDir = path.join(dir, "out-extras");
    const logs: string[] = [];
    const opts = { outDir, cacheDir: dir, coreFiles: release.coreFiles, tarballSha256: release.tarballSha256, log: (m: string) => logs.push(m), fetchImpl: noFetch };
    await preparePyodide({ ...opts, tarball: release.tarball });
    await writeFile(path.join(outDir, "notes.txt"), "secret");
    await mkdir(path.join(outDir, "old"));
    await writeFile(path.join(outDir, "old", "pandas.whl"), "x");
    expect(await preparePyodide(opts)).toBe("already prepared");
    expect((await readdir(outDir)).sort()).toEqual(["pyodide-lock.json", "pyodide.mjs", "pytest.whl", "scipy.whl", "sk-tests.zip", "sk.whl"]);
    expect(logs).toContain("pyodide: removed notes.txt, which isn't part of the pinned release");
    expect(logs).toContain("pyodide: removed old, which isn't part of the pinned release");
  });

  it("(a) refuses a package whose bytes don't match the lock file, and leaves outDir untouched", async () => {
    const release = await fakeRelease("bad-package", { "scipy.whl": "tampered scipy" });
    const outDir = path.join(dir, "out-bad-package");
    await expect(
      preparePyodide({ outDir, cacheDir: dir, tarball: release.tarball, coreFiles: release.coreFiles, tarballSha256: release.tarballSha256, log: () => {}, fetchImpl: noFetch })
    ).rejects.toThrow(/scipy\.whl: SHA-256 is .*refusing it/);
    expect(existsSync(outDir)).toBe(false);
  });

  it("refuses a core file that doesn't match its pin, and leaves outDir untouched", async () => {
    const release = await fakeRelease("bad-core", { "pyodide.mjs": "export const evil = 1" });
    const outDir = path.join(dir, "out-bad-core");
    await expect(
      preparePyodide({ outDir, cacheDir: dir, tarball: release.tarball, coreFiles: release.coreFiles, tarballSha256: release.tarballSha256, log: () => {}, fetchImpl: noFetch })
    ).rejects.toThrow(/pyodide\.mjs: SHA-256 is .*refusing it/);
    expect(existsSync(outDir)).toBe(false);
  });
});

describe("explain", () => {
  it("turns Node's error codes into plain words that name the path", () => {
    const err = (code: string) => Object.assign(new Error(`${code}: raw`), { code });
    expect(explain("write", "/a/b", err("EACCES")).message).toBe("Couldn't write /a/b: permission denied");
    expect(explain("write", "/a/b", err("ENOSPC")).message).toBe("Couldn't write /a/b: the disk is full");
    expect(explain("read", "/a/b", err("ENOTDIR")).message).toBe("Couldn't read /a/b: a part of the path is a file, not a folder");
    expect(explain("read", "/a/b", err("EOTHER")).message).toBe("Couldn't read /a/b: EOTHER: raw");
  });
});
