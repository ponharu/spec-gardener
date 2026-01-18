import core from "@actions/core";
import { Octokit } from "octokit";
import type { SpecContext } from "./adapters";
import { FOOTER } from "./constants";

type UserContentEditsResponse = {
  repository?: {
    issue?: {
      userContentEdits?: { nodes?: Array<{ body?: string | null }> };
    };
    pullRequest?: {
      userContentEdits?: { nodes?: Array<{ body?: string | null }> };
    };
  };
};

const stripFooter = (body: string): string => {
  const footerIndex = body.indexOf(FOOTER);
  if (footerIndex === -1) {
    return body;
  }
  const withoutFooter = body.slice(0, footerIndex).trimEnd();
  return withoutFooter.replace(/\n---\s*$/, "").trimEnd();
};

const fetchOriginalDescription = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  itemType: "issue" | "pullRequest",
  fallbackBody: string,
): Promise<string> => {
  try {
    const response = await octokit.graphql<UserContentEditsResponse>(
      `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          ${itemType}(number: $number) {
            userContentEdits(last: 100) {
              nodes {
                body
              }
            }
          }
        }
      }`,
      { owner, repo, number },
    );
    const content = response.repository?.[itemType];
    const nodes = content?.userContentEdits?.nodes ?? [];
    for (const node of nodes.slice().reverse()) {
      const body = node?.body;
      if (typeof body === "string" && !body.includes(FOOTER)) {
        return body;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? (error.message ?? error.stack) : String(error);
    const label = itemType === "issue" ? "issue description" : "pull request description";
    core.warning(`Failed to fetch original ${label}: ${message}`);
  }
  return stripFooter(fallbackBody);
};

export const fetchIssueContext = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<SpecContext> => {
  const issueResponse = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  const issueBody = issueResponse.data.body ?? "";

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return {
    title: issueResponse.data.title ?? "",
    body: stripFooter(issueBody),
    author: issueResponse.data.user?.login ?? "unknown",
    comments: comments.map((comment) => ({
      author: comment.user?.login ?? "unknown",
      body: comment.body ?? "",
      createdAt: comment.created_at ?? "",
    })),
  };
};

export const fetchPullRequestContext = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<SpecContext> => {
  const pullResponse = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  const pullBody = pullResponse.data.body ?? "";

  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  return {
    title: pullResponse.data.title ?? "",
    body: stripFooter(pullBody),
    author: pullResponse.data.user?.login ?? "unknown",
    comments: comments.map((comment) => ({
      author: comment.user?.login ?? "unknown",
      body: comment.body ?? "",
      createdAt: comment.created_at ?? "",
    })),
    changedFiles: files.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
    })),
  };
};

export const applyResetContext = async (
  context: SpecContext,
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  itemType: "issue" | "pullRequest",
  resetCreatedAt?: string,
): Promise<SpecContext> => {
  if (!resetCreatedAt) {
    return context;
  }
  const resetTime = Date.parse(resetCreatedAt);
  if (Number.isNaN(resetTime)) {
    return context;
  }
  const resetBody = await fetchOriginalDescription(
    octokit,
    owner,
    repo,
    number,
    itemType,
    context.body,
  );
  return {
    ...context,
    body: resetBody,
    comments: context.comments.filter((comment) => {
      const commentTime = Date.parse(comment.createdAt);
      if (Number.isNaN(commentTime)) {
        return false;
      }
      return commentTime >= resetTime;
    }),
  };
};
