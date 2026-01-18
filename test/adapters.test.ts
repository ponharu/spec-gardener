import { describe, expect, it } from "bun:test";
import { getAdapter, getAgentConfig, parseCliOutput, type SpecContext } from "../src/adapters";

describe("parseCliOutput", () => {
  it("parses question JSON", () => {
    const result = parseCliOutput(JSON.stringify({ type: "question", content: "Need more info" }));
    expect(result).toEqual({
      result: { type: "question", content: "Need more info" },
      parseFailed: false,
    });
  });

  it("parses completion JSON", () => {
    const result = parseCliOutput(JSON.stringify({ type: "complete", body: "Spec body" }));
    expect(result).toEqual({
      result: {
        type: "complete",
        body: "Spec body",
        comment: "Spec updated by Spec Gardener.",
      },
      parseFailed: false,
    });
  });

  it("parses completion JSON with title", () => {
    const result = parseCliOutput(
      JSON.stringify({
        type: "complete",
        body: "Spec body",
        title: "Refined title",
      }),
    );
    expect(result).toEqual({
      result: {
        type: "complete",
        body: "Spec body",
        comment: "Spec updated by Spec Gardener.",
        title: "Refined title",
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

  it("parses status field alias", () => {
    const result = parseCliOutput(
      JSON.stringify({ status: "question", content: "Need more info" }),
    );
    expect(result).toEqual({
      result: { type: "question", content: "Need more info" },
      parseFailed: false,
    });
  });

  it("falls back on empty output", () => {
    const result = parseCliOutput("   ");
    expect(result).toEqual({
      result: { type: "question", content: "No output received from agent." },
      parseFailed: true,
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

  it("falls back when JSON has unknown type", () => {
    const result = parseCliOutput('{"type":"unknown"}');
    expect(result).toEqual({
      result: { type: "question", content: '{"type":"unknown"}' },
      parseFailed: true,
    });
  });

  it("falls back on malformed JSON with braces", () => {
    const result = parseCliOutput("{broken}");
    expect(result).toEqual({
      result: { type: "question", content: "{broken}" },
      parseFailed: true,
    });
  });

  it("repairs trailing commas in JSON output", () => {
    const result = parseCliOutput('{"type":"question","content":"Hello",}');
    expect(result).toEqual({
      result: { type: "question", content: "Hello" },
      parseFailed: false,
    });
  });

  it("repairs single-quoted JSON output", () => {
    const result = parseCliOutput("{'type':'question','content':'Hi'}");
    expect(result).toEqual({
      result: { type: "question", content: "Hi" },
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

describe("adapter selection", () => {
  it("throws for unknown agent", () => {
    expect(() => getAdapter("custom-agent")).toThrow(
      'Unknown agent "custom-agent". Supported agents: claude, codex, gemini',
    );
  });

  it("exposes known agent config", () => {
    const adapter = getAdapter("codex");
    const command = adapter.buildCommand();
    expect(command.args.length).toBeGreaterThan(0);
  });

  it("returns configs for known agents only", () => {
    expect(getAgentConfig("codex")?.name).toBe("codex");
    expect(getAgentConfig("unknown")).toBeUndefined();
  });
});
