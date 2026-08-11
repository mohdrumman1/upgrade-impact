import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";

type EvalCase = {
  id: string;
  repository: string;
  pullRequest: number;
  reason: string;
};

type PullRequest = {
  html_url: string;
  title: string;
  merged_at: string | null;
  base: { sha: string };
  head: { sha: string };
};

type PullFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
};

type ContentResponse = { content: string; encoding: "base64" };

const execFile = promisify(execFileCallback);
const { values } = parseArgs({
  options: {
    limit: { type: "string" },
    start: { type: "string", default: "0" },
  },
  strict: true,
});

const cases = JSON.parse(await readFile("evals/cases.json", "utf8")) as EvalCase[];
const start = Number(values.start);
const limit = values.limit === undefined ? cases.length - start : Number(values.limit);
if (!Number.isSafeInteger(start) || start < 0) {
  throw new Error("--start must be a non-negative integer");
}
if (!Number.isSafeInteger(limit) || limit < 1) {
  throw new Error("--limit must be a positive integer");
}

for (const evalCase of cases.slice(start, start + limit)) {
  const directory = `scratch/evals/${evalCase.id}`;
  await mkdir(directory, { recursive: true });

  const pull = await gh<PullRequest>(
    `repos/${evalCase.repository}/pulls/${evalCase.pullRequest}`,
  );
  const files = await gh<PullFile[]>(
    `repos/${evalCase.repository}/pulls/${evalCase.pullRequest}/files?per_page=100`,
  );
  const manifests = files.filter((file) => file.filename.endsWith("package.json"));

  const metadata = {
    ...evalCase,
    url: pull.html_url,
    title: pull.title,
    mergedAt: pull.merged_at,
    baseSha: pull.base.sha,
    headSha: pull.head.sha,
    changedFiles: files,
    manifests: manifests.map((file) => file.filename),
  };
  await writeFile(`${directory}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

  for (const manifest of manifests) {
    const manifestDirectory = `${directory}/${safePath(manifest.filename)}`;
    await mkdir(manifestDirectory, { recursive: true });
    const [before, after] = await Promise.all([
      getContent(evalCase.repository, manifest.filename, pull.base.sha),
      getContent(evalCase.repository, manifest.filename, pull.head.sha),
    ]);
    await Promise.all([
      writeFile(`${manifestDirectory}/before.json`, before),
      writeFile(`${manifestDirectory}/after.json`, after),
      writeFile(`${manifestDirectory}/path.txt`, `${manifest.filename}\n`),
    ]);
  }

  process.stdout.write(
    `${evalCase.id}: ${manifests.length} package manifest${manifests.length === 1 ? "" : "s"}\n`,
  );
}

async function gh<T>(endpoint: string): Promise<T> {
  const { stdout } = await execFile("gh", ["api", endpoint], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function getContent(
  repository: string,
  path: string,
  reference: string,
): Promise<string> {
  const response = await gh<ContentResponse>(
    `repos/${repository}/contents/${encodePath(path)}?ref=${reference}`,
  );
  if (response.encoding !== "base64") {
    throw new Error(`Unsupported GitHub content encoding for ${repository}/${path}`);
  }
  return Buffer.from(response.content.replaceAll("\n", ""), "base64").toString("utf8");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function safePath(path: string): string {
  return path.replaceAll("/", "__").replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}
