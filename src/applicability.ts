import { createHash } from "node:crypto";
import type { AnalysisInput } from "./analysis-input.ts";
import type { AnalysisResult } from "./analysis-schema.ts";
import type { DependencyChange } from "./types.ts";

export type ConceptKind =
  | "api-symbol"
  | "cli-flag"
  | "config-key"
  | "dependency"
  | "entrypoint"
  | "package"
  | "runtime"
  | "version-constraint";

export type FactRelationship = "breaking" | "changed" | "compatible" | "unknown";

export type ReleaseFactNode = {
  id: string;
  dependency: string;
  kind: ConceptKind;
  concept: string;
  relationship: FactRelationship;
  minimumVersion?: string;
  statement: string;
  releaseUrl: string;
};

export type RepositoryUsageNode = {
  id: string;
  dependency: string;
  kind: ConceptKind;
  concept: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  repositoryVersion?: string;
};

export type ApplicabilityEdge = {
  id: string;
  dependency: string;
  kind: ConceptKind;
  concept: string;
  releaseFactId: string;
  repositoryUsageId: string;
  rule: "exact-concept" | "below-minimum" | "satisfies-minimum";
};

export type DependencyApplicabilityGraph = {
  dependency: DependencyChange;
  releaseFacts: ReleaseFactNode[];
  repositoryUsages: RepositoryUsageNode[];
  edges: ApplicabilityEdge[];
  unmatchedReleaseFactIds: string[];
};

export type ApplicabilityGraph = {
  version: 2;
  repository: string;
  pullRequest: number;
  baseSha: string;
  dependencies: DependencyApplicabilityGraph[];
};

export type ApplicabilityAnalysisInput = {
  repository: string;
  pullRequest: number;
  baseSha: string;
  dependencies: Array<{
    dependency: DependencyChange;
    releaseFacts: Array<
      Pick<
        ReleaseFactNode,
        "id" | "kind" | "concept" | "relationship" | "minimumVersion" | "statement" | "releaseUrl"
      >
    >;
    repositoryUsages: Array<
      Pick<
        RepositoryUsageNode,
        "id" | "kind" | "concept" | "path" | "startLine" | "endLine" | "content" | "repositoryVersion"
      >
    >;
    edges: ApplicabilityEdge[];
    unmatchedReleaseFacts: Array<{
      concepts: Array<Pick<ReleaseFactNode, "kind" | "concept">>;
      relationship: FactRelationship;
      statement: string;
      releaseUrl: string;
    }>;
    evidenceGap: string | null;
  }>;
};

type Concept = { kind: ConceptKind; concept: string };

export function buildApplicabilityGraph(input: AnalysisInput): ApplicabilityGraph {
  return {
    version: 2,
    repository: input.repository,
    pullRequest: input.pullRequest,
    baseSha: input.baseSha,
    dependencies: input.dependencies.map((item) => {
      const releaseFacts = uniqueById(
        item.officialEvidence.flatMap((evidence) =>
          releaseFactNodes(item.dependency, evidence.url, evidence.content),
        ),
      ).slice(0, 96);
      const repositoryUsages = uniqueById(
        item.repositoryEvidence.flatMap((excerpt) =>
          repositoryUsageNodes(item.dependency, excerpt),
        ),
      ).slice(0, 64);
      const usagesByConcept = new Map<string, RepositoryUsageNode[]>();
      for (const usage of repositoryUsages) {
        const key = conceptKey(usage);
        const values = usagesByConcept.get(key) ?? [];
        values.push(usage);
        usagesByConcept.set(key, values);
      }
      const factsByConcept = new Map<string, ReleaseFactNode[]>();
      for (const fact of releaseFacts) {
        const key = conceptKey(fact);
        const values = factsByConcept.get(key) ?? [];
        values.push(fact);
        factsByConcept.set(key, values);
      }
      const edges = [...factsByConcept.entries()]
        .flatMap(([key, facts]) =>
          [...facts]
            .sort((left, right) => relationshipRank(left.relationship) - relationshipRank(right.relationship))
            .slice(0, facts[0]?.kind === "dependency" || facts[0]?.kind === "version-constraint" ? 1 : 2)
            .flatMap((fact) =>
              (usagesByConcept.get(key) ?? [])
                .flatMap((usage) => applicabilityEdge(item.dependency.name, fact, usage))
                .slice(0, 2),
            ),
        )
        .slice(0, 96);
      const matchedFacts = new Set(edges.map((edge) => edge.releaseFactId));
      return {
        dependency: item.dependency,
        releaseFacts,
        repositoryUsages,
        edges,
        unmatchedReleaseFactIds: releaseFacts
          .filter((fact) => !matchedFacts.has(fact.id))
          .map((fact) => fact.id),
      };
    }),
  };
}

