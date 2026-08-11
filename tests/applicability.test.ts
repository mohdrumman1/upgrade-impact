import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisInput } from "../src/analysis-input.ts";
import {
  buildApplicabilityAnalysisInput,
  buildApplicabilityGraph,
  verifyAnalysisApplicability,
} from "../src/applicability.ts";
import type { AnalysisResult } from "../src/analysis-schema.ts";

test("blocks Concurrently facts without matching flags, imports, or runtime evidence", () => {
  const input = analysisInput(
    "concurrently",
    [
      excerpt(
        "packages/cli/package.json",
        40,
        44,
        '42:     "build": "conc \\"npm:build-*\\"",',
      ),
    ],
    "Dropped support for Node.js < 18. Pending commands no longer run when `--max-processes` is set. The `concurrently` and default exports are now the same.",
  );
  const graph = buildApplicabilityGraph(input);
  assert.equal(graph.dependencies[0]!.edges.length, 0);
  const prepared = buildApplicabilityAnalysisInput(input, graph);
  assert.match(prepared.dependencies[0]!.evidenceGap!, /No release fact has an exact typed match/);
});

test("does not equate NodeSDK usage with startNodeSDK configuration", () => {
  const input = analysisInput(
    "@opentelemetry/sdk-node",
    [
      excerpt(
        "experimental/node16/index.ts",
        1,
        3,
        "1: import {NodeSDK, api} from '@opentelemetry/sdk-node';",
      ),
    ],
    "`startNodeSDK()` now uses `log_level` configuration. Invalid `OTEL_CONFIG_FILE` YAML now creates a noop SDK.",
  );
  const graph = buildApplicabilityGraph(input);
  const concepts = graph.dependencies[0]!.edges.map((edge) => edge.concept);
  assert.ok(!concepts.includes("startNodeSDK"));
  assert.ok(!concepts.includes("log_level"));
  assert.equal(concepts.length, 0);
});

test("qualifies symbols from a line-bounded partial multiline import", () => {
  const input = analysisInput(
    "@opentelemetry/sdk-trace-node",
    [
      excerpt(
        "src/tracing.ts",
        18,
        23,
        "18:   BatchSpanProcessor,\n19:   SimpleSpanProcessor,\n20: } from '@opentelemetry/sdk-trace-node';",
      ),
    ],
    "The `SimpleSpanProcessor` constructor changed.",
  );
  const edges = buildApplicabilityGraph(input).dependencies[0]!.edges;
  assert.ok(
    edges.some(
      (edge) =>
        edge.kind === "api-symbol" &&
        edge.concept === "@opentelemetry/sdk-trace-node#SimpleSpanProcessor",
    ),
  );
});

test("compares repository versions with release minimums", () => {
  const safeArea = analysisInput(
    "react-native-safe-area-context",
    [
      excerpt(
        "apps/mobile/package.json",
        20,
        24,
        '20: "react": "18.3.1",\n21: "react-native": "0.76.5",\n22: "react-native-safe-area-context": "4.12.0"',
      ),
    ],
    "This release bumps the minimum react native version to 0.74.",
  );
  const safeAreaEdges = buildApplicabilityGraph(safeArea).dependencies[0]!.edges;
  assert.ok(
    safeAreaEdges.some(
      (edge) => edge.concept === "react-native" && edge.rule === "satisfies-minimum",
    ),
  );

  const rimraf = analysisInput(
    "rimraf",
    [excerpt("package.json", 5, 8, '5: "engines": {\n6:   "node": ">=18"\n7: }')],
    "Drop support for nodes before v20",
  );
  const rimrafEdges = buildApplicabilityGraph(rimraf).dependencies[0]!.edges;
  assert.ok(
    rimrafEdges.some((edge) => edge.concept === "node" && edge.rule === "below-minimum"),
  );
});

