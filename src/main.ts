import core from "@actions/core";
import { Octokit } from "octokit";
import { getAdapter, type CliResult, type SpecContext } from "./adapters";
import { shouldProcess, type EventPayload } from "./commands";
import { applyResetContext, fetchIssueContext, fetchPullRequestContext } from "./context";
import { DEFAULT_AGENT_TIMEOUT_MS, THUMBS_UP_REACTION } from "./constants";
import {
  buildComment,
  buildErrorComment,
  buildHelpComment,
  buildSpecBody,
  normalizeTitle,
} from "./format";
import { formatLogBlock, formatParsedResult } from "./logging";

const postErrorComment = async (
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
): Promise<void> => {
  try {
    const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
    const runId = process.env.GITHUB_RUN_ID ?? "";
    const runUrl = runId
      ? `${serverUrl}/${owner}/${repo}/actions/runs/${runId}`
      : `${serverUrl}/${owner}/${repo}/actions`;
    const octokit = new Octokit({ auth: token });
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: buildErrorComment(runUrl),
    });
  } catch (commentError) {
    const fallback =
      commentError instanceof Error
        ? (commentError.stack ?? commentError.message)
        : "Unknown error";
    core.error(`Failed to post error comment: ${fallback}`);
  }
};

const getRequiredInput = (name: string): string => {
  return core.getInput(name, { required: true });
};

const getTimeoutInput = (name: string, fallbackMs: number): number => {
  const raw = core.getInput(name);
  if (!raw.trim()) {
    return fallbackMs;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    core.warning(`Invalid ${name} value "${raw}", falling back to ${fallbackMs}ms.`);
    return fallbackMs;
  }
  return parsed;
};

const runProvider = async (
  cmd: string,
  args: string[],
  prompt: string,
  timeoutMs: number,
): Promise<string> => {
  const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
  core.info(`Running: ${cmd} ${args.join(" ")} (cwd: ${cwd})`);

  const proc = Bun.spawn([cmd, ...args, prompt], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!proc.stdout || typeof proc.stdout === "number") {
    throw new Error("Provider process stdout is not available.");
  }
  if (!proc.stderr || typeof proc.stderr === "number") {
    throw new Error("Provider process stderr is not available.");
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const execute = async (): Promise<string> => {
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const stdout = await stdoutPromise;
    const stderr = await stderrPromise;

    if (exitCode !== 0) {
      throw new Error(`Provider exited with code ${exitCode}: ${stderr}`);
    }

    if (stderr.trim()) {
      core.info(`Provider stderr: ${stderr.trim()}`);
    }

    return stdout;
  };

  try {
    if (timeoutMs > 0) {
      const executionPromise = execute();
      // Suppress expected rejection if the timeout wins the race.
      executionPromise.catch(() => undefined);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          proc.kill();
          reject(new Error(`Provider timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      });
      return await Promise.race([executionPromise, timeoutPromise]);
    }
    return await execute();
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const applyResult = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  result: CliResult,
  specContext: SpecContext,
): Promise<void> => {
  if (result.type === "no_change") {
    await octokit.rest.reactions.createForIssue({
      owner,
      repo,
      issue_number: issueNumber,
      content: THUMBS_UP_REACTION,
    });
    return;
  }
  if (result.type === "question") {
    const comment = buildComment(result.content, specContext.author);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment,
    });
    return;
  }

  const newBody = buildSpecBody(result.body);
  const updateParams: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
    title?: string;
  } = {
    owner,
    repo,
    issue_number: issueNumber,
    body: newBody,
  };
  if (result.title) {
    const normalizedTitle = normalizeTitle(result.title);
    const currentTitle = normalizeTitle(specContext.title);
    if (normalizedTitle && normalizedTitle !== currentTitle) {
      updateParams.title = normalizedTitle;
    }
  }
  await octokit.rest.issues.update(updateParams);

  const summaryComment = buildComment(
    result.comment ?? "Specification has been updated.",
    specContext.author,
  );
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: summaryComment,
  });
};

export const main = async (): Promise<void> => {
  let owner = "";
  let repo = "";
  let issueNumber: number | undefined;
  let token = "";
  try {
    const agent = getRequiredInput("agent");
    token = getRequiredInput("github_token");
    const timeoutMs = getTimeoutInput("agent_timeout_ms", DEFAULT_AGENT_TIMEOUT_MS);
    const customPrompt = core.getInput("custom_prompt");

    const repoSlug = process.env.GITHUB_REPOSITORY ?? "";
    [owner, repo] = repoSlug.split("/");
    if (!owner || !repo) {
      throw new Error("Unable to resolve repository owner/name.");
    }

    const eventPath = process.env.GITHUB_EVENT_PATH ?? "";
    if (!eventPath) {
      throw new Error("Missing GITHUB_EVENT_PATH.");
    }

    const eventName = process.env.GITHUB_EVENT_NAME ?? "";
    const event = JSON.parse(await Bun.file(eventPath).text()) as EventPayload;

    const { shouldRun, reason, command, commandCreatedAt } = shouldProcess(eventName, event);
    if (!shouldRun) {
      core.info(reason ?? "Skipping processing.");
      return;
    }

    const isPullRequestEvent = eventName === "pull_request" || Boolean(event.issue?.pull_request);
    issueNumber = event.pull_request?.number ?? event.issue?.number;
    if (!issueNumber) {
      throw new Error("Missing issue number in event payload.");
    }

    const octokit = new Octokit({ auth: token });
    if (command === "help") {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: buildHelpComment(),
      });
      return;
    }
    const specContext = isPullRequestEvent
      ? await fetchPullRequestContext(octokit, owner, repo, issueNumber)
      : await fetchIssueContext(octokit, owner, repo, issueNumber);
    const adjustedContext =
      command === "reset"
        ? await applyResetContext(
            specContext,
            octokit,
            owner,
            repo,
            issueNumber,
            isPullRequestEvent ? "pullRequest" : "issue",
            commandCreatedAt,
          )
        : specContext;
    const adapter = getAdapter(agent);
    const { cmd, args } = adapter.buildCommand();
    const prompt = adapter.buildPrompt(adjustedContext, customPrompt);
    core.info(formatLogBlock("Prompt sent to agent", prompt));
    const output = await runProvider(cmd, args, prompt, timeoutMs);
    core.info(formatLogBlock("Raw agent output", output));
    const { result, parseFailed } = adapter.parseOutput(output);
    core.info(formatParsedResult(result));
    if (parseFailed) {
      core.error(`Failed to parse agent output as JSON.`);
    }

    await applyResult(octokit, owner, repo, issueNumber, result, adjustedContext);
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : "Unknown error";
    if (owner && repo && issueNumber && token) {
      await postErrorComment(owner, repo, issueNumber, token);
    }
    core.setFailed(message);
  }
};