export function buildApplicabilityAnalysisInput(
  input: AnalysisInput,
  graph: ApplicabilityGraph,
): ApplicabilityAnalysisInput {
  const graphByDependency = new Map(
    graph.dependencies.map((item) => [dependencyKey(item.dependency), item]),
  );
  return {
    repository: input.repository,
    pullRequest: input.pullRequest,
    baseSha: input.baseSha,
    dependencies: input.dependencies.map((item) => {
      const dependencyGraph = graphByDependency.get(dependencyKey(item.dependency));
      if (!dependencyGraph) throw new Error(`Missing applicability graph: ${item.dependency.name}`);
      const facts = new Map(dependencyGraph.releaseFacts.map((fact) => [fact.id, fact]));
      const matchedFactIds = new Set(dependencyGraph.edges.map((edge) => edge.releaseFactId));
      const matchedUsageIds = new Set(
        dependencyGraph.edges.map((edge) => edge.repositoryUsageId),
      );
      return {
        dependency: item.dependency,
        releaseFacts: dependencyGraph.releaseFacts
          .filter((fact) => matchedFactIds.has(fact.id))
          .map(({ id, kind, concept, relationship, minimumVersion, statement, releaseUrl }) => ({
            id,
            kind,
            concept,
            relationship,
            ...(minimumVersion === undefined ? {} : { minimumVersion }),
            statement,
            releaseUrl,
          })),
        repositoryUsages: dependencyGraph.repositoryUsages
          .filter((usage) => matchedUsageIds.has(usage.id))
          .map(({ id, kind, concept, path, startLine, endLine, content, repositoryVersion }) => ({
            id,
            kind,
            concept,
            path,
            startLine,
            endLine,
            content,
            ...(repositoryVersion === undefined ? {} : { repositoryVersion }),
          })),
        edges: dependencyGraph.edges,
        unmatchedReleaseFacts: groupUnmatchedFacts(
          dependencyGraph.unmatchedReleaseFactIds
            .map((id) => facts.get(id))
            .filter((fact): fact is ReleaseFactNode => fact !== undefined),
        ),
        evidenceGap:
          item.evidenceGap ??
          (dependencyGraph.edges.length === 0
            ? "No release fact has an exact typed match in the prepared repository evidence; omit findings."
            : null),
      };
    }),
  };
}

function groupUnmatchedFacts(
  facts: ReleaseFactNode[],
): ApplicabilityAnalysisInput["dependencies"][number]["unmatchedReleaseFacts"] {
  const groups = new Map<
    string,
    ApplicabilityAnalysisInput["dependencies"][number]["unmatchedReleaseFacts"][number]
  >();
  for (const fact of facts) {
    const key = JSON.stringify([fact.releaseUrl, fact.relationship, fact.statement]);
    const group = groups.get(key) ?? {
      concepts: [],
      relationship: fact.relationship,
      statement: fact.statement.slice(0, 240),
      releaseUrl: fact.releaseUrl,
    };
    if (
      !group.concepts.some(
        (concept) => concept.kind === fact.kind && concept.concept === fact.concept,
      ) &&
      group.concepts.length < 8
    ) {
      group.concepts.push({ kind: fact.kind, concept: fact.concept });
    }
    groups.set(key, group);
  }
  return [...groups.values()].slice(0, 4);
}

export function renderApplicabilityPrompt(
  stablePrompt: string,
  input: ApplicabilityAnalysisInput,
): string {
  return `${stablePrompt.trimEnd()}\n\n<upgrade-impact-input>\n${JSON.stringify(input, null, 2)}\n</upgrade-impact-input>\n`;
}

