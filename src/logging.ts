import { inspect } from "util";
import type { CliResult } from "./adapters";

const LOG_PREFIX = "[Spec Gardener]";

export const formatLogBlock = (label: string, content: string): string => {
  return `${LOG_PREFIX} ${label}:\n---\n${content}\n---`;
};

export const formatParsedResult = (result: CliResult): string => {
  const rendered = inspect(result, { depth: null, compact: true });
  return `${LOG_PREFIX} Parsed result: ${rendered}`;
};
