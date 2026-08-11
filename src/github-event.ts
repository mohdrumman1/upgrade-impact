import { createHash } from "node:crypto";

export const UPGRADE_IMPACT_COMMENT_MARKER = "<!-- upgrade-impact-report -->";

export type PullRequestEvent = {
  action: string;
  repository: { full_name: string; private: boolean };
  pull_request: {
    number: number;
    base: { sha: string; repo: { full_name: string; private: boolean } };
    head: { sha: string; repo: { full_name: string; private: boolean } | null };
  };
};

const SUPPORTED_ACTIONS = new Set(["opened", "reopened", "ready_for_review", "synchronize"]);

export function parsePullRequestEvent(value: unknown): PullRequestEvent {
  if (!isRecord(value) || typeof value.action !== "string") {
    throw new Error("Invalid GitHub event: missing action");
  }
  if (!SUPPORTED_ACTIONS.has(value.action)) {
    throw new Error(`Unsupported pull request action: ${value.action}`);
  }
  const repository = parseRepository(value.repository, "repository");
  const pullRequest = value.pull_request;
  if (!isRecord(pullRequest) || !Number.isSafeInteger(pullRequest.number) || Number(pullRequest.number) < 1) {
    throw new Error("Invalid GitHub event: missing pull request number");
  }
  const base = parsePullRef(pullRequest.base, "base");
  const head = pullRequest.head;
  if (!isRecord(head)) throw new Error("Invalid GitHub event: missing head reference");
  const headSha = parseSha(head.sha, "head");
  const headRepository = head.repo === null ? null : parseRepository(head.repo, "head repository");
  if (repository.full_name !== base.repo.full_name) {
    throw new Error("GitHub event repository does not match pull request base repository");
  }
  if (repository.private || base.repo.private || headRepository?.private) {
    throw new Error("Private repositories are not enabled for the public beta");
  }
  return {
    action: value.action,
    repository,
    pull_request: {
      number: Number(pullRequest.number),
      base,
      head: { sha: headSha, repo: headRepository },
    },
  };
}

export function analysisRunId(
  repository: string,
  pullRequest: number,
  baseSha: string,
  headSha: string,
): string {
  validateRepository(repository);
  parseSha(baseSha, "base");
  parseSha(headSha, "head");
  const readable = repository.replace("/", "__");
  const digest = createHash("sha256")
    .update(`${repository}:${pullRequest}:${baseSha}:${headSha}`)
    .digest("hex")
    .slice(0, 12);
  return `${readable}__pr-${pullRequest}__${digest}`;
}

export function renderComment(report: string, metadata: { headSha: string; spendUsd?: number }): string {
  const spend = metadata.spendUsd === undefined ? "" : ` · model cost US$${metadata.spendUsd.toFixed(4)}`;
  return `${UPGRADE_IMPACT_COMMENT_MARKER}\n${report.trim()}\n\n---\n_UpgradeImpact · analysed \`${metadata.headSha.slice(0, 12)}\`${spend}_\n`;
}

function parsePullRef(value: unknown, name: string) {
  if (!isRecord(value)) throw new Error(`Invalid GitHub event: missing ${name} reference`);
  return { sha: parseSha(value.sha, name), repo: parseRepository(value.repo, `${name} repository`) };
}

function parseRepository(value: unknown, name: string) {
  if (!isRecord(value) || typeof value.full_name !== "string" || typeof value.private !== "boolean") {
    throw new Error(`Invalid GitHub event: missing ${name}`);
  }
  validateRepository(value.full_name);
  return { full_name: value.full_name, private: value.private };
}

function parseSha(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`Invalid GitHub event: unsafe ${name} SHA`);
  }
  return value;
}

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Unsafe repository identifier: ${repository}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
