import type { SpecContext } from "./adapters";

type PromptTemplateSection = {
  id: string;
  title: string;
  buildBody: (context: SpecContext, customPrompt?: string) => string;
  includeWhen?: (context: SpecContext, customPrompt?: string) => boolean;
};

type PromptTemplate = {
  language: string;
  intro: string[];
  format: string[];
  sections: PromptTemplateSection[];
};

const appendSection = (parts: string[], title: string, body: string): void => {
  parts.push("", title, body || "(empty)");
};

const buildCommentsSection = (context: SpecContext): string => {
  if (!context.comments.length) {
    return "(no comments)";
  }
  return context.comments
    .map(
      (comment, index) =>
        `# Comment ${index + 1}\nAuthor: ${comment.author}\nCreated: ${comment.createdAt}\n${comment.body}`,
    )
    .join("\n\n");
};

const buildChangedFilesSection = (context: SpecContext): string => {
  if (!context.changedFiles?.length) {
    return "(no files changed)";
  }
  return context.changedFiles
    .map(
      (file) =>
        `${file.filename} (${file.status}; +${file.additions} -${file.deletions}; ${file.changes} changes)`,
    )
    .join("\n");
};

const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  language: "en",
  intro: [
    "You are a requirements assistant that analyzes codebases to refine specifications.",
    "Read the codebase to understand the existing implementation.",
    "If the specification is insufficient, ask clarifying questions.",
    'If the specification is already clear and complete, return {"type":"no_change"}.',
    "Only return complete when you actually refine or improve the body.",
    "Do not rewrite the body with the same or similar content.",
    "If the specification is sufficient and needs updates, output the completed spec.",
    "When outputting a completed spec, you may include a refined title only if the current title needs improvement.",
    "Do not include code examples, snippets, pseudo-code, or code blocks.",
    "Focus on requirements, functional changes, and expected behavior, not implementation details.",
    "Use implementation-agnostic language that is clear and readable to any engineer.",
  ],
  format: [
    "Return JSON only.",
    "Format:",
    '{"type":"question","content":"..."}',
    "or",
    '{"type":"complete","body":"...","comment":"optional completion comment","title":"optional refined title"}',
    "or",
    '{"type":"no_change"}',
  ],
  sections: [
    {
      id: "custom",
      title: "# Custom Instructions",
      buildBody: (_context, customPrompt) => customPrompt?.trim() ?? "",
      includeWhen: (_context, customPrompt) => Boolean(customPrompt?.trim()),
    },
    {
      id: "issue-title",
      title: "# Issue Title",
      buildBody: (context) => context.title,
    },
    {
      id: "current-spec",
      title: "# Current Specification",
      buildBody: (context) => context.body,
    },
    {
      id: "comments",
      title: "# Comments",
      buildBody: (context) => buildCommentsSection(context),
    },
    {
      id: "changed-files",
      title: "# Changed Files",
      buildBody: (context) => buildChangedFilesSection(context),
      includeWhen: (context) => context.changedFiles !== undefined,
    },
  ],
};

const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  en: DEFAULT_PROMPT_TEMPLATE,
};

const getPromptTemplate = (language?: string): PromptTemplate => {
  if (!language) {
    return DEFAULT_PROMPT_TEMPLATE;
  }
  return PROMPT_TEMPLATES[language] ?? DEFAULT_PROMPT_TEMPLATE;
};

export const buildPrompt = (
  context: SpecContext,
  customPrompt?: string,
  language?: string,
): string => {
  const template = getPromptTemplate(language);
  const parts = [...template.intro, "", ...template.format];

  for (const section of template.sections) {
    if (section.includeWhen && !section.includeWhen(context, customPrompt)) {
      continue;
    }
    appendSection(parts, section.title, section.buildBody(context, customPrompt));
  }

  return parts.join("\n");
};

export type { PromptTemplate, PromptTemplateSection };
