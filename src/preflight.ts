import type { AnalysisInput } from "./analysis-input.ts";
import type { EvidenceExcerpt } from "./evidence.ts";

export type PreflightFinding = {
  kind: "removed-dependency-still-referenced";
  dependency: string;
  severity: "high";
  summary: string;
  repositoryEvidence: Array<Pick<EvidenceExcerpt, "path" | "startLine" | "endLine" | "content">>;
  recommendedChecks: string[];
};

export function buildPreflightFindings(input: AnalysisInput): PreflightFinding[] {
  return input.dependencies.flatMap((item) => {
    if (item.dependency.kind !== "removed") return [];
    const references = item.repositoryEvidence
      .filter((excerpt) => isOperationalReference(item.dependency.name, excerpt))
      .slice(0, 3);
    if (references.length === 0) return [];
    return [{
      kind: "removed-dependency-still-referenced" as const,
      dependency: item.dependency.name,
      severity: "high" as const,
      summary: `${item.dependency.name} is removed from the manifest but remains referenced by repository code or scripts.`,
      repositoryEvidence: references,
      recommendedChecks: [
        `Replace the remaining ${item.dependency.name} invocation or restore the dependency before merging.`,
      ],
    }];
  });
}

function isOperationalReference(dependency: string, excerpt: EvidenceExcerpt): boolean {
  if (
    /(^|\/)(?:docs?|readme|changelog)(\/|\.|$)/i.test(excerpt.path) ||
    /(^|\/)AGENTS\.md$/i.test(excerpt.path)
  ) {
    return false;
  }
  if (!/(^|\/)package\.json$/.test(excerpt.path)) return true;
  const declaration = new RegExp(
    `^[^\\n]*["']${escapeRegex(dependency)}["']\\s*:\\s*["'][^"']+["'][^\\n]*$`,
    "gm",
  );
  const withoutDeclaration = excerpt.content.replace(declaration, "");
  return withoutDeclaration === excerpt.content ||
    new RegExp(`["']${escapeRegex(dependency)}(?:["'/]|$)`).test(withoutDeclaration);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
