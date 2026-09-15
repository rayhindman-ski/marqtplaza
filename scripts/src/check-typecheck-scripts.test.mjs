import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkTypecheckScripts } from "./check-typecheck-scripts.mjs";

async function createPackage(root, directory, scripts) {
  const packageDirectory = path.join(root, directory);
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(path.join(packageDirectory, "tsconfig.json"), "{}\n");
  await writeFile(
    path.join(packageDirectory, "package.json"),
    `${JSON.stringify({ name: directory, private: true, scripts }, null, 2)}\n`,
  );
}

test("accepts selected TypeScript packages with typecheck scripts", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "typecheck-scripts-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createPackage(root, "artifacts/example", {
    typecheck: "tsc --noEmit",
  });
  await createPackage(root, "scripts", { typecheck: "tsc --noEmit" });

  await assert.doesNotReject(checkTypecheckScripts(root));
});

test("rejects a selected TypeScript package without a typecheck script", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "typecheck-scripts-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createPackage(root, "artifacts/missing", { build: "tsc" });

  await assert.rejects(
    checkTypecheckScripts(root),
    /artifacts\/missing\/package\.json/,
  );
});

test("ignores non-TypeScript packages", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "typecheck-scripts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageDirectory = path.join(root, "artifacts/static");
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, "package.json"),
    '{"name":"static","private":true}\n',
  );

  await assert.doesNotReject(checkTypecheckScripts(root));
});