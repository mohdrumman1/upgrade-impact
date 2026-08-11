import type { AnalysisResult } from "./analysis-schema.ts";
import type { PreflightFinding } from "./preflight.ts";

export function renderAnalysisMarkdown(
  analysis: AnalysisResult,
  preflightFindings: readonly PreflightFinding[] = [],
): string {
  const lines = [
    "## UpgradeImpact",
    "",
    `**Risk:** ${analysis.risk} · **Confidence:** ${Math.round(analysis.confidence * 100)}%`,
    "",
    clean(analysis.summary),
  ];

  for (const finding of preflightFindings) {
    lines.push(
      "",
      `### ${clean(finding.dependency)} is removed but still referenced`,
      "",
      clean(finding.summary),
      "",
      "Repository evidence:",
      ...finding.repositoryEvidence.map(
        (item) => `- \`${clean(item.path)}:${item.startLine}-${item.endLine}\``,
      ),
      "",
      "Recommended checks:",
      ...finding.recommendedChecks.map((item) => `- ${clean(item)}`),
    );
  }

  for (const finding of analysis.findings) {
    lines.push(
      "",
      `### ${clean(finding.title)}`,
      "",
      clean(finding.impact),
      "",
      "Repository evidence:",
      ...finding.repositoryEvidence.map((item) => `- ${clean(item)}`),
      "",
      "Official evidence:",
      ...finding.releaseEvidence.map((item) => `- ${item}`),
      "",
      "Recommended checks:",
      ...finding.recommendedChecks.map((item) => `- ${clean(item)}`),
    );
  }

  if (preflightFindings.length === 0 && analysis.findings.length === 0) {
    lines.push("", "No evidence-backed repository-specific impact was found.");
  }

  lines.push("", "_Generated from bounded repository excerpts and official release evidence._", "");
  return lines.join("\n");
}

function clean(value: string): string {
  return value.replaceAll("\r", " ").replaceAll("\n", " ").trim();
}
