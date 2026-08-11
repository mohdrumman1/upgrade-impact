import { readdir, readFile } from "node:fs/promises";
import type { AnalysisInput } from "../src/analysis-input.ts";
import { parseAnalysisResult } from "../src/analysis-schema.ts";
import { verifyAnalysisEvidence } from "../src/analysis-verification.ts";

const cases = (await readdir("evals/manual"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5))
  .sort();
const scorecard = JSON.parse(await readFile("evals/manual-scores.json", "utf8")) as {
  cases: Array<{ id: string; scores: number[]; total: number }>;
};

for (const id of cases) {
  const [inputText, resultText] = await Promise.all([
    readFile(`scratch/evals/${id}/analysis-input.json`, "utf8"),
    readFile(`evals/manual/${id}.json`, "utf8"),
  ]);
  const input = JSON.parse(inputText) as AnalysisInput;
  const result = parseAnalysisResult(resultText);
  const verification = verifyAnalysisEvidence(result, input);
  if (!verification.valid) {
    throw new Error(`${id}: ${verification.errors.join("; ")}`);
  }
  process.stdout.write(`${id}: schema and evidence valid (${result.findings.length} findings)\n`);
}

const scoredIds = new Set<string>();
for (const item of scorecard.cases) {
  if (scoredIds.has(item.id)) throw new Error(`Duplicate score: ${item.id}`);
  scoredIds.add(item.id);
  if (
    item.scores.length !== 5 ||
    item.scores.some((score) => !Number.isInteger(score) || score < 0 || score > 2) ||
    item.scores.reduce((sum, score) => sum + score, 0) !== item.total
  ) {
    throw new Error(`Invalid score: ${item.id}`);
  }
}
for (const id of cases) {
  if (!scoredIds.has(id)) throw new Error(`Missing score: ${id}`);
}
const total = scorecard.cases.reduce((sum, item) => sum + item.total, 0);
process.stdout.write(
  `${scorecard.cases.length} scored reports: ${(total / scorecard.cases.length).toFixed(3)}/10 mean\n`,
);
