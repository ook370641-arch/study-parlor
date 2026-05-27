# Markdown Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `<pre>` text dump in `SessionViewer` with a fully-rendered Markdown reader that adapts its typography to three document types (report, fable, dialogue), styled with Disco Elysium aesthetics.

**Architecture:** A `MarkdownRenderer` component parses frontmatter to detect document type, then renders via `react-markdown` with custom component mappings per type. Styles use Tailwind classes with a small CSS supplement for decorative elements (diamond dividers). Code highlighting uses Shiki via `@shikijs/rehype` with a warm dark theme matching the app's existing palette.

**Tech Stack:** react-markdown, remark-gfm, @shikijs/rehype, rehype-raw, gray-matter (already installed), vitest + testing-library/react

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/md/fileType.ts` | Detect document type from frontmatter `type` field + filename fallback. Pure function, fully testable. |
| `src/components/md/MarkdownRenderer.tsx` | Main entry: parse frontmatter, strip it from body, select component map, render via react-markdown. |
| `src/components/md/components.tsx` | All custom react-markdown components: Heading, Blockquote, Code, CodeBlock, Table, ThematicBreak. |
| `src/components/md/markdown.css` | Supplemental CSS for decorative elements not expressible in Tailwind utilities: diamond dividers, section-label positioning. |
| `src/components/SessionViewer.tsx` | Modified to replace `<pre>` with `<MarkdownRenderer>`. |
| `tests/md/fileType.test.ts` | Unit tests for type detection logic. |
| `tests/md/components.test.tsx` | Unit tests for Heading label mapping. |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install react-markdown remark-gfm rehype-raw
npm install -D @shikijs/rehype shiki @types/react-markdown
```

- [ ] **Step 2: Verify lockfile updated**

```bash
git diff package-lock.json | head -20
```

Expected: `react-markdown`, `remark-gfm`, `rehype-raw`, `@shikijs/rehype` entries present.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add react-markdown, remark-gfm, rehype-raw, @shikijs/rehype"
```

---

## Task 2: File Type Detector

**Files:**
- Create: `src/components/md/fileType.ts`
- Create: `tests/md/fileType.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/md/fileType.test.ts
import { describe, it, expect } from 'vitest'
import { detectDocType, type DocType } from '@/components/md/fileType'

