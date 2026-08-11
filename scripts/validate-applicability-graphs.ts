import { readFile } from "node:fs/promises";
import type {
  ApplicabilityGraph,
  DependencyApplicabilityGraph,
} from "../src/applicability.ts";

type InputSummary = {
  cases: Array<{
    id: string;
    estimatedTokens: number;
    applicabilityEstimatedTokens: number;
    applicabilityEdgeCount: number;
  }>;
};
type Expectation = {
  id: string;
  outcome: "matched" | "safe-omission" | "blocked-source" | "deterministic-preflight";
  edge?: { kind: string; concept: string; rule: string };
  reason?: string;
};

const expectations = await readJson<{ cases: Expectation[] }>(
  "evals/applicability-expectations.json",
);
const graphs = new Map<string, ApplicabilityGraph>();
const preflightCounts = new Map<string, number>();
for (const { id } of expectations.cases) {
  graphs.set(id, await readJson<ApplicabilityGraph>(`scratch/evals/${id}/applicability-graph.json`));
  const preflight = await readJson<{ findings: unknown[] }>(`scratch/evals/${id}/preflight.json`);
  preflightCounts.set(id, preflight.findings.length);
}

for (const [id, graph] of graphs) validateGraph(id, graph);
for (const expectation of expectations.cases) validateExpectation(expectation, graphs.get(expectation.id)!);

const concurrent = onlyDependency(graphs.get("concurrently-8-to-9")!);
assert(
  concurrent.edges.some((edge) => edge.kind === "runtime" && edge.concept === "node"),
  "Concurrently must recover its repository Node engine constraint",
);
for (const concept of ["--max-processes", "--kill-others", "--kill-others-on-fail"]) {
  assert(!concurrent.edges.some((edge) => edge.concept === concept), `Concurrently matched ${concept}`);
}

const otel = onlyDependency(graphs.get("otel-node-large-zero-major")!);
for (const concept of ["startNodeSDK", "log_level", "OTEL_CONFIG_FILE"]) {
  assert(!otel.edges.some((edge) => edge.concept === concept), `OpenTelemetry matched ${concept}`);
}

const agents = onlyDependency(graphs.get("agents-large-zero-major")!);
assert(
  agents.edges.some((edge) => edge.kind === "api-symbol" && edge.concept.endsWith("#McpAgent")),
  "Agents must retain an exact McpAgent applicability edge",
);
assert(
  agents.edges.some(
    (edge) => edge.kind === "package" && edge.concept === "@modelcontextprotocol/sdk",
  ),
  "Agents must retain its exact SDK compatibility edge",
);
assert(
  !agents.edges.some((edge) => edge.concept.endsWith("#McpServer")),
  "Agents must distinguish the v2 server package from the repository's v1 SDK server",
);

const summary = await readJson<InputSummary>("scratch/evals/analysis-input-summary.json");
const totals = summary.cases.reduce(
  (value, item) => ({
    v1: value.v1 + item.estimatedTokens,
    v2: value.v2 + item.applicabilityEstimatedTokens,
    edges: value.edges + item.applicabilityEdgeCount,
  }),
  { v1: 0, v2: 0, edges: 0 },
);
const reduction = totals.v1 === 0 ? 0 : 1 - totals.v2 / totals.v1;
const matched = expectations.cases.filter((item) => item.outcome === "matched").length;
const omissions = expectations.cases.filter((item) => item.outcome === "safe-omission").length;
const deterministic = expectations.cases.filter(
  (item) => item.outcome === "deterministic-preflight",
).length;
const blocked = expectations.cases.length - matched - omissions - deterministic;
process.stdout.write(
  `${matched} matched, ${deterministic} deterministic preflight, ${omissions} safe omissions, ${blocked} source blockers; ${totals.edges} edges; v2 ~${totals.v2} tokens (${(reduction * 100).toFixed(1)}% below v1)\n`,
);

function validateExpectation(expectation: Expectation, graph: ApplicabilityGraph): void {
  const edges = graph.dependencies.flatMap((dependency) => dependency.edges);
  if (expectation.outcome === "matched") {
    assert(expectation.edge !== undefined, `${expectation.id}: matched expectation lacks an edge`);
    assert(
      edges.some(
        (edge) =>
          edge.kind === expectation.edge!.kind &&
          edge.concept === expectation.edge!.concept &&
          edge.rule === expectation.edge!.rule,
      ),
      `${expectation.id}: required applicability edge is missing`,
    );
    return;
  }
  assert(edges.length === 0, `${expectation.id}: ${expectation.outcome} must not contain edges`);
  if (expectation.outcome === "deterministic-preflight") {
    const preflight = preflightCounts.get(expectation.id);
    assert(preflight !== undefined && preflight > 0, `${expectation.id}: preflight finding is missing`);
  }
  if (expectation.outcome.startsWith("blocked")) {
    assert(expectation.reason !== undefined, `${expectation.id}: blocker reason is missing`);
  }
}

function validateGraph(id: string, graph: ApplicabilityGraph): void {
  assert(graph.version === 2, `${id}: unsupported graph version`);
  for (const dependency of graph.dependencies) {
    const facts = new Map(dependency.releaseFacts.map((fact) => [fact.id, fact]));
    const usages = new Map(dependency.repositoryUsages.map((usage) => [usage.id, usage]));
    for (const edge of dependency.edges) {
      const fact = facts.get(edge.releaseFactId);
      const usage = usages.get(edge.repositoryUsageId);
      assert(fact !== undefined, `${id}: edge references a missing release fact`);
      assert(usage !== undefined, `${id}: edge references a missing repository usage`);
      if (edge.rule === "below-minimum" || edge.rule === "satisfies-minimum") {
        assert(fact.minimumVersion !== undefined, `${id}: constraint edge lacks a minimum`);
        assert(usage.repositoryVersion !== undefined, `${id}: constraint edge lacks a repository version`);
      }
      assert(
        edge.kind === fact.kind && edge.kind === usage.kind &&
          edge.concept === fact.concept && edge.concept === usage.concept,
        `${id}: edge joins unequal typed concepts`,
      );
    }
  }
}

function onlyDependency(graph: ApplicabilityGraph): DependencyApplicabilityGraph {
  assert(graph.dependencies.length === 1, "Expected one dependency in focused evaluation case");
  return graph.dependencies[0]!;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
