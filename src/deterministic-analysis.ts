import type { AnalysisFinding, AnalysisResult, Risk } from "./analysis-schema.ts";
import type {
  ApplicabilityEdge,
  ApplicabilityGraph,
  ReleaseFactNode,
  RepositoryUsageNode,
} from "./applicability.ts";

export function buildDeterministicAnalysis(graph: ApplicabilityGraph): AnalysisResult {
  const candidates = graph.dependencies.flatMap((dependency) => {
    const facts = new Map(dependency.releaseFacts.map((fact) => [fact.id, fact]));
    const usages = new Map(dependency.repositoryUsages.map((usage) => [usage.id, usage]));
    return dependency.edges.flatMap((edge) => {
      const fact = facts.get(edge.releaseFactId);
      const usage = usages.get(edge.repositoryUsageId);
      return fact && usage ? [{ edge, fact, usage }] : [];
    });
  });
  const unique = uniqueCandidates(preferSpecificCandidates(candidates)).slice(0, 4);
  const findings = unique.map(({ edge, fact, usage }) => renderFinding(edge, fact, usage));
  const risk = aggregateRisk(unique.map(({ edge, fact }) => findingRisk(edge, fact)));
  return {
    risk,
    confidence: findings.length === 0 ? 0.95 : 0.9,
    summary:
      findings.length === 0
        ? "No deterministic release-to-repository applicability relationship was found."
        : `${findings.length} deterministic upgrade check${findings.length === 1 ? "" : "s"} matched release facts to repository usage.`,
    findings,
    omittedConcerns: findings.length === 0
      ? ["Release concerns without a typed repository relationship were omitted."]
      : [],
  };
}

function preferSpecificCandidates<T extends { edge: ApplicabilityEdge }>(candidates: T[]): T[] {
  const dependenciesWithSpecificEdges = new Set(
    candidates
      .filter(({ edge }) => edge.kind !== "dependency")
      .map(({ edge }) => edge.dependency),
  );
  const versionConcepts = new Set(
    candidates
      .filter(({ edge }) => edge.kind === "version-constraint")
      .map(({ edge }) => `${edge.dependency}\0${edge.concept}`),
  );
  return candidates.filter(({ edge }) => {
    if (edge.kind === "dependency" && dependenciesWithSpecificEdges.has(edge.dependency)) {
      return false;
    }
    if (edge.kind === "runtime" && versionConcepts.has(`${edge.dependency}\0${edge.concept}`)) {
      return false;
    }
    return true;
  });
}

function renderFinding(
  edge: ApplicabilityEdge,
  fact: ReleaseFactNode,
  usage: RepositoryUsageNode,
): AnalysisFinding {
  const repositoryEvidence = [`${usage.path}:${usage.startLine}-${usage.endLine}`];
  const releaseEvidence = [fact.releaseUrl];
  if (edge.rule === "below-minimum" || edge.rule === "satisfies-minimum") {
    const below = edge.rule === "below-minimum";
    return {
      title: below
        ? `${displayConcept(edge.concept)} is below the dependency minimum`
        : `${displayConcept(edge.concept)} clears the dependency minimum`,
      impact: `The release requires ${displayConcept(edge.concept)} ${fact.minimumVersion ?? "unknown"}; the repository declares ${usage.repositoryVersion ?? "unknown"}.`,
      repositoryEvidence,
      releaseEvidence,
      recommendedChecks: [
        below
          ? `Raise the declared ${displayConcept(edge.concept)} version and rerun the existing build and test commands.`
          : `Keep the declared ${displayConcept(edge.concept)} version covered by CI while validating the upgrade.`,
      ],
    };
  }
  if (edge.kind === "dependency") {
    return {
      title: `Verify ${edge.dependency} in its observed repository path`,
      impact: `The repository directly uses ${edge.dependency}. The official source states: ${fact.statement}`.slice(0, 600),
      repositoryEvidence,
      releaseEvidence,
      recommendedChecks: [`Run the existing command or test covering ${usage.path} after the upgrade.`],
    };
  }
  return {
    title: `Review ${displayConcept(edge.concept)} for ${edge.dependency}`,
    impact: `The official change and repository usage match the typed concept ${displayConcept(edge.concept)}. ${fact.statement}`.slice(0, 600),
    repositoryEvidence,
    releaseEvidence,
    recommendedChecks: [`Exercise ${displayConcept(edge.concept)} through the repository path shown above.`],
  };
}

function uniqueCandidates<T extends { edge: ApplicabilityEdge; fact: ReleaseFactNode }>(
  candidates: T[],
): T[] {
  const seen = new Set<string>();
  return candidates.filter(({ edge, fact }) => {
    const key = `${edge.dependency}\0${edge.kind}\0${edge.concept}\0${edge.rule}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findingRisk(edge: ApplicabilityEdge, fact: ReleaseFactNode): Risk {
  if (edge.rule === "below-minimum") return "high";
  if (edge.rule === "satisfies-minimum") return "low";
  if (fact.relationship === "breaking") return "medium";
  return "low";
}

function aggregateRisk(values: Risk[]): Risk {
  if (values.includes("high")) return "high";
  if (values.includes("medium")) return "medium";
  if (values.includes("low")) return "low";
  return "unknown";
}

function displayConcept(value: string): string {
  return value.split("#").at(-1)!.replaceAll("-", " ");
}