export function verifyAnalysisApplicability(
  result: AnalysisResult,
  graph: ApplicabilityGraph,
): { valid: boolean; errors: string[] } {
  const supportedPairs = graph.dependencies.flatMap((dependency) => {
    const facts = new Map(dependency.releaseFacts.map((fact) => [fact.id, fact]));
    const usages = new Map(dependency.repositoryUsages.map((usage) => [usage.id, usage]));
    return dependency.edges.flatMap((edge) => {
      const fact = facts.get(edge.releaseFactId);
      const usage = usages.get(edge.repositoryUsageId);
      return fact && usage ? [{ fact, usage }] : [];
    });
  });
  const errors: string[] = [];
  for (const [index, finding] of result.findings.entries()) {
    const supported = supportedPairs.some(
      ({ fact, usage }) =>
        finding.releaseEvidence.includes(fact.releaseUrl) &&
        finding.repositoryEvidence.some((reference) => referenceWithinUsage(reference, usage)),
    );
    if (!supported) errors.push(`finding ${index} has no deterministic applicability edge`);
  }
  return { valid: errors.length === 0, errors };
}

function releaseFactNodes(
  dependency: DependencyChange,
  releaseUrl: string,
  content: string,
): ReleaseFactNode[] {
  const statements = splitFactStatements(content);
  const concepts = statements.flatMap((statement) =>
    applicableReleaseConcepts(statement).map(({ kind, concept: rawConcept }) => {
      const concept =
        kind === "api-symbol" && !rawConcept.includes("#")
          ? `${dependency.name}#${rawConcept}`
          : rawConcept;
      return {
        id: stableId("release", dependency.name, releaseUrl, kind, concept, statement),
        dependency: dependency.name,
        kind,
        concept,
        relationship: relationship(statement),
        statement,
        releaseUrl,
      };
    }),
  );
  const constraints = statements.flatMap((statement) =>
    releaseVersionConstraints(statement).map(({ subject, minimumVersion }) => ({
      id: stableId(
        "release",
        dependency.name,
        releaseUrl,
        "version-constraint",
        subject,
        minimumVersion,
        statement,
      ),
      dependency: dependency.name,
      kind: "version-constraint" as const,
      concept: subject,
      relationship: "breaking" as const,
      minimumVersion,
      statement,
      releaseUrl,
    })),
  );
  const scopeStatement = dependency.kind === "removed"
    ? undefined
    : selectScopeStatement(
        statements.filter(
          (statement) =>
            isDependencyScopeStatement(statement) &&
            mentionsDependencyIdentity(statement, dependency.name),
        ),
      );
  const scope = scopeStatement
    ? [{
        id: stableId("release", dependency.name, releaseUrl, "dependency", scopeStatement),
        dependency: dependency.name,
        kind: "dependency" as const,
        concept: dependency.name,
        relationship: relationship(scopeStatement),
        statement: scopeStatement,
        releaseUrl,
      }]
    : [];
  return [...concepts, ...constraints, ...scope];
}

function applicableReleaseConcepts(statement: string): Concept[] {
  const concepts = qualifyApiSymbols(extractReleaseConcepts(statement));
  if (concepts.some((concept) => concept.kind !== "package")) {
    return concepts.filter((concept) => concept.kind !== "package");
  }
  const factRelationship = relationship(statement);
  return factRelationship === "compatible" || factRelationship === "breaking"
    ? concepts
    : [];
}

function repositoryUsageNodes(
  dependency: DependencyChange,
  excerpt: { path: string; startLine: number; endLine: number; content: string },
): RepositoryUsageNode[] {
  const concepts: Array<Concept & { repositoryVersion?: string }> = [
    ...extractRepositoryConcepts(excerpt.path, excerpt.content),
    ...repositoryVersionConstraints(excerpt.path, excerpt.content),
    ...(isDirectDependencyUsage(dependency.name, excerpt.path, excerpt.content)
      ? [{ kind: "dependency" as const, concept: dependency.name }]
      : []),
  ];
  return concepts.map(({ kind, concept, repositoryVersion }) => ({
    id: stableId(
      "usage",
      dependency.name,
      excerpt.path,
      String(excerpt.startLine),
      String(excerpt.endLine),
      kind,
      concept,
    ),
    dependency: dependency.name,
    kind,
    concept,
    path: excerpt.path,
    startLine: excerpt.startLine,
    endLine: excerpt.endLine,
    content: excerpt.content,
    ...(repositoryVersion === undefined ? {} : { repositoryVersion }),
  }));
}

