import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

async function text(path) {
  return readFile(join(root, path), "utf8");
}

function section(markdown, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |\\Z)`, "m"),
  );
  return match?.[1]?.trim() || "Not recorded.";
}

async function acceptedAdrs() {
  const directory = join(root, "docs", "adr");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".md"));
  const records = [];
  for (const name of files.sort()) {
    const contents = await readFile(join(directory, name), "utf8");
    if (/^- Status: accepted$/m.test(contents)) {
      const title = contents.match(/^# (.+)$/m)?.[1] ?? name;
      records.push(`- ${title}`);
    }
  }
  return records.join("\n") || "- None";
}

export async function createContextPack() {
  const agents = await text("AGENTS.md");
  const state = await text("docs/STATE.md");

  return [
    "# Linux Observatory context pack",
    "",
    "## Objective",
    section(agents, "Mission"),
    "",
    "## Architecture invariants",
    section(agents, "Invariants"),
    "",
    "## Completed",
    section(state, "Completed"),
    "",
    "## Current",
    section(state, "Current"),
    "",
    "## Blockers / constraints",
    section(state, "Blockers / constraints"),
    "",
    "## Accepted decisions",
    await acceptedAdrs(),
    "",
    "## Next task",
    section(state, "Next"),
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(await createContextPack());
}
