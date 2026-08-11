import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compareManifests, parseManifest } from "./manifest.ts";
import { renderMarkdown } from "./render.ts";

const { values } = parseArgs({
  options: {
    before: { type: "string" },
    after: { type: "string" },
    format: { type: "string", default: "markdown" },
  },
  strict: true,
});

if (!values.before || !values.after) {
  fail("Usage: pnpm cli --before <old-package.json> --after <new-package.json> [--format markdown|json]");
}

if (values.format !== "markdown" && values.format !== "json") {
  fail(`Unsupported format: ${values.format}`);
}

try {
  const [beforeText, afterText] = await Promise.all([
    readFile(values.before, "utf8"),
    readFile(values.after, "utf8"),
  ]);
  const changes = compareManifests(parseManifest(beforeText), parseManifest(afterText));
  const output =
    values.format === "json"
      ? `${JSON.stringify({ changes }, null, 2)}\n`
      : renderMarkdown(changes);
  process.stdout.write(output);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
