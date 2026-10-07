#!/usr/bin/env node
/**
 * deconstruct-report 通用报告构建器
 *
 * 用法: node build-report.js <reportDir>
 *
 * 输入约定（<reportDir>/source/ 下三个文件）:
 *   full-text.md      权威原文（章节标题为独占一行的裸文本，如 "Preface"）
 *   annotations.json  读本数据: { sections: [{ id, title, titleZh, summary, discussion, zhText, notes: [{anchor, text}] }] }
 *                     - title 必须与原文中的章节标题逐字一致（构建器按标题行切分原文）
 *                     - notes[].text 兼容别名 commentary
 *   overview.json     页面元信息 + 总览模式内容（schema 见 SKILL.md）
 *
 * 输出: <reportDir>/index.html （单文件自包含，零依赖，可离线打开）
 *
 * 零依赖、无 LLM 调用——数据驱动装配，可反复重跑。
 */
const fs = require('fs');
const path = require('path');

const reportDir = process.argv[2];
if (!reportDir) {
  console.error('usage: node build-report.js <reportDir>');
  process.exit(1);
}
const srcDir = path.join(reportDir, 'source');
for (const f of ['full-text.md', 'annotations.json', 'overview.json']) {
  if (!fs.existsSync(path.join(srcDir, f))) {
    console.error(`missing required input: source/${f}`);
    process.exit(1);
  }
}

const overview = JSON.parse(fs.readFileSync(path.join(srcDir, 'overview.json'), 'utf8'));
const annotations = JSON.parse(fs.readFileSync(path.join(srcDir, 'annotations.json'), 'utf8'));
const fullText = fs.readFileSync(path.join(srcDir, 'full-text.md'), 'utf8');

// ===== SPLIT ENGLISH TEXT BY SECTION TITLE LINES =====
// 章节标题 = 独占一行的裸文本，与 annotations.sections[].title 逐字匹配，按出现顺序对齐。
// 匹配前做标点归一化（弯引号/长破折号 → ASCII），容忍排版差异。
function normalizePunct(s) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-');
}
function splitSectionsByTitles(text, titles) {
  const lines = text.split('\n');
  const marks = [];
  const remaining = [...titles];
  for (let i = 0; i < lines.length && remaining.length > 0; i++) {
    if (normalizePunct(lines[i].trim()) === normalizePunct(remaining[0])) {
      marks.push({ title: remaining.shift(), line: i });
    }
  }
  if (remaining.length > 0) {
    throw new Error(`section title lines not found in full-text.md: ${remaining.join(', ')}`);
  }
  return marks.map((m, idx) => {
    const end = idx + 1 < marks.length ? marks[idx + 1].line : lines.length;
    return { title: m.title, enText: lines.slice(m.line, end).join('\n').trim() };
  });
}

// ===== NORMALIZE ANNOTATIONS =====
const annSections = annotations.sections || annotations;
annSections.forEach(a => {
  if (!a.id || !a.title) throw new Error(`annotations section missing id/title: ${JSON.stringify(Object.keys(a))}`);
  a.notes = (a.notes || []).map(n => ({ anchor: n.anchor, text: n.text || n.commentary || '' }));
});

const enSections = splitSectionsByTitles(fullText, annSections.map(a => a.title));

const combinedSections = annSections.map((ann, i) => ({
  id: ann.id,
  title: ann.title,
  enText: enSections[i].enText,
  titleZh: ann.titleZh || '',
  summary: ann.summary || '',
  discussion: ann.discussion || '',
  zhText: ann.zhText || '(translation pending)',
  notes: ann.notes,
}));

