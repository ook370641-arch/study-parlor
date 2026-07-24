---
description: "Use when adding features, integrating external APIs, or defining persistence/delivery boundaries."
paths:
  - "src/**"
  - "electron/**"
  - "docs/superpowers/specs/**"
---

# Feature Development Rules

## 1. Lock spec and acceptance checklist before coding

**Why:** Coding without boundaries produces features that work only on the happy path.

- Link every new feature to a design spec.
- Write the acceptance checklist before implementation: empty data, failure, partial success, old-data compatibility, cross-restart persistence.
- Do not implement or test features explicitly deferred in the spec.
- Source: feature-development.md §1

## 2. Isolate external API credentials

**Why:** Keys in `.env` or state files leak through version control, logs, and UI.

- Encrypt third-party keys with Electron `safeStorage` and store them in a dedicated file.
- Show only "configured"/"not configured" in UI; never echo the saved key back to the renderer.
- Use environment variables only as test/CI fallbacks.
- Source: feature-development.md §2

## 3. Map external errors to domain error codes

**Why:** Raw API responses may contain URLs, keys, or HTML that should not reach users.

- Convert external failures into domain codes such as `TAVILY_ERROR`, `NETWORK_ERROR`, `NO_RESULTS`.
- Log only truncated, sanitized response summaries.
- Render localized messages from error codes, not from message substrings.
- Source: feature-development.md §3

## 4. Distinguish network failure from empty data

**Why:** Treating a timeout as "no results" misleads users and hides real outages.

- Use distinct codes for timeout, non-2xx HTTP, and JSON parse failures.
- Make retry counts/intervals explicit and log each retry reason.
- If any source succeeds, generate a partial result and surface which sources failed.
- Source: feature-development.md §4

## 5. Defend against missing fields in upstream data

**Why:** Real feeds often omit fields that the spec promises.

- Treat every record as potentially incomplete.
- Check existence and non-emptiness before destructuring or indexing.
- Skip or filter invalid records with `continue`; do not throw unhandled exceptions.
- Source: feature-development.md §5

## 6. Verify packaging before adding browser automation or binaries

**Why:** A dependency that works in dev can be missing in the packaged app.

- Check `electron-builder.yml` and `package.json` for how the binary/browser will be bundled.
- Prefer Electron's built-in Chromium and Node capabilities in production.
- Keep dev-only tools out of runtime dependencies.
- Source: feature-development.md §6

## 7. Make append-style writes idempotent

**Why:** Retries and re-triggers duplicate content when append is implemented as naive concatenation.

- Deduplicate by a stable session/timestamp/attempt key, or read → merge structured data → rewrite.
- Derive sequence indexes (e.g., `review_index`) from existing record counts instead of trusting caller input.
- Source: feature-development.md §7

## 8. Sync "saved" cache with actual file existence

**Why:** A file that was imported once may have been deleted by the user.

- Check `fs.existsSync(filePath)` before rendering or opening a cached file.
- Degrade to re-fetching or update state to unsaved when the file is gone.
- Refresh `isSaved` markers after successful imports.
- Source: feature-development.md §8

## 9. Test failures, persistence, and regressions

**Why:** Most bugs appear at boundaries, not in the success path.

- Unit-test empty feeds, partial failures, malformed JSON, write failures, and old-cache compatibility.
- Component-test loading/error/success states, CSS variables, and clickable source links.
- E2E-test cache hits, network failures, retry flows, cross-restart persistence, and theme changes.
- Source: feature-development.md §9

## 10. Provide cancellation, timeout, retry, and concurrency guards

**Why:** Users need an escape hatch from long operations; repeated clicks create races.

- Carry an `AbortController` for any async IPC call likely to exceed 3 seconds.
- Show progress/cancel UI; allow in-place retry on failure.
- Guard store actions with a `loading` flag and use incrementing `requestId` to ignore stale results.
- Reset loading state on success, failure, and cancellation paths.
- Source: feature-development.md §10

## 11. Ship the boundary/acceptance/degradation checklist with the first version

**Why:** The first version sets the quality floor; later patches are more expensive.

- Before writing code, publish the checklist: empty data, failure/partial failure, old-data compatibility, persistence, cancel/timeout, theme/setting changes, packaged runtime.
- Decide the mock vs. real-API strategy up front.
- Treat missing checklist items as unfinished work before merging.
- Source: feature-development.md §11

## 12. 功能必须声明 UI 出口

**Why:** 多次出现功能做完但没有可见入口（写作助手只有 24px 竖条、删除藏右键无发现性），用户以为功能不存在。

- 每个新功能在 spec 中必须声明其 UI 入口（按钮/菜单/面板/竖签），并给出收起态与展开态两种形态。
- 入口必须有 `data-testid` 并出现在至少一个 e2e 断言中（证明运行时真的渲染）。
- 入口的可见性不得依赖隐式知识（如「知道要右键」「知道边缘有条缝」）；隐藏式交互（右键菜单、拖拽）只能作为辅助路径，不能是唯一路径。
- Source: docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md（写作助手无 UI 出口问题）

## Example: error handling

- ❌ `throw new Error(JSON.stringify(response))`
- ✅ `throw new Error('TAVILY_ERROR')` and log a truncated, sanitized summary
