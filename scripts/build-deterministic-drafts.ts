import { readFile, writeFile } from "node:fs/promises";
import { parseAnalysisResult } from "../src/analysis-schema.ts";
import type { ApplicabilityGraph } from "../src/applicability.ts";
import { verifyAnalysisApplicability } from "../src/applicability.ts";
import { buildDeterministicAnalysis } from "../src/deterministic-analysis.ts";

const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as Array<{ id: string }>;
let findings = 0;

for (const { id } of cases) {
  const graph = JSON.parse(
    await readFile(`scratch/evals/${id}/applicability-graph.json`, "utf8"),
  ) as ApplicabilityGraph;
  const result = buildDeterministicAnalysis(graph);
  parseAnalysisResult(JSON.stringify(result));
  const verification = verifyAnalysisApplicability(result, graph);
  if (!verification.valid) throw new Error(`${id}: ${verification.errors.join("; ")}`);
  findings += result.findings.length;
  await writeFile(
    `scratch/evals/${id}/deterministic-v2-result.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(`${id}: ${result.risk}, ${result.findings.length} findings\n`);
}

process.stdout.write(`${cases.length} drafts validated with ${findings} deterministic findings\n`);
