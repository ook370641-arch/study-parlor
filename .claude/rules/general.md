---
description: "Universal behavioral guardrails for the AI agent. Loaded in every session."
---

# General Rules

These rules apply to every task. They describe recurring failure modes and how to avoid them.

## 1. Validate boundaries, nulls, and errors

**Why:** External data rarely matches the happy-path shape assumed in specs.

- Check existence, type, and non-emptiness before destructuring or indexing external input (API, feed, file, IPC, JSON).
- Map network/IO failures to distinct error codes; never return `null` for both "empty" and "failed."
- Provide defaults and backward-compatible fallbacks for every new persisted field.
- Cover empty arrays, missing fields, `null`, and malformed strings in unit tests.
- Source: iteration-density-report.md §1

## 2. Keep cross-layer contracts in sync

**Why:** Changing an interface in one layer without updating consumers causes runtime failures even when TypeScript passes.

- When adding or changing IPC, types, state, or events, update in order: types → handler → preload → facade → store → components/tests.
- Use typed error-code unions; never match error messages with `String.prototype.includes`.
- Delete interface references from every layer when removing them.
- Verify new IPC is exposed at runtime with at least one startup probe or test assertion.
- Source: iteration-density-report.md §3

## 3. Prefer simplicity over premature abstraction

**Why:** Over-engineered solutions are expensive to unwind and tend to introduce new failure modes.

- Build the smallest viable path first; add complexity only after concrete feedback.
- Keep one visible protocol/convention per feature.
- Ask whether a new config option is necessary before adding it.
- Define a testable boundary-behavior checklist before building complex interactions.
- Source: iteration-density-report.md §2

## 4. Keep prompts and external-dependency contracts stable

**Why:** LLM outputs and third-party APIs drift; the parser and the prompt must stay aligned.

- Never call `JSON.parse` directly on LLM output. Use extract → sanitize → balance-check → shape-check.
- Explicitly forbid unwanted output patterns in prompts and include negative examples.
- Keep protocol phrases (e.g., the archive trigger) canonical and detect them leniently in UI.
- Centralize provider quirks (headers, temperature, thinking modes) in one adapter function.
- Source: iteration-density-report.md §4

## 5. Test beyond the happy path and mock responsibly

**Why:** Success-path-only testing hides regressions that only appear in production.

- Use deterministic mocks/seeds for default paths, but keep a real-API regression path that can be run independently.
- Every feature must be tested under empty data, failure, partial success, old-data compatibility, and cross-restart persistence.
- Keep design docs, README, and implementation in sync when any of them changes.
- Source: iteration-density-report.md §6

## 6. Verify packaging and environment assumptions

**Why:** Dev paths, writable paths, and bundled binaries behave differently in packaged builds.

- Declare non-JS resources explicitly in `electron-builder.yml` and probe paths for both dev and packaged modes.
- Write user/config/state data only under user directories or `userData`; never write to `process.cwd()` or the install directory.
- Validate that any external binary/browser/CLI can be bundled before depending on it in production.
- Run `npm run package` and smoke-test the produced executable after changing build config.
- Source: iteration-density-report.md §5

## 7. Manage async/concurrency/cancellation lifecycles

**Why:** Long-running or streaming operations fail silently if they cannot be aborted, timed out, or deduplicated.

- Give each async/streaming request its own `AbortController`; distinguish total timeout from idle timeout.
- Provide cancellation UI and progress state for any IPC call likely to exceed 3 seconds.
- Use an incrementing `requestId` for non-idempotent calls and ignore stale responses.
- Snapshot mutable state and abort active streams before entering long-running finalize/save operations.
- Source: iteration-density-report.md §4

## 8. Preserve backward compatibility for state and persistence

**Why:** Old users have old files; schema changes must not break them.

- Add defaults for new persisted fields in shared types, store init, and seed factories.
- Include data-version or validation fields in caches; invalidate old formats on schema change.
- Normalize removed/renamed enum values explicitly in parsers (e.g., `medium` → `mid`).
- Check file existence before rendering/opening and degrade gracefully when files are missing.
- Source: iteration-density-report.md §3
