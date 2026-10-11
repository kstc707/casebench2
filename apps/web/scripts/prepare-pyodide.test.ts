import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSha256,
  CORE_FILES,
  download,
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
