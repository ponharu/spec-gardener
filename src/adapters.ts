export type IssueComment = {
  author: string;
  body: string;
  createdAt: string;
};

export type IssueContext = {
  title: string;
  body: string;
  comments: IssueComment[];
  author: string;
};

export type CliResult =
  | { type: "question"; content: string }
  | { type: "complete"; body: string; comment?: string };

export type AgentConfig = {
  name: string;
  package: string;
  args: string[];
};

export type ProviderAdapter = {
  name: string;
  buildCommand: () => { cmd: string; args: string[] };
  buildPrompt: (context: IssueContext) => string;
  parseOutput: (output: string) => CliResult;
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

const buildDefaultPrompt = (context: IssueContext): string => {
  const comments = context.comments
    .map(
      (comment, index) =>
        `# Comment ${index + 1}\nAuthor: ${comment.author}\nCreated: ${comment.createdAt}\n${comment.body}`,
    )
    .join("\n\n");

  return [
    "You are a requirements assistant that analyzes codebases to refine specifications.",
    "Read the codebase to understand the existing implementation.",
    "If the specification is insufficient, ask clarifying questions.",
    "If the specification is sufficient, output the completed spec.",
    "Do not include code examples, snippets, or pseudo-code.",
    "Describe requirements, behavior, and required functional changes using implementation-agnostic language.",
    "",
    "Return JSON only.",
    "Format:",
    '{"type":"question","content":"..."}',
    "or",
    '{"type":"complete","body":"...","comment":"optional completion comment"}',
    "",
    "# Issue Title",
    context.title || "(empty)",
    "",
    "# Issue Body",
    context.body || "(empty)",
    "",
    "# Comments",
    comments || "(no comments)",
  ].join("\n");
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
  return null;
};

export const parseCliOutput = (output: string): CliResult => {
  const trimmed = output.trim();
  if (!trimmed) {
    return { type: "question", content: "No output received from agent." };
  }

  try {
    const direct = parseJsonResult(trimmed);
    if (direct) {
      return direct;
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
        return extracted;
      }
    } catch {
      // Fall back to raw output.
    }
  }

  return { type: "question", content: trimmed };
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
