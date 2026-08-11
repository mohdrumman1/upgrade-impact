import type { AnalysisInput } from "./analysis-input.ts";
import type { AnalysisResult } from "./analysis-schema.ts";

export type VerificationResult = {
  valid: boolean;
  errors: string[];
};

export function verifyAnalysisEvidence(
  result: AnalysisResult,
  input: AnalysisInput,
): VerificationResult {
  const repositoryRanges = new Map<string, Array<{ start: number; end: number }>>();
  const officialUrls = new Set<string>();

  for (const dependency of input.dependencies) {
    for (const excerpt of dependency.repositoryEvidence) {
      const ranges = repositoryRanges.get(excerpt.path) ?? [];
      ranges.push({ start: excerpt.startLine, end: excerpt.endLine });
      repositoryRanges.set(excerpt.path, ranges);
    }
    for (const evidence of dependency.officialEvidence) officialUrls.add(evidence.url);
  }

  const errors: string[] = [];
  for (const [findingIndex, finding] of result.findings.entries()) {
    for (const reference of finding.repositoryEvidence) {
      const parsed = parseRepositoryReference(reference);
      const supported =
        parsed !== null &&
        (repositoryRanges.get(parsed.path) ?? []).some(
          (range) => parsed.start >= range.start && parsed.end <= range.end,
        );
      if (!supported) {
        errors.push(`finding ${findingIndex} has unsupported repository evidence: ${reference}`);
      }
    }
    for (const url of finding.releaseEvidence) {
      if (!officialUrls.has(url)) {
        errors.push(`finding ${findingIndex} has unsupported official evidence: ${url}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function parseRepositoryReference(
  value: string,
): { path: string; start: number; end: number } | null {
  const match = /^(.*?):(\d+)(?:-(\d+))?$/.exec(value);
  if (!match) return null;
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
    return null;
  }
  return { path: match[1]!, start, end };
}
