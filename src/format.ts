import { COMMANDS_HINT, COMMANDS_LIST, FOOTER } from "./constants";

export const buildSpecBody = (spec: string): string => {
  return `${spec}\n\n---\n${FOOTER}`;
};

export const buildComment = (
  content: string,
  authorLogin: string,
  mentionAuthor = true,
): string => {
  const prefix = mentionAuthor ? `@${authorLogin} ` : "";
  return `${prefix}${content}\n\n---\n${COMMANDS_HINT}\n${FOOTER}`;
};

export const buildHelpComment = (): string => {
  return `${COMMANDS_LIST}\n\n---\n${FOOTER}`;
};

export const buildErrorComment = (
  runUrl: string,
  authorLogin?: string,
  mentionAuthor = false,
): string => {
  const prefix = mentionAuthor && authorLogin ? `@${authorLogin} ` : "";
  return `${prefix}Spec Gardener encountered an error while processing this issue.\n\nPlease check the workflow run for details:\n${runUrl}\n\n---\n${COMMANDS_HINT}\n${FOOTER}`;
};

export const normalizeTitle = (title: string): string => {
  return title.replace(/\s+/g, " ").trim();
};
