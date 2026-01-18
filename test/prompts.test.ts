import { describe, expect, it } from "bun:test";
import { buildPrompt } from "../src/prompts";
import type { SpecContext } from "../src/adapters";

describe("buildPrompt", () => {
  const baseContext: SpecContext = {
    title: "Title",
    body: "Body",
    originalDescription: "Original",
    author: "bob",
    comments: [],
  };

  it("omits changed files section when not provided", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).not.toContain("# Changed Files");
  });

  it("renders empty changed files section when provided", () => {
    const prompt = buildPrompt({ ...baseContext, changedFiles: [] });
    expect(prompt).toContain("# Changed Files");
    expect(prompt).toContain("(no files changed)");
  });
});
