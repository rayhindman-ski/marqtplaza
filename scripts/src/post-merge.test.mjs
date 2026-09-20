import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const postMergeScript = path.join(workspaceRoot, "scripts/post-merge.sh");

async function runPostMerge(t, failPreflight) {
  const directory = await mkdtemp(path.join(tmpdir(), "post-merge-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = path.join(directory, "calls.log");
  const fakePnpm = path.join(directory, "pnpm");
  await writeFile(
    fakePnpm,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$POST_MERGE_CALL_LOG"
if [ "$FAIL_PREFLIGHT" = "true" ] && [ "$*" = "--filter @workspace/db run push-preflight" ]; then
  exit 42
fi
`,
  );
  await chmod(fakePnpm, 0o755);

  const result = spawnSync("bash", [postMergeScript], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      POST_MERGE_CALL_LOG: log,
      FAIL_PREFLIGHT: String(failPreflight),
    },
    encoding: "utf8",
  });
  return { result, calls: (await readFile(log, "utf8")).trim().split("\n") };
}

test("stops before forced push when schema preflight rejects a change", async (t) => {
  const { result, calls } = await runPostMerge(t, true);

  assert.equal(result.status, 42);
  assert.deepEqual(calls, [
    "install --frozen-lockfile",
    "--filter @workspace/db run push-preflight",
  ]);
});

test("runs forced push only after a successful preflight", async (t) => {
  const { result, calls } = await runPostMerge(t, false);

  assert.equal(result.status, 0);
  assert.deepEqual(calls, [
    "install --frozen-lockfile",
    "--filter @workspace/db run push-preflight",
    "--filter @workspace/db run push-force",
  ]);
});