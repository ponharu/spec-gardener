export type IssueComment = {
  author: string;
  body: string;
  createdAt: string;
};

export type ChangedFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
};

export type SpecContext = {
  title: string;
  body: string;
  comments: IssueComment[];
  author: string;
  changedFiles?: ChangedFile[];
};

export type CliResult =
  | { type: "question"; content: string }
  | { type: "complete"; body: string; comment?: string }
  | { type: "no_change" };

export type ParseResult = {
  result: CliResult;
  parseFailed: boolean;
};

export type AgentConfig = {
  name: string;
  package: string;
  args: string[];
};

export type ProviderAdapter = {
  name: string;
  buildCommand: () => { cmd: string; args: string[] };
  buildPrompt: (context: SpecContext, customPrompt?: string) => string;
  parseOutput: (output: string) => ParseResult;
};

const DEFAULT_COMPLETION_COMMENT = "Spec updated by Spec Gardener.";

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  claude: {
    name: "claude",
    package: "@anthropic-ai/claude-code@latest",
    args: [
      "--dangerously-skip-permissions",
      "--allowed-tools",
      "Read,Glob,Grep,Bash",
      "--print",
    ],
  },
  codex: {
    name: "codex",
    package: "@openai/codex@latest",
    args: ["exec", "--dangerously-bypass-approvals-and-sandbox"],
  },
  gemini: {
    name: "gemini",
    package: "@google/gemini-cli@latest",
    args: ["--approval-mode", "yolo"],
  },
};

const appendSection = (parts: string[], title: string, body: string): void => {
  parts.push("", title, body || "(empty)");
};

const buildDefaultPrompt = (
  context: SpecContext,
  customPrompt?: string,
): string => {
  const comments = context.comments
    .map(
      (comment, index) =>
        `# Comment ${index + 1}\nAuthor: ${comment.author}\nCreated: ${comment.createdAt}\n${comment.body}`,
    )
    .join("\n\n");

  const promptParts = [
    "You are a requirements assistant that analyzes codebases to refine specifications.",
    "Read the codebase to understand the existing implementation.",
    "If the specification is insufficient, ask clarifying questions.",
    "If the specification is sufficient and no changes are needed, output no_change.",
    "If the specification is sufficient and needs updates, output the completed spec.",
    "Do not include code examples, snippets, pseudo-code, or code blocks.",
    "Focus on requirements, functional changes, and expected behavior, not implementation details.",
    "Use implementation-agnostic language that is clear and readable to any engineer.",
    "",
    "Return JSON only.",
    "Format:",
    '{"type":"question","content":"..."}',
    "or",
    '{"type":"complete","body":"...","comment":"optional completion comment"}',
    "or",
    '{"type":"no_change"}',
  ];

  const trimmedPrompt = customPrompt?.trim();
  if (trimmedPrompt) {
    appendSection(promptParts, "# Custom Instructions", trimmedPrompt);
  }

  appendSection(promptParts, "# Issue Title", context.title);
  appendSection(promptParts, "# Issue Body", context.body);
  appendSection(promptParts, "# Comments", comments || "(no comments)");
  if (context.changedFiles) {
    const files = context.changedFiles.length
      ? context.changedFiles
          .map(
            (file) =>
              `${file.filename} (${file.status}; +${file.additions} -${file.deletions}; ${file.changes} changes)`,
          )
          .join("\n")
      : "(no files changed)";
    appendSection(promptParts, "# Changed Files", files);
  }

  return promptParts.join("\n");
};

const parseJsonResult = (candidate: string): CliResult | null => {
  const parsed = JSON.parse(candidate) as {
    type?: string;
    status?: string;
    content?: string;
    body?: string;
    comment?: string;
  };
  const type = parsed.type ?? parsed.status;
  if (type === "question" && parsed.content) {
    return { type: "question", content: parsed.content };
  }
  if (type === "complete" && parsed.body) {
    return {
      type: "complete",
      body: parsed.body,
      comment: parsed.comment || DEFAULT_COMPLETION_COMMENT,
    };
  }
  if (type === "no_change") {
    return { type: "no_change" };
  }
  return null;
};

export const parseCliOutput = (output: string): ParseResult => {
  const trimmed = output.trim();
  if (!trimmed) {
    return {
      result: { type: "question", content: "No output received from agent." },
      parseFailed: true,
    };
  }

  try {
    const direct = parseJsonResult(trimmed);
    if (direct) {
      return { result: direct, parseFailed: false };
    }
  } catch {
    // Try extracting JSON from a larger payload.
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const sliced = trimmed.slice(firstBrace, lastBrace + 1);
      const extracted = parseJsonResult(sliced);
      if (extracted) {
        return { result: extracted, parseFailed: false };
      }
    } catch {
      // Fall back to raw output.
    }
  }

  return { result: { type: "question", content: trimmed }, parseFailed: true };
};

const createAdapter = (config: AgentConfig): ProviderAdapter => ({
  name: config.name,
  buildCommand: () => ({
    cmd: "bunx",
    args: [config.package, ...config.args],
  }),
  buildPrompt: buildDefaultPrompt,
  parseOutput: parseCliOutput,
});

export const getAdapter = (agent: string): ProviderAdapter => {
  const key = agent.toLowerCase();
  const config = AGENT_CONFIGS[key];

  if (config) {
    return createAdapter(config);
  }

  // Fallback for unknown agents: use agent name as package
  return createAdapter({
    name: key,
    package: key,
    args: [],
  });
};

export const getAgentConfig = (agent: string): AgentConfig | undefined => {
  return AGENT_CONFIGS[agent.toLowerCase()];
};