function applicabilityEdge(
  dependency: string,
  fact: ReleaseFactNode,
  usage: RepositoryUsageNode,
): ApplicabilityEdge[] {
  if (fact.kind !== "version-constraint") {
    return [{
      id: stableId("edge", fact.id, usage.id, "exact-concept"),
      dependency,
      kind: fact.kind,
      concept: fact.concept,
      releaseFactId: fact.id,
      repositoryUsageId: usage.id,
      rule: "exact-concept",
    }];
  }
  if (fact.minimumVersion === undefined || usage.repositoryVersion === undefined) return [];
  const rule = compareVersions(usage.repositoryVersion, fact.minimumVersion) < 0
    ? "below-minimum"
    : "satisfies-minimum";
  return [{
    id: stableId("edge", fact.id, usage.id, rule),
    dependency,
    kind: fact.kind,
    concept: fact.concept,
    releaseFactId: fact.id,
    repositoryUsageId: usage.id,
    rule,
  }];
}

function selectScopeStatement(statements: string[]): string | undefined {
  return statements.find((statement) => relationship(statement) !== "unknown") ??
    statements.find(
      (statement) =>
        /[A-Za-z]{3}/.test(statement) &&
        !/^v?\d+(?:\.\d+){1,2}$/.test(statement) &&
        !/^(?:full changelog|breaking changes?|bug fixes?|patch changes?|minor changes?|what's changed|features?|changes?)\b/i.test(
          statement.replace(/^[:*#\s\p{Emoji_Presentation}]+/u, ""),
        ),
    );
}

function isDependencyScopeStatement(statement: string): boolean {
  if (releaseVersionConstraints(statement).length > 0) return false;
  if (/\b(?:default\s+)?exports?\b/i.test(statement)) return false;
  const concepts = qualifyApiSymbols(extractReleaseConcepts(statement));
  return concepts.length === 0 || concepts.every(
    (concept) =>
      concept.kind === "api-symbol" &&
      /^(?:JavaScript|TypeScript|WebAssembly)$|#(?:JavaScript|TypeScript|WebAssembly)$/.test(
        concept.concept,
      ),
  );
}

function mentionsDependencyIdentity(statement: string, dependency: string): boolean {
  const basename = dependency.split("/").at(-1)!;
  return new RegExp(
    `(^|[^A-Za-z0-9_-])(?:${escapeRegex(dependency)}|${escapeRegex(basename)})(?![A-Za-z0-9_-])`,
    "i",
  ).test(statement);
}

function releaseVersionConstraints(
  statement: string,
): Array<{ subject: string; minimumVersion: string }> {
  const results: Array<{ subject: string; minimumVersion: string }> = [];
  const patterns = [
    /(?:drop(?:ped)?|remove[sd]?)\s+support\s+for\s+(node(?:\.js)?s?|react[ -]native|typescript)\s+(?:versions?\s+)?(?:before|below|<)\s*v?(\d+(?:\.\d+){0,2})/gi,
    /minimum\s+(node(?:\.js)?|react[ -]native|typescript)\s+version\s+(?:to|is|of)\s*v?(\d+(?:\.\d+){0,2})/gi,
    /(?:require[sd]?|needs?)\s+(node(?:\.js)?|react[ -]native|typescript)\s+v?(\d+(?:\.\d+){0,2})\+?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of statement.matchAll(pattern)) {
      results.push({
        subject: normalizeVersionSubject(match[1]!),
        minimumVersion: normalizeVersion(match[2]!),
      });
    }
  }
  for (const match of statement.matchAll(/(node(?:\.js)?|react[ -]native|typescript)\s*(?:>=|at least)\s*v?(\d+(?:\.\d+){0,2})/gi)) {
    results.push({
      subject: normalizeVersionSubject(match[1]!),
      minimumVersion: normalizeVersion(match[2]!),
    });
  }
  return uniqueVersionConstraints(results);
}

