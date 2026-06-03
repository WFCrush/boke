---
title: double SKILL
date: '2026-06-04 02:30:00'
updated: '2026-06-04 02:31:32'
categories:
  - gpt 破甲
tags:
  - gpt-5.5
description: >-
  Guide Codex to run stable multi-turn test/fix/verify loops inside one project
  without losing context.
---
# Codex Project Test/Fix Loop Skill

Use this skill when working inside a software project and the user wants Codex to repeatedly test, diagnose, fix, and verify the project across multiple turns.

## Core behavior

You are helping with one project. Treat the current working directory as the project root unless the user provides another path.

Your job is to keep the work stable across multiple rounds:

1. Understand the project structure.
2. Identify the correct test/build commands.
3. Run tests or checks.
4. Diagnose failures from logs and source code.
5. Apply the smallest safe fix.
6. Re-run the relevant tests.
7. Repeat until the project passes or a blocker requires user input.

Do not jump between unrelated tasks. Do not rewrite large parts of the project unless the user explicitly asks.

## Startup checklist

At the beginning of a project session:

1. Confirm the project root.
2. Inspect package/config files to identify the stack:
   - `package.json`
   - `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`
   - `pyproject.toml`, `requirements.txt`, `pytest.ini`
   - `Cargo.toml`
   - `go.mod`
   - `pom.xml`, `build.gradle`, `settings.gradle`
   - `Makefile`
   - CI config files such as `.github/workflows/*`
3. Determine likely commands for:
   - dependency installation
   - unit tests
   - integration tests
   - linting
   - type checking
   - building
4. Prefer project-defined scripts over guessed commands.

If the correct command is unclear, ask the user before installing dependencies or making broad changes.

## Multi-round working memory

Maintain a short running summary during the conversation:

- Project root
- Detected stack
- Test command used
- Current failure
- Files changed
- Last verification result
- Remaining blockers

Before each new round, briefly restate only what matters for the next step.

Example:

```text
Current state: using npm test; failure is in src/auth/session.test.ts; last fix changed src/auth/session.ts; next I will rerun that test only.
```

## Testing strategy

Use the narrowest useful test first:

1. Reproduce the failure with the smallest command.
2. Fix the likely cause.
3. Re-run the failing test.
4. If it passes, run the broader related test group.
5. Finally run the full project test/build command if practical.

Examples:

```bash
npm test -- session.test.ts
npm run test
npm run build
```

```bash
pytest tests/test_session.py
pytest
```

```bash
go test ./pkg/auth
go test ./...
```

```bash
cargo test session
cargo test
```

Do not claim success unless you actually ran the relevant verification command or clearly state that verification was not possible.

## Fixing rules

When fixing code:

- Prefer the smallest correct change.
- Fix the root cause, not just the symptom.
- Do not silence tests, remove assertions, skip checks, or weaken validation unless the test itself is clearly wrong and you explain why.
- Do not add unnecessary abstractions.
- Do not introduce compatibility shims unless required by the project.
- Do not edit generated files unless the project expects it.
- Do not modify unrelated files.
- If a dependency, build tool, or environment issue blocks progress, explain the blocker and the exact command or setup needed.

## Safety rules

Ask before actions that may be destructive or hard to reverse:

- deleting files or directories
- resetting git state
- force-pushing
- changing remote branches
- dropping databases
- removing dependencies
- modifying CI/CD or deployment configuration

Never run destructive commands just to clear an obstacle.

## Git awareness

If the project is a git repository:

1. Check the working tree before edits.
2. Avoid overwriting user changes.
3. Stage or commit only if the user explicitly asks.
4. When summarizing, list changed files and verification commands.

If there are existing uncommitted changes, treat them as user work unless proven otherwise.

## Output style

Keep responses short and useful.

For each round, report:

```text
Found: <main failure or cause>
Changed: <files changed, if any>
Verified: <command and result>
Next: <next action or blocker>
```

Do not paste huge logs. Summarize the important error and include only the relevant lines.

## Completion criteria

The task is complete when one of these is true:

1. The requested tests/checks pass.
2. The original failure is fixed and verified, but broader tests are unavailable or blocked.
3. A blocker requires user input.

Final response format:

```text
Done.
Changed: <files>
Verified: <commands>
Remaining: <none or blockers>
```

## User handoff prompt

If the user wants to start a new Codex session in the same project, suggest this prompt:

```text
Use the project test/fix loop skill. Project root: <path>. Continue from this state: <short summary>. First verify the current failure with the narrowest test, then fix and rerun tests until passing.
```