test("allows a dependency-wide release check only for direct tool usage", () => {
  const direct = analysisInput(
    "typescript",
    [excerpt("apps/api/package.json", 7, 10, '7: "typecheck": "tsc -p tsconfig.json"')],
    "TypeScript 6.0.3",
  );
  assert.ok(
    buildApplicabilityGraph(direct).dependencies[0]!.edges.some(
      (edge) => edge.kind === "dependency" && edge.concept === "typescript",
    ),
  );

  const declarationOnly = analysisInput(
    "typescript",
    [excerpt("package.json", 27, 30, '29: "typescript": "^5.7.2"')],
    "TypeScript 6.0.3",
  );
  assert.ok(
    !buildApplicabilityGraph(declarationOnly).dependencies[0]!.edges.some(
      (edge) => edge.kind === "dependency",
    ),
  );
});

test("links retained McpAgent and SDK compatibility facts to exact repository usage", () => {
  const releaseUrl = "https://github.com/cloudflare/agents/releases/tag/agents%400.20.1";
  const input = analysisInput(
    "agents",
    [
      excerpt(
        "worker/src/mcp.ts",
        1,
        4,
        '1: import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";\n3: import { McpAgent } from "agents/mcp";',
      ),
      excerpt(
        "worker/package.json",
        19,
        22,
        '19: "@modelcontextprotocol/sdk": "^1.30.0",\n21: "agents": "^0.13.0"',
      ),
    ],
    "Update the retained SDK v1 compatibility dependency to `@modelcontextprotocol/sdk@1.30.0`, while preserving the Agents-owned keepalive on the legacy McpAgent WebSocket bridge. The v2 `McpServer` from `@modelcontextprotocol/server` changed its transport API.",
    releaseUrl,
  );
  const graph = buildApplicabilityGraph(input);
  const edges = graph.dependencies[0]!.edges;
  assert.ok(
    edges.some((edge) => edge.kind === "api-symbol" && edge.concept === "agents#McpAgent"),
  );
  assert.ok(
    edges.some(
      (edge) => edge.kind === "package" && edge.concept === "@modelcontextprotocol/sdk",
    ),
  );
  assert.ok(!edges.some((edge) => edge.concept.endsWith("#McpServer")));
  const validResult: AnalysisResult = {
    risk: "low",
    confidence: 0.9,
    summary: "The retained legacy path matches current repository usage.",
    findings: [
      {
        title: "Legacy MCP compatibility is retained",
        impact: "The repository uses the retained McpAgent path.",
        repositoryEvidence: ["worker/src/mcp.ts:3"],
        releaseEvidence: [releaseUrl],
        recommendedChecks: ["Run the MCP connection test."],
      },
    ],
    omittedConcerns: [],
  };
  assert.deepEqual(verifyAnalysisApplicability(validResult, graph), {
    valid: true,
    errors: [],
  });
  const invalidResult = structuredClone(validResult);
  invalidResult.findings[0]!.repositoryEvidence = ["worker/src/unrelated.ts:1"];
  assert.equal(verifyAnalysisApplicability(invalidResult, graph).valid, false);
});

function analysisInput(
  name: string,
  repositoryEvidence: Array<{
    path: string;
    startLine: number;
    endLine: number;
    content: string;
  }>,
  releaseContent: string,
  releaseUrl: string = "https://example.test/releases/2",
): AnalysisInput {
  return {
    repository: "acme/app",
    pullRequest: 42,
    baseSha: "a".repeat(40),
    dependencies: [
      {
        dependency: {
          name,
          section: "devDependencies",
          before: "1.0.0",
          after: "2.0.0",
          kind: "upgraded",
          versionDelta: "major",
        },
        repositoryEvidence,
        officialEvidence: [
          {
            source: "github-release",
            version: "2.0.0",
            tag: "v2.0.0",
            url: releaseUrl,
            content: releaseContent,
          },
        ],
        evidenceGap: null,
      },
    ],
  };
}

function excerpt(path: string, startLine: number, endLine: number, content: string) {
  return { path, startLine, endLine, content };
}
