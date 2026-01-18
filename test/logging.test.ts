import { describe, expect, it } from "bun:test";
import { formatLogBlock, formatParsedResult } from "../src/logging";
import type { CliResult } from "../src/adapters";

describe("logging helpers", () => {
  it("formats a labeled log block", () => {
    const formatted = formatLogBlock("Prompt sent to agent", "Hello");
    expect(formatted).toBe("[Spec Gardener] Prompt sent to agent:\n---\nHello\n---");
  });

  it("formats parsed results with inspection", () => {
    const result: CliResult = {
      type: "complete",
      body: "Body",
      comment: "Done",
      title: "Title",
    };
    const formatted = formatParsedResult(result);
    expect(formatted).toContain("[Spec Gardener] Parsed result:");
    expect(formatted).toContain("type: 'complete'");
    expect(formatted).toContain("body: 'Body'");
  });
});
