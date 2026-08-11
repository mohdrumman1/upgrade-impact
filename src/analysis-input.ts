import type { EvidenceExcerpt } from "./evidence.ts";
import type {
  ChangelogExcerpt,
  DocumentationExcerpt,
  ReleaseExcerpt,
} from "./release-evidence.ts";
import type { DependencyChange } from "./types.ts";

export type AnalysisDependencyInput = {
  dependency: DependencyChange;
  repositoryEvidence: EvidenceExcerpt[];
  officialEvidence: Array<
    | ({ source: "github-release" } & ReleaseExcerpt)
    | ({ source: "changelog" } & ChangelogExcerpt)
    | ({ source: "official-doc" } & DocumentationExcerpt)
  >;
  evidenceGap: string | null;
};

export type AnalysisInput = {
  repository: string;
  pullRequest: number;
  baseSha: string;
  dependencies: AnalysisDependencyInput[];
};

export function renderAnalysisPrompt(stablePrompt: string, input: AnalysisInput): string {
  const prefix = stablePrompt.trimEnd();
  const dynamic = JSON.stringify(input, null, 2);
  return `${prefix}\n\n<upgrade-impact-input>\n${dynamic}\n</upgrade-impact-input>\n`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
