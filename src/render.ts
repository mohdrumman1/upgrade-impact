import type { DependencyChange } from "./types.ts";

export function renderMarkdown(changes: readonly DependencyChange[]): string {
  if (changes.length === 0) {
    return "## UpgradeImpact\n\nNo dependency manifest changes detected.\n";
  }

  const lines = [
    "## UpgradeImpact",
    "",
    `${changes.length} dependency change${changes.length === 1 ? "" : "s"} detected.`,
    "",
    "| Package | Section | Before | After | Change | Version delta |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const change of changes) {
    lines.push(
      `| ${escapeCell(change.name)} | ${escapeCell(change.section)} | ${formatSpec(change.before)} | ${formatSpec(change.after)} | ${change.kind} | ${change.versionDelta} |`,
    );
  }

  lines.push(
    "",
    "> This deterministic summary does not yet include release-note or repository-usage analysis.",
    "",
  );

  return lines.join("\n");
}

function formatSpec(value: string | null): string {
  return value === null ? "_none_" : `\`${escapeInlineCode(value)}\``;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeInlineCode(value: string): string {
  return value.replaceAll("`", "\\`").replaceAll("|", "\\|").replaceAll("\n", " ");
}
