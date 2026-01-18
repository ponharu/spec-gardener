# Spec Gardener

[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-black?logo=github-actions&logoColor=white)](https://github.com/ponharu/spec-gardener)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://github.com/ponharu/spec-gardener/actions/workflows/test.yml/badge.svg)](https://github.com/ponharu/spec-gardener/actions/workflows/test.yml)

GitHub Action that transforms vague issues and pull requests into detailed, code-ready specifications using AI CLI tools. It analyzes your codebase context and refines descriptions through conversation.

## Requirements

- One of the supported agent CLIs (`codex`, `claude`, `gemini`) available on PATH (or installable via `bunx`)
- `GITHUB_TOKEN` with `issues: write` and `pull-requests: read` permissions

## How It Works

1. When an issue or pull request is created (or `/spec-gardener` command is used), the action gathers the title, body, and comments.
2. For pull requests, it also includes the list of changed files to ground the refinement.
3. It sends the context to the configured AI CLI agent.
4. The agent analyzes the codebase and either:
   - Asks clarifying questions via a comment
   - Updates the issue or pull request body with a refined specification (and optionally refines the title)
5. The refined specification is written to the issue or pull request body.
6. Use `/spec-gardener` in comments to continue the conversation and further refine the spec.

## Usage

Create `.github/workflows/spec-gardener.yml`:

```yaml
name: Spec Gardener
on:
  issues:
    types: [opened, edited]
  pull_request:
    types: [opened, edited]
  issue_comment:
    types: [created]

jobs:
  spec-gardener:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: read
      contents: read
    steps:
      - uses: actions/checkout@v6

      - name: Run Spec Gardener
        uses: ponharu/spec-gardener@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          agent: "codex"
          agent_timeout_ms: "120000"
          custom_prompt: "Follow our API naming conventions and keep specs concise."
```

## Commands

Use these commands in issue and pull request comments to interact with Spec Gardener:

| Command                | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `/spec-gardener`       | Analyze the issue and continue refining the specification                         |
| `/spec-gardener reset` | Re-analyze from the original description and comments from the reset point onward |
| `/spec-gardener help`  | Show available commands without running the agent                                 |

## Configuration

| Input              | Description                                                                                                                                                                                                                                | Required               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `github_token`     | Token to comment and update issues.                                                                                                                                                                                                        | Yes                    |
| `agent`            | Agent to execute (`codex`, `claude`, `gemini`). If the command is not on PATH, Spec Gardener runs it via `bunx` using mapped packages: `claude` → `@anthropic-ai/claude-code`, `codex` → `@openai/codex`, `gemini` → `@google/gemini-cli`. | Yes                    |
| `agent_timeout_ms` | Timeout in milliseconds for the agent execution.                                                                                                                                                                                           | No (default: `120000`) |
| `custom_prompt`    | Custom instructions to append to the prompt.                                                                                                                                                                                               | No                     |

## Behavior

With the example workflow above:

- **New issue or pull request created** - Automatically analyzed and refined
- **Issue or pull request edited** - Re-analyzed (skipped if already processed by Spec Gardener)
- **Comment with `/spec-gardener`** - Continues the conversation to refine the spec
- **Comment with `/spec-gardener reset`** - Re-runs analysis using the original description and later comments
- **Comment with `/spec-gardener help`** - Posts command help without running the agent

The action prevents infinite loops by checking for its footer in the issue body and only responding to comments containing the `/spec-gardener` command.

## Output Format

### Issue Body

When Spec Gardener updates an issue or pull request, it writes the refined specification:

```markdown
[Refined specification from the agent]

---

🤖 Generated by Spec Gardener
```

### Comments

Comments include available commands and mention the issue author:

```markdown
💡 Type `/spec-gardener help` for available commands

@author [Agent's response or summary]

---

🤖 Generated by Spec Gardener
```

## Agents

Built-in adapters: `codex`, `claude`, `gemini`. Unknown agent names are rejected.

All agents receive the prompt via stdin and must return JSON.

### Provider Output Format

`title` is optional and should only be provided when the existing issue title needs improvement.

```json
{ "type": "question", "content": "..." }
```

or

```json
{
  "type": "complete",
  "body": "...",
  "comment": "optional completion comment",
  "title": "optional refined title"
}
```

or

```json
{ "type": "no_change" }
```

## Development

```bash
bun install
bun run lint
bun run typecheck
bun run test
```

## License

Apache-2.0

## Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or improvements.