describe('detectDocType', () => {
  it('detects report from frontmatter type=progress', () => {
    const content = '---\ntype: progress\n---\n# Hello'
    expect(detectDocType(content, 'whatever.md')).toBe('report')
  })

  it('detects report from frontmatter type=review', () => {
    const content = '---\ntype: review\n---\n# Hello'
    expect(detectDocType(content, 'whatever.md')).toBe('report')
  })

  it('detects fable from frontmatter type=research', () => {
    const content = '---\ntype: research\n---\n# Hello'
    expect(detectDocType(content, 'whatever.md')).toBe('fable')
  })

  it('falls back to filename for 学习报告', () => {
    expect(detectDocType('# Hello', '学习报告.md')).toBe('report')
  })

  it('falls back to filename for 复习报告', () => {
    expect(detectDocType('# Hello', '复习报告.md')).toBe('report')
  })

  it('falls back to filename for 寓言', () => {
    expect(detectDocType('# Hello', '寓言.md')).toBe('fable')
  })

  it('falls back to filename for 寓言2', () => {
    expect(detectDocType('# Hello', '寓言2.md')).toBe('fable')
  })

  it('falls back to filename for 原始对话', () => {
    expect(detectDocType('# Hello', '原始对话.md')).toBe('dialogue')
  })

  it('defaults to report when unrecognizable', () => {
    expect(detectDocType('# Hello', 'unknown.md')).toBe('report')
  })

  it('handles content without frontmatter', () => {
    expect(detectDocType('# Just a title\n\nSome text', '学习报告.md')).toBe('report')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/md/fileType.test.ts
```

Expected: FAIL — "Cannot find module '@/components/md/fileType'"

- [ ] **Step 3: Implement the detector**

```ts
// src/components/md/fileType.ts
import matter from 'gray-matter'

export type DocType = 'report' | 'fable' | 'dialogue'

export function detectDocType(content: string, fileName: string): DocType {
  // Priority 1: frontmatter type field
  try {
    const { data } = matter(content)
    const type = data?.type
    if (type === 'progress' || type === 'review') return 'report'
    if (type === 'research') return 'fable'
  } catch {
    // ignore parse errors
  }

  // Priority 2: filename matching
  const lower = fileName.toLowerCase()
  if (lower.includes('学习报告') || lower.includes('复习报告')) return 'report'
  if (lower.includes('寓言')) return 'fable'
  if (lower.includes('原始对话')) return 'dialogue'

  // Default: report for information density
  return 'report'
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/md/fileType.test.ts
```

Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/md/fileType.ts tests/md/fileType.test.ts
git commit -m "feat(md): file type detector with frontmatter + filename fallback"
```

---

## Task 3: MarkdownRenderer Foundation

**Files:**
- Create: `src/components/md/MarkdownRenderer.tsx`
- Create: `src/components/md/components.tsx` (stub)
- Modify: `src/components/SessionViewer.tsx`

- [ ] **Step 1: Create component stub**

```tsx
// src/components/md/components.tsx
// Stub — custom components added in Task 4
export const reportComponents = {}
export const fableComponents = {}
export const dialogueComponents = {}
```

- [ ] **Step 2: Create MarkdownRenderer**

```tsx
// src/components/md/MarkdownRenderer.tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import { detectDocType } from './fileType'
import { reportComponents, fableComponents, dialogueComponents } from './components'
import type { DocType } from './fileType'

interface Props {
  content: string
  fileName: string
}

function getDocTypeClass(docType: DocType): string {
  switch (docType) {
    case 'report': return 'md-report'
    case 'fable': return 'md-fable'
    case 'dialogue': return 'md-dialogue'
  }
}

export function MarkdownRenderer({ content, fileName }: Props) {
  const docType = detectDocType(content, fileName)

  // Strip frontmatter before rendering
  let body = content
  try {
    const parsed = matter(content)
    body = parsed.content
  } catch {
    // keep original if parsing fails
  }

  const components = docType === 'report' ? reportComponents
    : docType === 'fable' ? fableComponents
    : dialogueComponents

  return (
    <div className={`md-body ${getDocTypeClass(docType)}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </Markdown>
    </div>
  )
}
```

- [ ] **Step 3: Integrate into SessionViewer**

Replace the `<pre>` block in `src/components/SessionViewer.tsx` (around line 80-84):

```tsx
// BEFORE:
{!loading && !error && !mimeType.startsWith('image/') && content && (
  <pre className="whitespace-pre-wrap text-sm text-parchment/80 font-sans leading-relaxed">
    {content}
  </pre>
)}

// AFTER:
{!loading && !error && !mimeType.startsWith('image/') && content && (
  <MarkdownRenderer content={content} fileName={fileName} />
)}
```

Add import at top of `SessionViewer.tsx`:

```tsx
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
```

- [ ] **Step 4: Run dev and verify basic rendering**

```bash
npm run dev
```

Open the app, navigate to Study Library, click a "学习报告" button. Expected: markdown parses — headings show as larger text, lists show bullets, **bold** shows as bold. No styling yet (that's Task 4), but structure should be visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/md/MarkdownRenderer.tsx src/components/md/components.tsx src/components/SessionViewer.tsx
git commit -m "feat(md): MarkdownRenderer foundation with react-markdown integration"
```

---

## Task 4: Report-Type Custom Components

**Files:**
- Modify: `src/components/md/components.tsx`
- Modify: `src/components/md/MarkdownRenderer.tsx` (add Shiki plugin)

- [ ] **Step 1: Add supplemental CSS file**

```css
/* src/components/md/markdown.css */

/* ===== Container ===== */
.md-body {
  max-width: 640px;
  margin: 0 auto;
  font-family: Georgia, "Noto Serif SC", "Source Han Serif SC", serif;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(232, 213, 183, 0.78);
}

.md-fable {
  max-width: 520px;
}

/* ===== Headings ===== */
.md-body h1 {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 18px;
  color: #e8d5b7;
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(217, 119, 87, 0.3);
  letter-spacing: 0.02em;
  line-height: 1.4;
}

.md-body h2 {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 13px;
  color: #e8d5b7;
  margin: 20px 0 8px 0;
  font-weight: normal;
  line-height: 1.4;
}

.md-body h3 {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 12px;
  color: #d97757;
  margin: 16px 0 6px 0;
  font-weight: normal;
}

.md-body h4 {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 11px;
  color: rgba(217, 119, 87, 0.8);
  margin: 12px 0 4px 0;
  font-weight: normal;
}

/* Section label above H2 */
.md-section-label {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(217, 119, 87, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 2px;
}

/* ===== Paragraphs ===== */
.md-body p {
  margin: 8px 0;
}

/* ===== Lists ===== */
.md-body ul, .md-body ol {
  margin: 8px 0;
  padding-left: 20px;
}

.md-body li {
  margin: 4px 0;
}

.md-body li > p {
  margin: 2px 0;
}

/* ===== Blockquote ===== */
.md-body blockquote {
  margin: 12px 0;
  padding: 10px 14px;
  border-left: 3px solid rgba(217, 119, 87, 0.5);
  background: rgba(217, 119, 87, 0.05);
  border-radius: 0 4px 4px 0;
}

.md-body blockquote p {
  font-style: italic;
  color: rgba(232, 213, 183, 0.6);
  margin: 0;
}

.md-body blockquote p + p {
  margin-top: 6px;
}

/* ===== Code ===== */
.md-body code {
  font-family: "Courier New", "JetBrains Mono", monospace;
  font-size: 11px;
  background: rgba(42, 31, 26, 0.8);
  padding: 1px 5px;
  border-radius: 3px;
  color: #d97757;
}

.md-body pre {
  background: #15100d;
  border: 1px solid rgba(148, 137, 121, 0.12);
  border-radius: 4px;
  padding: 12px;
  margin: 10px 0;
  overflow: auto;
}

.md-body pre code {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: 11px;
  line-height: 1.5;
}

/* ===== Table ===== */
.md-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 12px;
}

.md-body thead {
  background: rgba(217, 119, 87, 0.1);
}

.md-body th {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid rgba(217, 119, 87, 0.3);
  color: #d97757;
  font-family: "Courier New", monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.md-body td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(148, 137, 121, 0.15);
  color: rgba(232, 213, 183, 0.75);
}

.md-body tbody tr:nth-child(even) {
  background: rgba(42, 31, 26, 0.3);
}

/* ===== Horizontal Rule (Diamond) ===== */
.md-body hr {
  border: none;
  margin: 16px 0;
  height: 1px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.md-body hr::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(148, 137, 121, 0.2);
}

.md-body hr::after {
  content: '';
  position: relative;
  z-index: 1;
  width: 5px;
  height: 5px;
  background: #d97757;
  transform: rotate(45deg);
  opacity: 0.6;
}

/* ===== Strong / Emphasis ===== */
.md-body strong {
  color: rgba(232, 213, 183, 0.95);
  font-weight: 600;
}

.md-body em {
  font-style: italic;
  color: rgba(232, 213, 183, 0.7);
}

/* ===== Links ===== */
.md-body a {
  color: #d97757;
  text-decoration: underline;
  text-decoration-color: rgba(217, 119, 87, 0.4);
}

.md-body a:hover {
  color: #e8a07a;
}

/* ===== Dialogue Type ===== */
.md-dialogue h2 {
  font-family: "Courier New", monospace;
  font-size: 10px;
  color: rgba(148, 137, 121, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 16px 0 4px 0;
  border: none;
  padding: 0;
}

.md-dialogue p {
  margin: 4px 0;
}

.md-dialogue strong {
  font-family: "Courier New", monospace;
  font-size: 11px;
}

.md-dialogue hr {
  margin: 8px 0;
}

.md-dialogue hr::after {
  display: none;
}

.md-dialogue hr::before {
  background: rgba(148, 137, 121, 0.1);
}
```

- [ ] **Step 2: Update MarkdownRenderer to import CSS**

```tsx
// src/components/md/MarkdownRenderer.tsx
import './markdown.css'
// ... rest unchanged
```

- [ ] **Step 3: Implement custom components**

```tsx
// src/components/md/components.tsx
import type { Components } from 'react-markdown'

// ===== Section label mapping =====
const sectionLabelMap: Record<string, string> = {
  '核心概念': 'CONCEPT',
  '学习记录': 'LOG',
  '学习要点': 'KEY POINTS',
  '认知缺口': 'GAPS',
  '掌握检验': 'CHECK',
  '未来发展建议': 'NEXT',
  '洞见': 'INSIGHT',
  '代码示例': 'CODE',
  '诊断阶段': 'DIAGNOSIS',
  '学习阶段': 'STUDY',
  '症状描述': 'SYMPTOM',
  '关键机制': 'MECHANISM',
  '矛盾点': 'PARADOX',
  '有效元素': 'EFFECTIVE',
  '待判断的问题': 'PENDING',
  '结束': 'END',
  '这个寓言真正讲的概念': 'CONCEPT',
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement).props.children)
  }
  return ''
}

// ===== Heading with section labels =====
function Heading({ level, children }: { level: number; children: React.ReactNode }) {
  const text = extractText(children).trim()
  const label = sectionLabelMap[text]

  if (level === 2 && label) {
    return (
      <div className="md-section-header">
        <div className="md-section-label">{label}</div>
        <h2>{children}</h2>
      </div>
    )
  }

  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  return <Tag>{children}</Tag>
}

// ===== Shared base components =====
const baseComponents: Components = {
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  hr: () => <hr />,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ children }) => <table>{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  code: ({ children, className }) => {
    const isInline = !className
    if (isInline) return <code>{children}</code>
    return (
      <pre>
        <code className={className}>{children}</code>
      </pre>
    )
  },
}

// ===== Dialogue-specific: parse "Name: content" format =====
function DialogueParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  const match = text.match(/^(.+?)：(.+)$/)
  if (match) {
    return (
      <p className="md-dialogue-line">
        <span className="md-dialogue-name">{match[1]}：</span>
        {match[2]}
      </p>
    )
  }
  return <p>{children}</p>
}

export const reportComponents: Components = baseComponents

export const fableComponents: Components = {
  ...baseComponents,
  // Fable uses the same base but CSS handles the narrative styling
}

export const dialogueComponents: Components = {
  ...baseComponents,
  h2: ({ children }) => <h2>{children}</h2>,
  p: ({ children }) => <DialogueParagraph>{children}</DialogueParagraph>,
  hr: () => <hr />,
}
```

Add dialogue CSS to `markdown.css`:

```css
/* Add to bottom of markdown.css */
.md-dialogue-line {
  margin: 4px 0;
  line-height: 1.6;
}

.md-dialogue-name {
  font-family: "Courier New", monospace;
  font-size: 11px;
  color: #d97757;
}
```

- [ ] **Step 4: Run dev and verify report styling**

```bash
npm run dev
```

Open a 学习报告. Expected:
- H1 with bottom border in Courier New
- H2 with section label (e.g., "CONCEPT" above "核心概念")
- Lists with proper indentation
- Blockquotes with left border + warm background
- Tables with header background
- HR rendered as line-diamond-line
- Code in monospace with dark background

- [ ] **Step 5: Commit**

```bash
git add src/components/md/components.tsx src/components/md/markdown.css src/components/md/MarkdownRenderer.tsx
git commit -m "feat(md): report-type custom components with Disco Elysium styling"
```

---

## Task 5: Fable-Type Styling

**Files:**
- Modify: `src/components/md/markdown.css`

- [ ] **Step 1: Add fable narrative styles**

Add to `markdown.css` after `.md-body` but before the media queries:

```css
/* ===== Fable Type: Narrative Paragraphs ===== */
.md-fable h1 {
  font-family: Georgia, "Noto Serif SC", serif;
  text-align: center;
  border-bottom: none;
  margin-bottom: 24px;
}

.md-fable h2 {
  font-family: Georgia, "Noto Serif SC", serif;
  text-align: center;
  color: #d97757;
}

/* Narrative paragraphs: indent + loose line-height */
.md-fable p {
  font-size: 14px;
  line-height: 2.0;
  text-indent: 2em;
  margin: 14px 0;
  color: rgba(232, 213, 183, 0.8);
}

/* Reset indent for first paragraph after heading or hr */
.md-fable h1 + p,
.md-fable h2 + p,
.md-fable hr + p,
.md-fable blockquote + p {
  text-indent: 0;
}

/* Blockquotes in fable keep narrative style */
.md-fable blockquote p {
  font-size: 14px;
  line-height: 2.0;
  text-indent: 2em;
  font-style: italic;
  color: rgba(232, 213, 183, 0.65);
}

/* Dialogue within fable */
.md-fable .md-dialogue-name {
  font-family: Georgia, serif;
  font-size: 14px;
  font-style: normal;
  color: #d97757;
}

.md-fable .md-dialogue-line {
  margin: 10px 0 10px 2em;
  font-size: 14px;
  line-height: 2.0;
  text-indent: 0;
  font-style: italic;
}
```

- [ ] **Step 2: Update fableComponents to detect dialogue lines**

Modify `src/components/md/components.tsx`:

```tsx
// Replace fableComponents definition with:
function FableParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  // Detect dialogue format: "Name: content" or "Name：content"
  const match = text.match(/^(.+?)[：:](.+)$/)
  if (match && match[1].length < 15) {
    return (
      <p className="md-dialogue-line">
        <span className="md-dialogue-name">{match[1]}：</span>
        {match[2]}
      </p>
    )
  }
  return <p>{children}</p>
}

export const fableComponents: Components = {
  ...baseComponents,
  p: ({ children }) => <FableParagraph>{children}</FableParagraph>,
}
```

- [ ] **Step 3: Run dev and verify fable styling**

Open a 寓言 file. Expected:
- Title centered in Georgia
- Narrative paragraphs with 2em indent and 2.0 line-height
- Dialogue lines indented with colored speaker name
- Separator as diamond line

- [ ] **Step 4: Commit**

```bash
git add src/components/md/components.tsx src/components/md/markdown.css
git commit -m "feat(md): fable-type narrative styling with dialogue detection"
```

---

## Task 6: Dialogue-Type Styling

**Files:**
- Modify: `src/components/md/components.tsx`
- Modify: `src/components/md/markdown.css`

- [ ] **Step 1: Dialogue styling already mostly done in Task 4**

The `.md-dialogue` CSS rules and `DialogueParagraph` component were added in Task 4. Verify by opening a 原始对话 file.

Expected:
- Timestamps (H2) in small monospace gray
- "用户：" in ember color
- "AI：" in parchment color  
- Content in Georgia 13px
- Messages separated by subtle horizontal lines

- [ ] **Step 2: Add AI/user color distinction**

Update `DialogueParagraph` in `components.tsx`:

```tsx
function DialogueParagraph({ children }: { children: React.ReactNode }) {
  const text = extractText(children)
  const match = text.match(/^(.+?)：(.+)$/)
  if (match) {
    const isUser = match[1].includes('用户')
    return (
      <p className="md-dialogue-line">
        <span className={`md-dialogue-name ${isUser ? 'md-dialogue-user' : 'md-dialogue-ai'}`}>
          {match[1]}：
        </span>
        {match[2]}
      </p>
    )
  }
  return <p>{children}</p>
}
```

Add CSS:

```css
.md-dialogue-user {
  color: #d97757;
}

.md-dialogue-ai {
  color: rgba(232, 213, 183, 0.7);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/md/components.tsx src/components/md/markdown.css
git commit -m "feat(md): dialogue-type chat styling with user/AI color distinction"
```

---

## Task 7: Shiki Code Highlighting

**Files:**
- Modify: `src/components/md/MarkdownRenderer.tsx`
- Modify: `src/components/md/components.tsx`

- [ ] **Step 1: Configure Shiki with custom theme**

Create a minimal custom theme inline to avoid WASM bundling issues:

```tsx
// src/components/md/shiki-theme.ts
export const warmDarkTheme = {
  name: 'study-parlor',
  type: 'dark' as const,
  colors: {
    'editor.background': '#15100d',
    'editor.foreground': '#e8d5b7',
  },
  tokenColors: [
    { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: '#d97757' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7fb069' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#c9a86c' } },
    { scope: ['constant.numeric'], settings: { foreground: '#deb887' } },
    { scope: ['comment'], settings: { foreground: '#6b6b5e', fontStyle: 'italic' } },
    { scope: ['variable', 'identifier'], settings: { foreground: '#e8d5b7' } },
    { scope: ['entity.name.type', 'support.type'], settings: { foreground: '#d4a574' } },
    { scope: ['entity.name.class'], settings: { foreground: '#d4a574' } },
    { scope: ['operator'], settings: { foreground: '#d97757' } },
  ],
}
```

- [ ] **Step 2: Integrate Shiki into MarkdownRenderer**

```tsx
// src/components/md/MarkdownRenderer.tsx
import rehypeShiki from '@shikijs/rehype'
import { warmDarkTheme } from './shiki-theme'
// ...

// In the component:
<Markdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[[rehypeShiki, {
    theme: warmDarkTheme,
    inline: 'tailing-curly-colon',
  }]]}
  components={components}
>
```

- [ ] **Step 3: Handle Shiki fallback**

If `@shikijs/rehype` fails to load in the Electron renderer (WASM bundling issues), wrap it in a try/catch and fall back to plain code blocks:

```tsx
// src/components/md/MarkdownRenderer.tsx
function getRehypePlugins() {
  try {
    const rehypeShiki = require('@shikijs/rehype').default
    return [[rehypeShiki, { theme: warmDarkTheme }]]
  } catch {
    console.warn('[MarkdownRenderer] Shiki not available, using plain code blocks')
    return []
  }
}
```

> **Note:** If this require() approach doesn't work in the Vite/Electron environment, the fallback is already acceptable — code blocks still render with dark background + monospace font from CSS.

- [ ] **Step 4: Run dev and test code highlighting**

Find or create a markdown file with a code block:

````markdown
```python
def fib(n):
    if n <= 1: return n
    return fib(n-1) + fib(n-2)
```
````

Expected: keywords in ember (#d97757), function names in soft green, strings in warm yellow.

- [ ] **Step 5: Commit**

```bash
git add src/components/md/shiki-theme.ts src/components/md/MarkdownRenderer.tsx
git commit -m "feat(md): Shiki syntax highlighting with warm dark theme"
```

---

## Task 8: Component Tests

**Files:**
- Create: `tests/md/components.test.tsx`

- [ ] **Step 1: Write Heading label test**

```tsx
// tests/md/components.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Markdown from 'react-markdown'
import { reportComponents } from '@/components/md/components'

describe('Heading with section labels', () => {
  it('renders section label for mapped H2 titles', () => {
    render(
      <Markdown components={reportComponents}>{'## 核心概念\n\n内容'}</Markdown>
    )
    expect(screen.getByText('CONCEPT')).toBeInTheDocument()
    expect(screen.getByText('核心概念')).toBeInTheDocument()
  })

  it('renders section label for 学习要点', () => {
    render(
      <Markdown components={reportComponents}>{'## 学习要点\n\n内容'}</Markdown>
    )
    expect(screen.getByText('KEY POINTS')).toBeInTheDocument()
  })

  it('does not render label for unknown H2 titles', () => {
    render(
      <Markdown components={reportComponents}>{'## 随机标题\n\n内容'}</Markdown>
    )
    expect(screen.queryByText('CONCEPT')).not.toBeInTheDocument()
    expect(screen.getByText('随机标题')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/md/components.test.tsx
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/md/components.test.tsx
git commit -m "test(md): Heading section label rendering"
```

---

## Task 9: Final Integration & Cleanup

**Files:**
- Modify: `src/components/SessionViewer.tsx`

- [ ] **Step 1: Remove the old `<pre>` fallback completely**

In `SessionViewer.tsx`, verify the rendering path is clean. The current integration from Task 3 should already replace the `<pre>`. Confirm no dead code remains:

Search for any remaining `<pre` in `SessionViewer.tsx` — there should be none except possibly in the image branch (which is fine).

- [ ] **Step 2: Verify all imports are used**

Check `SessionViewer.tsx` imports. Remove any now-unused imports. `MarkdownRenderer` should be imported and used.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all existing tests still pass + new md tests pass

- [ ] **Step 4: Run dev and do visual smoke test**

```bash
npm run dev
```

Smoke test checklist:
- [ ] Open a 学习报告 — headings, lists, blockquotes, tables render correctly
- [ ] Open a 寓言 — narrative indent, dialogue format, centered title
- [ ] Open a 原始对话 — timestamp formatting, user/AI color distinction
- [ ] Scroll long document — smooth, no layout shift
- [ ] Close modal and reopen — no memory leak or duplicate rendering

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(md): complete Markdown renderer with Disco Elysium styling"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|-----------------|------|
| File type detection (frontmatter + filename) | Task 2 |
| Report-type academic styling | Task 4 |
| Fable-type literary styling | Task 5 |
| Dialogue-type timeline styling | Task 6 |
| Section labels on H2 | Task 4 |
| Diamond divider HR | Task 4 (CSS) |
| Warm blockquote styling | Task 4 (CSS) |
| Table rendering | Task 4 (CSS) |
| Shiki code highlighting | Task 7 |
| Integration into SessionViewer | Task 3, 9 |

### Placeholder Scan

No TBDs, TODOs, or vague instructions found. All steps include concrete code and commands.

### Type Consistency

- `DocType` defined in `fileType.ts` and imported in `MarkdownRenderer.tsx` — consistent.
- Component signatures match `react-markdown` `Components` type throughout.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-md-renderer.md`.