function repositoryVersionConstraints(
  path: string,
  content: string,
): Array<Concept & { repositoryVersion: string }> {
  if (!/(^|\/)package\.json$/.test(path)) return [];
  const results: Array<Concept & { repositoryVersion: string }> = [];
  for (const match of content.matchAll(/["'](node|react-native|typescript)["']\s*:\s*["']([^"']+)["']/gi)) {
    const version = firstVersion(match[2]!);
    if (version !== null) {
      results.push({
        kind: "version-constraint",
        concept: normalizeVersionSubject(match[1]!),
        repositoryVersion: version,
      });
    }
  }
  return results;
}

function isDirectDependencyUsage(dependency: string, path: string, content: string): boolean {
  if (
    /(^|\/)(?:docs?|readme|changelog)(\/|\.|$)/i.test(path) ||
    /(^|\/)AGENTS\.md$/i.test(path) ||
    /(^|\/)\.github\/ISSUE_TEMPLATE(\/|$)/i.test(path)
  ) {
    return false;
  }
  if (!/(^|\/)package\.json$/.test(path)) {
    const basename = dependency.split("/").at(-1)!;
    return new RegExp(
      `(?:["']${escapeRegex(dependency)}(?:["'/]|$)|(^|[^A-Za-z0-9_-])${escapeRegex(basename)}(?![A-Za-z0-9_-]))`,
      "im",
    ).test(content);
  }
  const declaration = new RegExp(
    `^[^\\n]*["']${escapeRegex(dependency)}["']\\s*:\\s*["'][^"']+["'][^\\n]*$`,
    "gm",
  );
  const withoutDeclaration = content.replace(declaration, "");
  if (withoutDeclaration !== content) {
    return new RegExp(`["']${escapeRegex(dependency)}(?:["'/]|$)`).test(withoutDeclaration);
  }
  return true;
}

function normalizeVersionSubject(value: string): string {
  if (/^node/i.test(value)) return "node";
  if (/^react[ -]native$/i.test(value)) return "react-native";
  return "typescript";
}

function normalizeVersion(value: string): string {
  const parts = value.split(".");
  while (parts.length < 3) parts.push("0");
  return parts.slice(0, 3).join(".");
}

function firstVersion(value: string): string | null {
  const match = /(?:^|[^0-9])(\d+(?:\.\d+){0,2})(?:[^0-9]|$)/.exec(value);
  return match ? normalizeVersion(match[1]!) : null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function uniqueVersionConstraints<T extends { subject: string; minimumVersion: string }>(
  values: T[],
): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.subject}\0${value.minimumVersion}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractReleaseConcepts(text: string): Concept[] {
  const concepts = commonConcepts(text);
  for (const token of backtickTokens(text)) addTokenConcepts(concepts, token);
  for (const symbol of camelCaseSymbols(text)) {
    concepts.push({ kind: "api-symbol", concept: symbol });
  }
  for (const key of environmentKeys(text)) {
    concepts.push({ kind: "config-key", concept: key });
  }
  if (/\bNode(?:\.js)?\b/i.test(text)) {
    concepts.push({ kind: "runtime", concept: "node" });
  }
  return uniqueConcepts(concepts);
}

function extractRepositoryConcepts(path: string, text: string): Concept[] {
  const concepts = commonConcepts(text);
  for (const specifier of importSpecifiers(text)) addPackageConcepts(concepts, specifier);
  concepts.push(...qualifiedImportedSymbols(text));
  concepts.push(...qualifiedPartialImportSymbols(text));
  for (const symbol of importedSymbols(text)) {
    concepts.push({ kind: "api-symbol", concept: symbol });
  }
  for (const symbol of camelCaseSymbols(text)) {
    concepts.push({ kind: "api-symbol", concept: symbol });
  }
  for (const packageName of scopedPackageKeys(text)) addPackageConcepts(concepts, packageName);
  for (const key of configurationKeys(text)) {
    concepts.push({ kind: "config-key", concept: key });
  }
  for (const key of environmentKeys(text)) {
    concepts.push({ kind: "config-key", concept: key });
  }
  if (hasExplicitNodeRuntime(path, text)) {
    concepts.push({ kind: "runtime", concept: "node" });
  }
  return uniqueConcepts(concepts);
}

function commonConcepts(text: string): Concept[] {
  const concepts: Concept[] = [];
  for (const match of text.matchAll(/(?:^|\s)(--[a-z0-9][a-z0-9-]*)\b/gi)) {
    concepts.push({ kind: "cli-flag", concept: match[1]!.toLowerCase() });
  }
  return concepts;
}

function addTokenConcepts(concepts: Concept[], rawToken: string): void {
  const token = rawToken.trim().replace(/\(\)$/, "");
  if (/^--[a-z0-9][a-z0-9-]*$/i.test(token)) {
    concepts.push({ kind: "cli-flag", concept: token.toLowerCase() });
  } else if (token.startsWith("@") || /^[a-z0-9_.-]+\/[A-Za-z0-9_./-]+$/.test(token)) {
    addPackageConcepts(concepts, token);
  } else if (/^[A-Za-z][A-Za-z0-9]*$/.test(token) && /[A-Z]/.test(token.slice(1))) {
    concepts.push({ kind: "api-symbol", concept: token });
  } else if (/^[A-Za-z][A-Za-z0-9_]*$/.test(token) && token.includes("_")) {
    concepts.push({ kind: "config-key", concept: token });
  }
}

function addPackageConcepts(concepts: Concept[], rawSpecifier: string): void {
  concepts.push(...packageConcepts(rawSpecifier));
}

function packageConcepts(rawSpecifier: string): Concept[] {
  const specifier = rawSpecifier.trim().replace(/[),.;:]+$/, "");
  const withoutVersion = specifier.startsWith("@")
    ? specifier.replace(/(@[^/]+\/[^/@]+)@v?\d.*$/, "$1")
    : specifier.replace(/@v?\d.*$/, "");
  const parts = withoutVersion.split("/");
  const packageName = withoutVersion.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0]!;
  if (!validPackageName(packageName)) return [];
  const concepts: Concept[] = [{ kind: "package", concept: packageName }];
  if (withoutVersion !== packageName && /^[A-Za-z0-9@._/-]+$/.test(withoutVersion)) {
    concepts.push({ kind: "entrypoint", concept: withoutVersion });
  }
  return concepts;
}

function qualifyApiSymbols(concepts: Concept[]): Concept[] {
  const symbols = concepts.filter((concept) => concept.kind === "api-symbol");
  const origins = concepts.filter(
    (concept) => concept.kind === "package" || concept.kind === "entrypoint",
  );
  if (symbols.length === 0 || origins.length === 0) return concepts;
  return uniqueConcepts([
    ...concepts.filter((concept) => concept.kind !== "api-symbol"),
    ...symbols.flatMap((symbol) =>
      origins.map((origin) => ({
        kind: "api-symbol" as const,
        concept: `${origin.concept}#${symbol.concept}`,
      })),
    ),
  ]);
}

function splitFactStatements(content: string): string[] {
  return content
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#{1,6}|[-*])\s*/, "").trim())
    .filter((line) => line.length >= 12 && !line.startsWith("```") && !/^\[?#?\d+\]/.test(line))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z@`])/))
    .flatMap((statement) => statement.split(/,\s+(?=while\b)/i))
    .map((statement) => statement.trim().slice(0, 500))
    .filter((statement, index, statements) => statements.indexOf(statement) === index);
}

function backtickTokens(text: string): string[] {
  return [...text.matchAll(/`([^`\n]{1,120})`/g)].map((match) => match[1]!);
}

function camelCaseSymbols(text: string): string[] {
  return [...text.matchAll(/\b([A-Z][a-z]+[A-Z][A-Za-z0-9]*)\b/g)].map(
    (match) => match[1]!,
  );
}

function importSpecifiers(text: string): string[] {
  return [
    ...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    ...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
    ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1]!);
}

function importedSymbols(text: string): string[] {
  return [...text.matchAll(/\bimport\s*{([^}]{1,500})}\s*from/g)].flatMap((match) =>
    match[1]!
      .split(",")
      .map((part) => part.trim().split(/\s+as\s+/i)[0]!)
      .filter((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part)),
  );
}

function qualifiedImportedSymbols(text: string): Concept[] {
  return [...text.matchAll(/\bimport\s*{([^}]{1,500})}\s*from\s*["']([^"']+)["']/g)].flatMap(
    (match) => {
      const symbols = match[1]!
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/i)[0]!)
        .filter((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part));
      return packageConcepts(match[2]!).flatMap((origin) =>
        symbols.map((symbol) => ({
          kind: "api-symbol" as const,
          concept: `${origin.concept}#${symbol}`,
        })),
      );
    },
  );
}

