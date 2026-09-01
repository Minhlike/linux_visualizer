import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const rules = [
  {
    directory: "semantic-core",
    forbiddenDependencies: [
      "tauri",
      "react",
      "three",
      "renderer",
      "camera-director",
      "camera_director",
      "learning-ui",
      "learning_ui",
    ],
  },
  {
    directory: "runtime-observer",
    forbiddenDependencies: ["tauri", "react", "three", "renderer", "learning-ui"],
  },
  {
    directory: "fidelity-engine",
    forbiddenDependencies: ["tauri", "react", "three", "renderer", "learning-ui"],
  },
];

const checkedExtensions = new Set([".rs", ".toml"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return nested.flat();
}

export async function boundaryViolations() {
  const violations = [];
  for (const rule of rules) {
    const directory = join(root, rule.directory);
    const files = (await filesBelow(directory)).filter((file) =>
      checkedExtensions.has(extname(file)),
    );
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const dependency of rule.forbiddenDependencies) {
        const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const cargoDependency = new RegExp(`^\\s*[\"']?${escaped}[\"']?\\s*=`, "im");
        const rustImport = new RegExp(
          `^\\s*(?:use|extern\\s+crate)\\s+${escaped.replaceAll("-", "_")}\\b`,
          "im",
        );
        if (cargoDependency.test(source) || rustImport.test(source)) {
          violations.push(
            `${relative(root, file)} depends on forbidden module ${dependency}`,
          );
        }
      }
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await boundaryViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Architecture boundary check passed.");
  }
}