// ===== HTML HELPERS =====
function escapeHtml(text) {
  // 文本节点只需转义 & < >；引号在文本内容中是合法 HTML
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ===== READER MODE =====
function generateReaderSection(section) {
  const notesHtml = section.notes.length > 0
    ? `<div class="reader-section-notes">
        <h4>夜话按</h4>
        ${section.notes.map(n => `
          <div class="reader-note">
            <div class="note-anchor">${escapeHtml(n.anchor)}</div>
            <div class="note-text">${escapeHtml(n.text)}</div>
          </div>
        `).join('')}
      </div>`
    : '';

  const enParas = section.enText.split(/\n\n+/).filter(p => p.trim());
  const zhParas = section.zhText.split(/\n\n+/).filter(p => p.trim());

  const enColumn = enParas.map(p => `<p>${escapeHtml(p).replace(/\n/g, ' ')}</p>`).join('\n');
  const zhColumn = zhParas.map(p => `<p>${escapeHtml(p).replace(/\n/g, ' ')}</p>`).join('\n');

  return `
<section class="reader-section" id="reader-${section.id}">
  <header class="reader-section-header">
    <div class="reader-section-label">原文章节</div>
    <h2 class="reader-section-title">${escapeHtml(section.title)}</h2>
    ${section.titleZh ? `<h3 class="reader-section-title-zh">${escapeHtml(section.titleZh)}</h3>` : ''}
  </header>

  <div class="reader-section-body">
    <div class="reader-col reader-col-en">
      <div class="col-label">EN · 原文</div>
      <div class="col-content">
        ${enColumn}
      </div>
    </div>

    <div class="reader-col reader-col-zh">
      <div class="col-label">中 · 译文</div>
      <div class="col-content">
        ${zhColumn}
      </div>
    </div>

    <div class="reader-col reader-col-notes">
      <div class="reader-summary">
        <div class="reader-summary-label">夜话总按</div>
        ${section.summary ? `<p class="summary-text"><strong>摘要：</strong>${escapeHtml(section.summary)}</p>` : ''}
        ${section.discussion ? `<p class="discussion-text"><strong>讨论：</strong>${escapeHtml(section.discussion)}</p>` : ''}
      </div>
      ${notesHtml}
    </div>
  </div>
</section>
`;
}

// ===== OVERVIEW SECTION GENERATORS (by type) =====
const SECTION_GENERATORS = {
  glance: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="glance-grid">
    ${(s.cards || []).map(c => `<div class="glance-card"><div class="glance-num">${escapeHtml(c.num)}${c.unit ? `<span class="glance-unit">${escapeHtml(c.unit)}</span>` : ''}</div><div class="glance-label">${escapeHtml(c.label)}</div>${c.desc ? `<div class="glance-desc">${escapeHtml(c.desc)}</div>` : ''}</div>`).join('\n    ')}
  </div>
</section>`,

  structure: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="structure-tree">
    ${(s.nodes || []).map(n => `<div class="structure-node${n.root ? ' root' : ''}${n.open ? ' open' : ''}" onclick="toggleNode(this)">
      <div class="node-label">${escapeHtml(n.label)}</div>
      <div class="node-title">${escapeHtml(n.title)}</div>
      <div class="node-question">${escapeHtml(n.question)}</div>
      <div class="node-detail">${n.detailHtml}</div>
    </div>`).join('\n    ')}
  </div>
</section>`,

  pyramid: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="pyramid-container">
    ${(s.levels || []).map((l, i) => `${i > 0 ? '<div class="pyramid-arrow"></div>\n    ' : ''}<div class="pyramid-level pyramid-l${i + 1}"><div class="py-label">${escapeHtml(l.label)}</div><div class="py-title">${escapeHtml(l.title)}</div><div class="py-desc">${escapeHtml(l.desc)}</div></div>`).join('\n    ')}
  </div>
</section>`,

  chapters: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="chapter-accordion">
    ${(s.chapters || []).map(c => `<div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">${escapeHtml(c.num)}</div><div class="ch-info"><div class="ch-label">${escapeHtml(c.label)}</div><div class="ch-title">${escapeHtml(c.title)}</div></div><div class="ch-indicator">+</div></div><div class="chapter-body">${c.bodyHtml}</div></div>`).join('\n    ')}
  </div>
</section>`,

  redlines: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="redlines-grid">
    ${(s.cards || []).map(c => `<div class="redline-card"><div class="rl-num">${escapeHtml(c.num)}</div><div class="rl-text">${c.textHtml}${c.tag ? `<div class="rl-tag">${escapeHtml(c.tag)}</div>` : ''}</div></div>`).join('\n    ')}
  </div>
  ${s.noteHtml ? `<div class="redline-note">${s.noteHtml}</div>` : ''}
</section>`,

  philosophy: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="philo-grid">
    ${(s.cards || []).map(c => `<div class="philo-card"><div class="ph-icon">${escapeHtml(c.icon)}</div><div class="ph-title">${escapeHtml(c.title)}</div><div class="ph-desc">${c.descHtml}</div>${c.source ? `<div class="ph-source">${escapeHtml(c.source)}</div>` : ''}</div>`).join('\n    ')}
  </div>
</section>`,

  critique: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="critique-table">
    <div class="critique-col pros">
      <h4>${escapeHtml(s.prosTitle || '✓ 赞誉')}</h4>
      ${(s.pros || []).map(c => `<div class="critique-item"><div class="c-label">${escapeHtml(c.label)}</div>${c.textHtml}</div>`).join('\n      ')}
    </div>
    <div class="critique-col cons">
      <h4>${escapeHtml(s.consTitle || '✗ 争议')}</h4>
      ${(s.cons || []).map(c => `<div class="critique-item"><div class="c-label">${escapeHtml(c.label)}</div>${c.textHtml}</div>`).join('\n      ')}
    </div>
  </div>
</section>`,

  quotes: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="quotes-stack">
    ${(s.quotes || []).map(q => `<div class="quote-block"><div class="q-text">${escapeHtml(q.text)}</div><div class="q-source">${q.sourceHtml}</div></div>`).join('\n    ')}
  </div>
</section>`,

  appendix: (s) => `
<section id="${s.id}">
  <div class="section-label">${escapeHtml(s.label)}</div>
  <h2 class="section-title">${escapeHtml(s.title)}</h2>
  ${s.subtitle ? `<p class="section-subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
  <div class="appendix-grid">
    <div class="appendix-col">
      <h4>${escapeHtml(s.termsTitle || '关键术语')}</h4>
      <ul>
        ${(s.terms || []).map(t => `<li><span class="term">${escapeHtml(t.term)}</span> <span class="def">${escapeHtml(t.def)}</span></li>`).join('\n        ')}
      </ul>
    </div>
    <div class="appendix-col">
      <h4>${escapeHtml(s.linksTitle || '外部资源')}</h4>
      <ul>
        ${(s.links || []).map(l => `<li><a href="${escapeAttr(l.url)}" target="_blank">${escapeHtml(l.text)}</a></li>`).join('\n        ')}
      </ul>
    </div>
  </div>
</section>`,
};

function generateHTML() {
  const hero = overview.hero;
  const overviewSections = overview.sections || [];
  for (const s of overviewSections) {
    if (!SECTION_GENERATORS[s.type]) throw new Error(`unknown overview section type: ${s.type} (id: ${s.id})`);
  }

  // 总览导航：hero + 各 section，navBreakBefore 处插分隔线
  const navItems = [`<a href="#${hero.id || 'hero'}" class="active">${escapeHtml(hero.navLabel || '扉页')}</a>`];
  for (const s of overviewSections) {
    if (s.navBreakBefore) navItems.push('<div class="nav-sep"></div>');
    navItems.push(`<a href="#${s.id}">${escapeHtml(s.navLabel || s.title)}</a>`);
  }
  const readerNavItems = combinedSections.map(sec =>
    `<a href="#reader-${sec.id}" onclick="scrollToReaderSection('${sec.id}')">${escapeHtml(sec.titleZh || sec.title)}</a>`
  ).join('\n');

  const readerSections = combinedSections.map(generateReaderSection).join('\n');
  const readerIntro = overview.readerIntro || {};

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(overview.pageTitle)}</title>
<style>
__CSS__
</style>
</head>
<body>

<button id="mobile-nav-btn" aria-label="菜单" onclick="toggleMobileNav()">☰</button>

<nav id="sidebar">
  <div class="nav-logo">${escapeHtml(overview.logo.title)}<span>${escapeHtml(overview.logo.subtitle || '')}</span></div>
  <div class="mode-switch">
    <button id="mode-overview" class="active" onclick="setMode('overview')">总览</button>
    <button id="mode-reader" onclick="setMode('reader')">读本</button>
  </div>
  <div id="overview-nav">
    ${navItems.join('\n    ')}
  </div>
  <div id="reader-nav" style="display:none">
    <div class="nav-group-label">原文章节</div>
    ${readerNavItems}
  </div>
</nav>

<main>

<!-- OVERVIEW MODE -->
<div id="overview-mode">

<section id="${hero.id || 'hero'}">
  <div class="hero-badge">${escapeHtml(hero.badge)}</div>
  <h1>${hero.titleHtml}</h1>
  <p class="section-subtitle" style="font-size:1.1rem;margin-top:0.5rem">
    ${escapeHtml(hero.subtitle).replace(/\n/g, '\n    ')}
  </p>
  <div class="hero-meta">
    ${(hero.meta || []).map(m => `<span><span class="meta-label">${escapeHtml(m.label)}</span> ${escapeHtml(m.value)}</span>`).join('\n    ')}
  </div>
  ${hero.licenseHtml ? `<div class="hero-cc0">${hero.licenseHtml}</div>` : ''}
</section>
${overviewSections.map(s => SECTION_GENERATORS[s.type](s)).join('\n')}

</div><!-- /overview-mode -->

<!-- READER MODE -->
<div id="reader-mode">
  <section id="reader-intro">
    <div class="section-label">${escapeHtml(readerIntro.label || '§10 · 双语注解读本')}</div>
    <h2 class="section-title">${escapeHtml(readerIntro.title || '逐章阅读')}</h2>
    ${readerIntro.descriptionHtml ? `<p>${readerIntro.descriptionHtml}</p>` : ''}
    <select id="reader-section-select" onchange="jumpToReaderSection(this.value)">
      ${combinedSections.map(s => `<option value="${s.id}">${escapeHtml(s.titleZh || s.title)}</option>`).join('\n      ')}
    </select>
  </section>

  ${readerSections}
</div><!-- /reader-mode -->

<div id="colophon">
  ${overview.colophonHtml || ''}
</div>

</main>

<aside id="reader-sidebar">
  <div class="reader-context">
    <h4>当前章节</h4>
    <div class="ctx-title" id="ctx-title">-</div>
    <div class="ctx-title-zh" id="ctx-title-zh">-</div>
    <div class="ctx-nav">
      <button onclick="prevReaderSection()">← 上一章</button>
      <button onclick="nextReaderSection()">下一章 →</button>
    </div>
  </div>
</aside>

<script>
__JS__
const readerSectionIds = ${JSON.stringify(combinedSections.map(s => s.id))};
let currentReaderIndex = 0;

function jumpToReaderSection(id){
  const el = document.getElementById('reader-' + id);
  if(el){
    el.scrollIntoView({behavior:'smooth'});
    currentReaderIndex = readerSectionIds.indexOf(id);
    updateReaderContext();
  }
}

function prevReaderSection(){
  if(currentReaderIndex > 0){
    currentReaderIndex--;
    jumpToReaderSection(readerSectionIds[currentReaderIndex]);
  }
}
function nextReaderSection(){
  if(currentReaderIndex < readerSectionIds.length - 1){
    currentReaderIndex++;
    jumpToReaderSection(readerSectionIds[currentReaderIndex]);
  }
}

function updateReaderContext(){
  const sec = document.getElementById('reader-' + readerSectionIds[currentReaderIndex]);
  if(!sec) return;
  const title = sec.querySelector('.reader-section-title')?.textContent || '';
  const titleZh = sec.querySelector('.reader-section-title-zh')?.textContent || '';
  document.getElementById('ctx-title').textContent = title;
  document.getElementById('ctx-title-zh').textContent = titleZh;
}

function updateReaderActive(){
  const readerSections = document.querySelectorAll('.reader-section');
  let found = false;
  readerSections.forEach((sec, idx) => {
    const top = sec.getBoundingClientRect().top;
    if(top < window.innerHeight * 0.4 && !found){
      currentReaderIndex = idx;
      found = true;
    }
  });
  updateReaderContext();
}

window.addEventListener('scroll', () => {
  if(document.getElementById('reader-mode').style.display !== 'none') updateReaderActive();
}, {passive:true});

/* ===== MOBILE NAV ===== */
function toggleMobileNav(){
  document.getElementById('sidebar').classList.toggle('mobile-open');
}
document.querySelectorAll('#sidebar a').forEach(a => {
  a.addEventListener('click', () => document.getElementById('sidebar').classList.remove('mobile-open'));
});

/* ===== INIT ===== */
updateActiveNav();
</script>

</body>
</html>
`;
}

// 模板 CSS/JS 与内容无关，放在单独文件中便于维护
const templateDir = __dirname;
const CSS = fs.readFileSync(path.join(templateDir, 'template.css'), 'utf8');
const JS = fs.readFileSync(path.join(templateDir, 'template.js'), 'utf8');

const html = generateHTML().replace('__CSS__', () => CSS.trim()).replace('__JS__', () => JS.trim());
fs.writeFileSync(path.join(reportDir, 'index.html'), html, 'utf8');
console.log('Generated', path.join(reportDir, 'index.html') + ':', html.length, 'chars');