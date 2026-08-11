import { parseArgs } from "node:util";
import { analysePrepared } from "../src/prepared-analysis.ts";

const { values } = parseArgs({
  options: {
    prompt: { type: "string" },
    graph: { type: "string" },
    preflight: { type: "string" },
    output: { type: "string" },
    metadata: { type: "string" },
    provider: { type: "string", default: "openrouter-openai-mini" },
    "max-usd": { type: "string", default: "0.02" },
    "max-output": { type: "string", default: "1200" },
  },
  strict: true,
});

if (!values.prompt || !values.graph || !values.preflight || !values.output) {
  fail("Usage: pnpm analyse --prompt FILE --graph FILE --preflight FILE --output FILE [--metadata FILE]");
}

const maximumUsd = positiveNumber(values["max-usd"], "--max-usd");
if (maximumUsd > 0.05) fail("--max-usd cannot exceed US$0.05 per report");
const maximumOutputTokens = positiveInteger(values["max-output"], "--max-output");
try {
  const metadata = await analysePrepared({
    promptPath: values.prompt,
    graphPath: values.graph,
    preflightPath: values.preflight,
    outputPath: values.output,
    ...(values.metadata ? { metadataPath: values.metadata } : {}),
    provider: values.provider,
    maximumUsd,
    maximumOutputTokens,
    notice: (message) => process.stderr.write(`${message}\n`),
  });
  process.stdout.write(`${values.output}: verified report, US$${metadata.spendUsd.toFixed(6)}\n`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function positiveNumber(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${name} must be positive`);
  return number;
}

function positiveInteger(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(`${name} must be a positive integer`);
  return number;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
