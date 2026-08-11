export type GitHubPullRequest = {
  number: number;
  html_url: string;
  title: string;
  state: string;
  base: {
    sha: string;
    repo: { full_name: string; private: boolean; clone_url: string };
  };
  head: {
    sha: string;
    repo: { full_name: string; private: boolean; clone_url: string } | null;
  };
};

export type GitHubPullFile = {
  filename: string;
  status: string;
  previous_filename?: string;
};

export type GitHubIssueComment = {
  id: number;
  body: string | null;
};

export type GitHubContent = {
  type: string;
  path: string;
  encoding: string;
  content: string;
};

export class GitHubApi {
  readonly #token: string;
  readonly #apiUrl: string;

  constructor(token: string, apiUrl = "https://api.github.com") {
    if (!token) throw new Error("A GitHub token is required");
    this.#token = token;
    this.#apiUrl = apiUrl.replace(/\/$/, "");
  }

  async getPullRequest(repository: string, pullRequest: number): Promise<GitHubPullRequest> {
    return this.request(`/repos/${repository}/pulls/${pullRequest}`);
  }

  async listPullFiles(repository: string, pullRequest: number): Promise<GitHubPullFile[]> {
    return this.paginate(`/repos/${repository}/pulls/${pullRequest}/files`);
  }

  async getContent(
    repository: string,
    path: string,
    reference: string,
  ): Promise<string | null> {
    const endpoint = `/repos/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(reference)}`;
    const response = await this.requestOrNull<GitHubContent>(endpoint);
    if (response === null) return null;
    if (response.type !== "file" || response.path !== path || response.encoding !== "base64") {
      throw new Error(`Unsupported GitHub content response for ${repository}/${path}`);
    }
    return Buffer.from(response.content.replaceAll("\n", ""), "base64").toString("utf8");
  }

  async listReleases<T>(repository: string): Promise<T[]> {
    return this.request<T[]>(`/repos/${repository}/releases?per_page=100`);
  }

  async getContentResponse(
    repository: string,
    path: string,
    reference: string,
  ): Promise<GitHubContent | null> {
    return this.requestOrNull(
      `/repos/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(reference)}`,
    );
  }

  async upsertPullRequestComment(
    repository: string,
    pullRequest: number,
    marker: string,
    body: string,
  ): Promise<{ id: number; operation: "created" | "updated" }> {
    const comments = await this.paginate<GitHubIssueComment>(
      `/repos/${repository}/issues/${pullRequest}/comments`,
    );
    const existing = comments.find((comment) => comment.body?.includes(marker));
    if (existing) {
      const updated = await this.request<GitHubIssueComment>(
        `/repos/${repository}/issues/comments/${existing.id}`,
        { method: "PATCH", body: { body } },
      );
      return { id: updated.id, operation: "updated" };
    }
    const created = await this.request<GitHubIssueComment>(
      `/repos/${repository}/issues/${pullRequest}/comments`,
      { method: "POST", body: { body } },
    );
    return { id: created.id, operation: "created" };
  }

  async request<T>(
    endpoint: string,
    options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
  ): Promise<T> {
    const request: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.#token}`,
        "user-agent": "forma-upgrade-impact-action",
        "x-github-api-version": "2022-11-28",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      signal: AbortSignal.timeout(20_000),
    };
    if (options.body !== undefined) request.body = JSON.stringify(options.body);
    const response = await fetch(`${this.#apiUrl}${endpoint}`, request);
    if (!response.ok) {
      throw new GitHubApiError(response.status, endpoint);
    }
    return (await response.json()) as T;
  }

  async requestOrNull<T>(endpoint: string): Promise<T | null> {
    try {
      return await this.request<T>(endpoint);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async paginate<T>(endpoint: string, maximumPages = 10): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maximumPages; page += 1) {
      const separator = endpoint.includes("?") ? "&" : "?";
      const batch = await this.request<T[]>(`${endpoint}${separator}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error(`GitHub pagination exceeded ${maximumPages} pages for ${endpoint}`);
  }
}

export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, endpoint: string) {
    super(`GitHub API returned HTTP ${status} for ${endpoint}`);
    this.status = status;
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
