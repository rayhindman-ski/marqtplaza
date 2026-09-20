import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOTS = ["artifacts", "scripts"];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPackageDirectories(rootDirectory) {
  if (!(await exists(rootDirectory))) return [];

  const packageDirectories = [];
  const entries = await readdir(rootDirectory, { withFileTypes: true });

  if (await exists(path.join(rootDirectory, "package.json"))) {
    packageDirectories.push(rootDirectory);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    packageDirectories.push(
      ...(await findPackageDirectories(path.join(rootDirectory, entry.name))),
    );
  }

  return packageDirectories;
}

export async function findMissingTypecheckScripts(workspaceRoot) {
  const packageDirectories = (
    await Promise.all(
      PACKAGE_ROOTS.map((root) =>
        findPackageDirectories(path.join(workspaceRoot, root)),
      ),
    )
  ).flat();
  const missing = [];

  for (const packageDirectory of packageDirectories) {
    if (!(await exists(path.join(packageDirectory, "tsconfig.json")))) continue;

    const packageJsonPath = path.join(packageDirectory, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (
      typeof packageJson.scripts?.typecheck !== "string" ||
      packageJson.scripts.typecheck.trim() === ""
    ) {
      missing.push(path.relative(workspaceRoot, packageJsonPath));
    }
  }

  return missing.sort();
}

export async function checkTypecheckScripts(workspaceRoot) {
  const missing = await findMissingTypecheckScripts(workspaceRoot);
  if (missing.length === 0) return;

  throw new Error(
    [
      "TypeScript workspace packages must define a non-empty typecheck script:",
      ...missing.map((packagePath) => `- ${packagePath}`),
    ].join("\n"),
  );
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const workspaceRoot = path.resolve(process.argv[2] ?? process.cwd());
  checkTypecheckScripts(workspaceRoot).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}