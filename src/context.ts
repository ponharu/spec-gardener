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
            userContentEdits(first: 1) {
              nodes {
                body
              }
            }
          }
        }
      }`,
      { owner, repo, number },
    );
    const originalFromEdits =
      itemType === "issue"
        ? response.repository?.issue?.userContentEdits?.nodes?.[0]?.body
        : response.repository?.pullRequest?.userContentEdits?.nodes?.[0]?.body;
    if (originalFromEdits) {
      return originalFromEdits;
    }
  } catch (error) {
    const message = error instanceof Error ? (error.message ?? error.stack) : String(error);
    const label = itemType === "issue" ? "issue description" : "pull request description";
    core.warning(`Failed to fetch original ${label}: ${message}`);
  }
  return fallbackBody;
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
  const originalDescription = await fetchOriginalDescription(
    octokit,
    owner,
    repo,
    issueNumber,
    "issue",
    issueBody,
  );

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
    originalDescription,
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
  const originalDescription = await fetchOriginalDescription(
    octokit,
    owner,
    repo,
    pullNumber,
    "pullRequest",
    pullBody,
  );

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
    originalDescription,
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

export const applyResetContext = (context: SpecContext, resetCreatedAt?: string): SpecContext => {
  if (!resetCreatedAt) {
    return context;
  }
  const resetTime = Date.parse(resetCreatedAt);
  if (Number.isNaN(resetTime)) {
    return context;
  }
  return {
    ...context,
    body: context.originalDescription,
    comments: context.comments.filter((comment) => {
      const commentTime = Date.parse(comment.createdAt);
      if (Number.isNaN(commentTime)) {
        return false;
      }
      return commentTime >= resetTime;
    }),
  };
};