function qualifiedPartialImportSymbols(text: string): Concept[] {
  return [...text.matchAll(/([^}]{0,500})}\s*from\s*["']([^"']+)["']/g)].flatMap(
    (match) =>
      packageConcepts(match[2]!).flatMap((origin) =>
        camelCaseSymbols(match[1]!).map((symbol) => ({
          kind: "api-symbol" as const,
          concept: `${origin.concept}#${symbol}`,
        })),
      ),
  );
}

function scopedPackageKeys(text: string): string[] {
  return [...text.matchAll(/["'](@[a-z0-9._-]+\/[a-z0-9._-]+)["']\s*:/gi)].map(
    (match) => match[1]!,
  );
}

function configurationKeys(text: string): string[] {
  return [
    ...text.matchAll(/["']([A-Za-z][A-Za-z0-9_]{1,80})["']\s*:/g),
    ...text.matchAll(/^\s*\d*:?\s*([A-Za-z][A-Za-z0-9_]{1,80})\s*:/gm),
  ].map((match) => match[1]!);
}

function environmentKeys(text: string): string[] {
  return [...text.matchAll(/\b([A-Z][A-Z0-9]+_[A-Z0-9_]{2,})\b/g)].map(
    (match) => match[1]!,
  );
}

function hasExplicitNodeRuntime(path: string, text: string): boolean {
  return (
    /(^|\/)(\.nvmrc|\.node-version)$/.test(path) ||
    /["']engines["'][\s\S]{0,160}["']node["']\s*:/.test(text) ||
    /\bnode-version\s*:/.test(text) ||
    /\bsetup-node\b[\s\S]{0,160}\bnode-version\b/.test(text)
  );
}

function relationship(statement: string): FactRelationship {
  if (/\b(retain(?:ed|s)?|preserv(?:e|es|ed|ing)|remain(?:s|ed)? supported|backward compatible)\b/i.test(statement)) {
    return "compatible";
  }
  if (/\b(breaking|remove[ds]?|dropped?|no longer|requires?|minimum|unsupported)\b/i.test(statement)) {
    return "breaking";
  }
  if (/\b(add(?:s|ed)?|change[ds]?|fix(?:es|ed)?|update[ds]?|delegate[ds]?)\b/i.test(statement)) {
    return "changed";
  }
  return "unknown";
}

function relationshipRank(value: FactRelationship): number {
  if (value === "breaking") return 0;
  if (value === "compatible") return 1;
  if (value === "changed") return 2;
  return 3;
}

function referenceWithinUsage(reference: string, usage: RepositoryUsageNode): boolean {
  const match = /^(.*?):(\d+)(?:-(\d+))?$/.exec(reference);
  if (!match || match[1] !== usage.path) return false;
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  return start >= usage.startLine && end <= usage.endLine && end >= start;
}

function conceptKey(value: Pick<Concept, "kind" | "concept">): string {
  return `${value.kind}\0${value.concept}`;
}

function uniqueConcepts(values: Concept[]): Concept[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = conceptKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16)}`;
}

function dependencyKey(dependency: DependencyChange): string {
  return JSON.stringify([
    dependency.name,
    dependency.section,
    dependency.before,
    dependency.after,
  ]);
}

function validPackageName(value: string): boolean {
  return /^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*)$/i.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
