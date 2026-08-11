export type GrepMatch = {
  path: string;
  line: number;
  matchedLine: string;
};

export type EvidenceExcerpt = {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
};

export function packageReferenceTerms(packageName: string, binMetadata: unknown): string[] {
  const terms = [packageName];
  if (typeof binMetadata === "string") {
    terms.push(packageName.split("/").at(-1)!);
  } else if (isRecord(binMetadata)) {
    terms.push(...Object.keys(binMetadata));
  }
  return terms
    .filter(
      (term, index, values) =>
        values.indexOf(term) === index &&
        term.length > 0 &&
        term.length <= 100 &&
        (term === packageName || /^[A-Za-z0-9_.-]+$/.test(term)),
    )
    .slice(0, 4);
}

export function parseGitGrep(output: string): GrepMatch[] {
  const matches: GrepMatch[] = [];
  for (const rawLine of output.split("\n")) {
    if (rawLine.length === 0) continue;
    const match = /^[^:]+:(.*?):(\d+):(.*)$/.exec(rawLine);
    if (!match) continue;
    const line = Number(match[2]);
    if (!Number.isSafeInteger(line) || line < 1 || !isSafeRepositoryPath(match[1]!)) {
      continue;
    }
    matches.push({ path: match[1]!, line, matchedLine: match[3]! });
  }
  return matches;
}

export function selectBoundedMatches(
  matches: readonly GrepMatch[],
  maximum: number = 8,
): GrepMatch[] {
  const selected: GrepMatch[] = [];
  const seen = new Set<string>();

  for (const match of [...matches].sort(compareMatches)) {
    const key = match.path;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(match);
    if (selected.length === maximum) break;
  }
  return selected;
}

export function isRelevantPackageReference(match: GrepMatch, packageName: string): boolean {
  if (isSensitiveRepositoryPath(match.path)) return false;
  const basename = match.path.split("/").at(-1) ?? match.path;
  if (
    basename === ".gitignore" ||
    basename === ".dockerignore" ||
    basename === "package-lock.json" ||
    basename === "npm-shrinkwrap.json" ||
    basename === "pnpm-lock.yaml" ||
    basename === "yarn.lock" ||
    basename === "bun.lock" ||
    /(^|\/)(readme|changelog)(\.|$)/i.test(match.path)
  ) {
    return false;
  }
  if (basename === "package.json") return true;

  const escaped = escapeRegex(packageName);
  const quotedReference = new RegExp(`["']${escaped}(?:["'/]|$)`);
  const commandReference = new RegExp(`(?:^|[\\s:])${escaped}(?:[\\s/:.-]|$)`);
  return quotedReference.test(match.matchedLine) || commandReference.test(match.matchedLine);
}

export function buildExcerpt(
  fileContent: string,
  match: GrepMatch,
  radius: number = 2,
  maximumCharacters: number = 1_200,
): EvidenceExcerpt {
  const lines = fileContent.split("\n");
  const startLine = Math.max(1, match.line - radius);
  const endLine = Math.min(lines.length, match.line + radius);
  const content = lines
    .slice(startLine - 1, endLine)
    .map((line, index) => `${startLine + index}: ${line}`)
    .join("\n")
    .slice(0, maximumCharacters);
  return { path: match.path, startLine, endLine, content: redactLikelySecrets(content) };
}

export function isSensitiveRepositoryPath(path: string): boolean {
  return (
    /(^|\/)(\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_(rsa|dsa|ecdsa|ed25519)(?:\.pub)?$)/i.test(
      path,
    ) || /\.(pem|key|p12|pfx)$/i.test(path)
  );
}

export function redactLikelySecrets(content: string): string {
  return content
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]")
    .replace(
      /\b(authorization)(\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
      "$1$2$3Bearer [REDACTED]",
    )
    .replace(
      /\b(api[_-]?key|secret|token|password|passwd)(\s*[:=]\s*)(["']?)[^\s"',}]+/gi,
      "$1$2$3[REDACTED]",
    )
    .replace(/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g, "[REDACTED TOKEN]");
}

export function isSafeRepositoryPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 500 &&
    !path.startsWith("/") &&
    !path.includes("\0") &&
    !path.includes("\n") &&
    !path.split("/").includes("..")
  );
}

function compareMatches(left: GrepMatch, right: GrepMatch): number {
  const leftPriority = evidencePriority(left.path);
  const rightPriority = evidencePriority(right.path);
  return (
    leftPriority - rightPriority ||
    left.path.localeCompare(right.path) ||
    left.line - right.line
  );
}

function evidencePriority(path: string): number {
  if (/package\.json$/.test(path)) return 3;
  if (/(^|\/)(test|tests|__tests__|fixtures)(\/|$)/i.test(path)) return 2;
  if (/\.(config|rc)\.[cm]?[jt]s$/.test(path) || /config/i.test(path)) return 1;
  return 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
