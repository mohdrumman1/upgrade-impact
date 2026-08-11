import {
  isSafeRepositoryPath,
  isSensitiveRepositoryPath,
  type GrepMatch,
} from "./evidence.ts";
import type { FactRelationship, ReleaseFactNode } from "./applicability.ts";

export type ApplicabilitySearchTarget = {
  kind: ReleaseFactNode["kind"];
  concept: string;
  term: string;
  relationship: FactRelationship;
  releaseFactIds: string[];
};

const genericApiSymbols = new Set([
  "AppAndFlow",
  "JavaScript",
  "Node",
  "TypeScript",
  "WebAssembly",
]);

export function applicabilitySearchTargets(
  facts: readonly ReleaseFactNode[],
  maximum: number = 24,
): ApplicabilitySearchTarget[] {
  const targets = new Map<string, ApplicabilitySearchTarget>();
  for (const fact of [...facts].sort(compareFacts)) {
    if (fact.relationship === "unknown") continue;
    const term = searchTerm(fact);
    if (term === null) continue;
    const key = `${fact.kind}\0${fact.concept}`;
    const existing = targets.get(key);
    if (existing) {
      existing.releaseFactIds.push(fact.id);
      continue;
    }
    targets.set(key, {
      kind: fact.kind,
      concept: fact.concept,
      term,
      relationship: fact.relationship,
      releaseFactIds: [fact.id],
    });
    if (targets.size === maximum) break;
  }
  return [...targets.values()];
}

export function isRelevantConceptReference(
  match: GrepMatch,
  target: ApplicabilitySearchTarget,
): boolean {
  if (!isSafeRepositoryPath(match.path) || isSensitiveRepositoryPath(match.path)) return false;
  if (/(^|\/)(?:disabled|workflows-disabled)(\/|$)/i.test(match.path)) return false;
  const basename = match.path.split("/").at(-1) ?? match.path;
  if (
    /^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$/.test(
      basename,
    ) ||
    /(^|\/)(?:readme|changelog)(?:\.|$)/i.test(match.path)
  ) {
    return false;
  }
  if (target.kind === "runtime" || (target.kind === "version-constraint" && target.term === "node")) {
    return (
      /(^|\/)(?:\.nvmrc|\.node-version)$/.test(match.path) ||
      (/package\.json$/.test(match.path) && /["']node["']\s*:/.test(match.matchedLine)) ||
      /\bnode-version\s*:/.test(match.matchedLine)
    );
  }
  if (target.kind === "version-constraint") {
    return /(^|\/)package\.json$/.test(match.path) &&
      new RegExp(`["']${escapeRegex(target.term)}["']\\s*:`).test(match.matchedLine);
  }
  const escaped = escapeRegex(target.term);
  if (target.kind === "cli-flag") {
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$|[=,:])`).test(match.matchedLine);
  }
  if (target.kind === "package" || target.kind === "entrypoint") {
    return new RegExp(`["']${escaped}(?:["'/]|$)`).test(match.matchedLine);
  }
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(
    match.matchedLine,
  );
}

function searchTerm(fact: ReleaseFactNode): string | null {
  if (fact.kind === "runtime") return "node";
  if (fact.kind === "api-symbol") {
    const symbol = fact.concept.split("#").at(-1)!;
    return genericApiSymbols.has(symbol) ? null : symbol;
  }
  if (fact.kind === "config-key" && fact.concept === "node_modules") return null;
  return fact.concept;
}

function compareFacts(left: ReleaseFactNode, right: ReleaseFactNode): number {
  return relationshipPriority(left.relationship) - relationshipPriority(right.relationship) ||
    left.kind.localeCompare(right.kind) || left.concept.localeCompare(right.concept);
}

function relationshipPriority(value: FactRelationship): number {
  if (value === "breaking") return 0;
  if (value === "compatible") return 1;
  if (value === "changed") return 2;
  return 3;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
