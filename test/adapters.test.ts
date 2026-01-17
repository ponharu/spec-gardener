import { describe, expect, it } from "bun:test";
import { getAdapter, parseCliOutput, type SpecContext } from "../src/adapters";

describe("parseCliOutput", () => {
  it("parses question JSON", () => {
    const result = parseCliOutput(
      JSON.stringify({ type: "question", content: "Need more info" }),
    );
    expect(result).toEqual({
      result: { type: "question", content: "Need more info" },
      parseFailed: false,
    });
  });

  it("parses completion JSON", () => {
    const result = parseCliOutput(
      JSON.stringify({ type: "complete", body: "Spec body" }),
    );
    expect(result).toEqual({
      result: {
        type: "complete",
        body: "Spec body",
        comment: "Spec updated by Spec Gardener.",
      },
      parseFailed: false,
    });
  });

  it("parses no_change JSON", () => {
    const result = parseCliOutput(JSON.stringify({ type: "no_change" }));
    expect(result).toEqual({
      result: { type: "no_change" },
      parseFailed: false,
    });
  });

  it("falls back to question on invalid JSON", () => {
    const result = parseCliOutput("plain output");
    expect(result).toEqual({
      result: { type: "question", content: "plain output" },
      parseFailed: true,
    });
  });

  it("extracts JSON from wrapped output", () => {
    const result = parseCliOutput(
      'Output:\n```json\n{"type":"question","content":"More info"}\n```',
    );
    expect(result).toEqual({
      result: { type: "question", content: "More info" },
      parseFailed: false,
    });
  });
});

describe("adapter prompt", () => {
  it("includes issue context", () => {
    const context: SpecContext = {
      title: "Title",
      body: "Body",
      author: "bob",
      comments: [{ author: "alice", body: "First", createdAt: "2024-01-01" }],
    };
    const adapter = getAdapter("codex");
    const prompt = adapter.buildPrompt(context);
    expect(prompt).toContain("Title");
    expect(prompt).toContain("Body");
    expect(prompt).toContain("no_change");
    expect(prompt).toContain("alice");
    expect(prompt).toContain("First");
  });

  it("includes custom instructions when provided", () => {
    const context: SpecContext = {
      title: "Title",
      body: "Body",
      author: "bob",
      comments: [],
    };
    const adapter = getAdapter("codex");
    const prompt = adapter.buildPrompt(context, "Use RFC-style language.");
    expect(prompt).toContain("# Custom Instructions");
    expect(prompt).toContain("Use RFC-style language.");
  });

  it("includes changed files when provided", () => {
    const context: SpecContext = {
      title: "Title",
      body: "Body",
      author: "bob",
      comments: [],
      changedFiles: [
        {
          filename: "src/main.ts",
          status: "modified",
          additions: 10,
          deletions: 2,
          changes: 12,
        },
      ],
    };
    const adapter = getAdapter("codex");
    const prompt = adapter.buildPrompt(context);
    expect(prompt).toContain("# Changed Files");
    expect(prompt).toContain("src/main.ts");
    expect(prompt).toContain("modified");
  });
});
