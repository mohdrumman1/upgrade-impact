import { readdir, readFile, writeFile } from "node:fs/promises";
import { compareManifests, parseManifest } from "../src/manifest.ts";
import { renderMarkdown } from "../src/render.ts";
import type { DependencyChange } from "../src/types.ts";

type EvalCase = { id: string; repository: string; pullRequest: number };
type ManifestResult = { path: string; changes: DependencyChange[] };

const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[];
const summary: Array<{
  id: string;
  repository: string;
  pullRequest: number;
  manifestCount: number;
  changeCount: number;
  changeKinds: Record<string, number>;
  versionDeltas: Record<string, number>;
}> = [];

for (const evalCase of cases) {
  const directory = `scratch/evals/${evalCase.id}`;
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: ManifestResult[] = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const manifestDirectory = `${directory}/${entry.name}`;
    const [path, before, after] = await Promise.all([
      readFile(`${manifestDirectory}/path.txt`, "utf8"),
      readFile(`${manifestDirectory}/before.json`, "utf8"),
      readFile(`${manifestDirectory}/after.json`, "utf8"),
    ]);
    manifests.push({
      path: path.trim(),
      changes: compareManifests(parseManifest(before), parseManifest(after)),
    });
  }

  if (manifests.length === 0) {
    throw new Error(`Evaluation case ${evalCase.id} has no acquired package manifest`);
  }

  const changes = manifests.flatMap((manifest) => manifest.changes);
  await Promise.all([
    writeFile(
      `${directory}/deterministic.json`,
      `${JSON.stringify({ manifests }, null, 2)}\n`,
    ),
    writeFile(`${directory}/deterministic.md`, renderMarkdown(changes)),
  ]);

  summary.push({
    ...evalCase,
    manifestCount: manifests.length,
    changeCount: changes.length,
    changeKinds: countBy(changes.map((change) => change.kind)),
    versionDeltas: countBy(changes.map((change) => change.versionDelta)),
  });
}

await writeFile(
  "scratch/evals/summary.json",
  `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: summary }, null, 2)}\n`,
);

const totalManifests = summary.reduce((total, item) => total + item.manifestCount, 0);
const totalChanges = summary.reduce((total, item) => total + item.changeCount, 0);
process.stdout.write(
  `Summarized ${summary.length} cases, ${totalManifests} manifests, ${totalChanges} dependency changes.\n`,
);

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
