import { describe, expect, it } from "bun:test";
import { getAdapter, parseCliOutput, type IssueContext } from "../src/adapters";

describe("parseCliOutput", () => {
  it("parses question JSON", () => {
    const result = parseCliOutput(
      JSON.stringify({ type: "question", content: "Need more info" }),
    );
    expect(result).toEqual({ type: "question", content: "Need more info" });
  });

  it("parses completion JSON", () => {
    const result = parseCliOutput(
      JSON.stringify({ type: "complete", body: "Spec body" }),
    );
    expect(result).toEqual({
      type: "complete",
      body: "Spec body",
      comment: "Spec updated by SpecGardener.",
    });
  });

  it("falls back to question on invalid JSON", () => {
    const result = parseCliOutput("plain output");
    expect(result).toEqual({ type: "question", content: "plain output" });
  });

  it("extracts JSON from wrapped output", () => {
    const result = parseCliOutput(
      'Output:\n```json\n{"type":"question","content":"More info"}\n```',
    );
    expect(result).toEqual({ type: "question", content: "More info" });
  });
});

describe("adapter prompt", () => {
  it("includes issue context", () => {
    const context: IssueContext = {
      title: "Title",
      body: "Body",
      author: "bob",
      comments: [{ author: "alice", body: "First", createdAt: "2024-01-01" }],
    };
    const adapter = getAdapter("codex");
    const prompt = adapter.buildPrompt(context);
    expect(prompt).toContain("Title");
    expect(prompt).toContain("Body");
    expect(prompt).toContain("alice");
    expect(prompt).toContain("First");
  });
});
