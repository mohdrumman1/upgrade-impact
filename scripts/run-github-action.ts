import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GitHubApi } from "../src/github-api.ts";
import {
  parsePullRequestEvent,
  renderComment,
  UPGRADE_IMPACT_COMMENT_MARKER,
} from "../src/github-event.ts";
import { runPublicPullRequestPipeline } from "../src/pull-request-pipeline.ts";

try {
  const eventPath = requiredEnvironment("GITHUB_EVENT_PATH");
  const eventName = requiredEnvironment("GITHUB_EVENT_NAME");
  if (eventName !== "pull_request" && eventName !== "pull_request_target") {
    throw new Error(`UpgradeImpact requires a pull request event, received ${eventName}`);
  }
  const event = parsePullRequestEvent(JSON.parse(await readFile(eventPath, "utf8")));
  const githubToken = input("github-token") || requiredEnvironment("GITHUB_TOKEN");
  const openRouterApiKey = input("openrouter-api-key") || process.env.OPENROUTER_API_KEY;
  const hostedEndpoint = input("hosted-endpoint");
  const hostedToken = input("license-key");
  const stateDirectory = resolve(input("state-directory") || ".upgrade-impact");
  const maximumUsd = positiveNumber(input("max-usd") || "0.02", "max-usd");
  const github = new GitHubApi(githubToken, process.env.GITHUB_API_URL);

  const result = await runPublicPullRequestPipeline({
    repository: event.repository.full_name,
    pullRequest: event.pull_request.number,
    stateDirectory,
    githubToken,
    ...(openRouterApiKey ? { openRouterApiKey } : {}),
    ...(hostedEndpoint ? { hostedEndpoint } : {}),
    ...(hostedToken ? { hostedToken } : {}),
    ...(process.env.GITHUB_API_URL ? { githubApiUrl: process.env.GITHUB_API_URL } : {}),
    maximumUsd,
    expectedHeadSha: event.pull_request.head.sha,
    notice: (message) => process.stdout.write(`${message}\n`),
  });
  const report = await readFile(result.reportPath, "utf8");
  let commentOperation = "skipped";
  if (booleanInput(input("post-comment") || "true")) {
    const comment = renderComment(report, {
      headSha: result.headSha,
      ...(result.model ? { spendUsd: result.model.spendUsd } : {}),
    });
    const upserted = await github.upsertPullRequestComment(
      event.repository.full_name,
      event.pull_request.number,
      UPGRADE_IMPACT_COMMENT_MARKER,
      comment,
    );
    commentOperation = upserted.operation;
  }
  await Promise.all([
    output("run-id", result.runId),
    output("report-path", result.reportPath),
    output("cache-hit", String(result.cacheHit)),
    output("comment-operation", commentOperation),
    output("spend-usd", (result.model?.spendUsd ?? 0).toFixed(6)),
  ]);
  process.stdout.write(
    `UpgradeImpact ${commentOperation} report for ${event.repository.full_name}#${event.pull_request.number}\n`,
  );
} catch (error) {
  process.stderr.write(`UpgradeImpact failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function input(name: string): string {
  return process.env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function positiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0.05) {
    throw new Error(`${name} must be above zero and at most 0.05`);
  }
  return parsed;
}

function booleanInput(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("post-comment must be true or false");
}

async function output(name: string, value: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) await appendFile(outputPath, `${name}=${value}\n`);
}
