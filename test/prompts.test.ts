import { describe, expect, it } from "bun:test";
import { buildPrompt } from "../src/prompts";
import type { SpecContext } from "../src/adapters";

describe("buildPrompt", () => {
  const baseContext: SpecContext = {
    title: "Title",
    body: "Body",
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

  it("includes guidance for no_change when spec is already complete", () => {
    const prompt = buildPrompt(baseContext);
    expect(prompt).toContain(
      'If the specification is already clear and complete, return {"type":"no_change"}.',
    );
    expect(prompt).toContain("Only return complete when you actually refine or improve the body.");
    expect(prompt).toContain("Do not rewrite the body with the same or similar content.");
  });
});
