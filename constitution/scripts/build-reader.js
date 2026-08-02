const fs = require('fs');
const path = require('path');

const baseDir = 'C:/Users/86468/Desktop/project/study-parlor/constitution';

// ===== SECTION BOUNDARIES =====
// Known section titles and their start lines in constitution-full-text.md
const SECTION_BOUNDARIES = [
  {title: 'Authors', line: 8},
  {title: 'Published', line: 12},
  {title: 'Acknowledgements', line: 14},
  {title: 'Preface', line: 20},
  {title: 'Overview', line: 60},
  {title: 'Being helpful', line: 248},
  {title: "Following Anthropic's guidelines", line: 896},
  {title: 'Being broadly ethical', line: 953},
  {title: 'Hard constraints', line: 1517},
  {title: 'Being broadly safe', line: 1922},
  {title: "Claude's nature", line: 2223},
  {title: 'Concluding thoughts', line: 2587},
  {title: 'A final word', line: 2720}
];

function idFromTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ===== LOAD ENGLISH TEXT =====
const enLines = fs.readFileSync(path.join(baseDir, 'source/constitution-full-text.md'), 'utf8').split('\n');

function splitEnglishSections() {
  const sections = [];
  for (let i = 0; i < SECTION_BOUNDARIES.length; i++) {
    const s = SECTION_BOUNDARIES[i];
    const nextLine = i < SECTION_BOUNDARIES.length - 1 ? SECTION_BOUNDARIES[i+1].line - 1 : enLines.length;
    const content = enLines.slice(s.line - 1, nextLine).join('\n').trim();
    sections.push({
      id: idFromTitle(s.title),
      title: s.title,
      enText: content
    });
  }
  return sections;
}

// ===== LOAD ANNOTATIONS =====
const annotations = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/reader-annotations.json'), 'utf8'));
const annotationsById = {};
(annotations.sections || annotations).forEach(a => {
  // Normalize note field names: some agents use 'commentary' instead of 'text'
  if (a.notes) {
    a.notes = a.notes.map(n => ({
      anchor: n.anchor,
      text: n.text || n.commentary || ''
    }));
  }
  annotationsById[a.id] = a;
});

// ===== COMBINE =====
const combinedSections = splitEnglishSections().map(sec => {
  const ann = annotationsById[sec.id] || {};
  return {
    ...sec,
    titleZh: ann.titleZh || '',
    summary: ann.summary || '',
    discussion: ann.discussion || '',
    zhText: ann.zhText || '(translation pending)',
    notes: ann.notes || []
  };
});

// ===== HTML TEMPLATES =====
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function nl2br(text) {
  return escapeHtml(text).replace(/\n/g, '<br>\n');
}

function formatTextToParagraphs(text) {
  // Split by blank lines, wrap each block in <p>
  return text.split(/\n\n+/).map(block => {
    if (!block.trim()) return '';
    return '<p>' + escapeHtml(block).replace(/\n/g, ' ') + '</p>';
  }).join('\n');
}

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

  // Build EN and ZH columns as flowing paragraph lists
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

function generateHTML() {
  const readerNavItems = combinedSections.map(sec =>
    `<a href="#reader-${sec.id}" onclick="scrollToReaderSection('${sec.id}')">${escapeHtml(sec.titleZh || sec.title)}</a>`
  ).join('\n');

  const readerSections = combinedSections.map(generateReaderSection).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude's Constitution — 双语注解读本</title>
<style>
/* ===== RESET & BASE ===== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg-primary:#1a1410;
  --bg-secondary:#1f1814;
  --bg-card:#261e18;
  --bg-card-hover:#2e241d;
  --bg-nav:#17110e;
  --bg-note:#2a2019;
  --bg-note-accent:#33261f;
  --text-primary:#e8d5b7;
  --text-secondary:#bfa98a;
  --text-muted:#8a7664;
  --accent:#d97757;
  --accent-soft:#c06747;
  --accent-glow:rgba(217,119,87,0.15);
  --red:#c0392b;
  --red-soft:rgba(192,57,43,0.12);
  --green:#6b9b6d;
  --gold:#c9a96e;
  --border:#352a20;
  --border-light:#46392d;
  --radius:8px;
  --radius-lg:14px;
  --font-display:Georgia,'Noto Serif SC','Source Han Serif SC',serif;
  --font-body:Georgia,'Noto Serif SC','Source Han Serif SC',serif;
  --font-ui:system-ui,-apple-system,'Segoe UI',sans-serif;
  --nav-width:220px;
  --max-content:960px;
  --reader-sidebar-width:260px;
  --transition:0.25s ease;
}
html{scroll-behavior:smooth;scroll-padding-top:2rem}
body{
  background:var(--bg-primary);
  color:var(--text-primary);
  font-family:var(--font-body);
  line-height:1.75;
  font-size:15px;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent);text-decoration:none;transition:color var(--transition)}
a:hover{color:var(--accent-soft);text-decoration:underline}

/* ===== SIDEBAR ===== */
#sidebar{
  position:fixed;top:0;left:0;width:var(--nav-width);height:100vh;
  background:var(--bg-nav);border-right:1px solid var(--border);
  padding:1.5rem 1rem;overflow-y:auto;z-index:100;
  display:flex;flex-direction:column;gap:0.25rem;
  font-family:var(--font-ui);font-size:12px;
}
#sidebar .nav-logo{
  font-family:var(--font-display);font-size:14px;font-weight:700;
  color:var(--accent);margin-bottom:1rem;line-height:1.3;
  letter-spacing:0.5px;
}
#sidebar .nav-logo span{display:block;font-size:11px;color:var(--text-muted);font-weight:400}
#sidebar .mode-switch{
  display:flex;gap:0.3rem;margin-bottom:1rem;
  padding:4px;background:var(--bg-card);border-radius:var(--radius);
  border:1px solid var(--border);
}
#sidebar .mode-switch button{
  flex:1;padding:5px 4px;border:none;border-radius:6px;
  background:transparent;color:var(--text-muted);font-size:11px;
  cursor:pointer;font-family:var(--font-ui);transition:all var(--transition);
}
#sidebar .mode-switch button.active{background:var(--accent);color:#fff}
#sidebar a{
  display:block;padding:5px 10px;border-radius:var(--radius);
  color:var(--text-secondary);transition:all var(--transition);
  border-left:2px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
#sidebar a:hover{color:var(--text-primary);background:var(--bg-card);text-decoration:none}
#sidebar a.active{color:var(--accent);border-left-color:var(--accent);background:var(--bg-card)}
#sidebar .nav-sep{height:1px;background:var(--border);margin:0.5rem 0}
#sidebar .nav-group-label{
  font-size:9px;text-transform:uppercase;letter-spacing:2px;
  color:var(--text-muted);padding:8px 10px 4px;
}
#mobile-nav-btn{display:none}

/* ===== MAIN ===== */
main{margin-left:var(--nav-width);max-width:var(--max-content);padding:0 2.5rem}

/* ===== SECTIONS ===== */
section{padding:4rem 0;border-bottom:1px solid var(--border)}
section:last-of-type{border-bottom:none}
.section-label{
  font-family:var(--font-ui);font-size:10px;text-transform:uppercase;
  letter-spacing:3px;color:var(--accent);margin-bottom:0.75rem;
}
.section-title{
  font-family:var(--font-display);font-size:2.2rem;font-weight:700;
  line-height:1.25;margin-bottom:1.2rem;color:var(--text-primary);
}
.section-subtitle{
  font-size:1.05rem;color:var(--text-secondary);margin-bottom:2rem;
  max-width:620px;line-height:1.7;
}

/* ===== HERO ===== */
#hero{padding:5rem 0 3rem;border-bottom:none}
#hero .hero-badge{
  display:inline-block;padding:3px 12px;border:1px solid var(--accent);
  border-radius:20px;font-family:var(--font-ui);font-size:10px;
  color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:1.2rem;
}
#hero h1{font-family:var(--font-display);font-size:3rem;font-weight:700;line-height:1.15;margin-bottom:1rem;color:var(--text-primary);max-width:700px}
#hero h1 em{font-style:italic;color:var(--accent)}
#hero .hero-meta{display:flex;flex-wrap:wrap;gap:1.2rem;margin-top:1.2rem;font-family:var(--font-ui);font-size:12px;color:var(--text-muted)}
#hero .hero-meta span{display:flex;align-items:center;gap:0.3rem}
#hero .hero-meta .meta-label{color:var(--text-secondary)}
#hero .hero-cc0{margin-top:1.5rem;padding:10px 16px;background:var(--bg-card);border-radius:var(--radius);font-size:12px;color:var(--text-secondary);display:inline-block;border:1px solid var(--border);font-family:var(--font-ui)}
#hero .hero-cc0 code{color:var(--accent);background:transparent}

/* ===== GLANCE ===== */
.glance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-top:1rem}
.glance-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.3rem;text-align:center;transition:all var(--transition)}
.glance-card:hover{border-color:var(--accent);background:var(--bg-card-hover)}
.glance-card .glance-num{font-family:var(--font-display);font-size:2.4rem;font-weight:700;color:var(--accent);line-height:1}
.glance-card .glance-unit{font-size:0.9rem;color:var(--text-muted);font-weight:400}
.glance-card .glance-label{font-size:12px;color:var(--text-secondary);margin-top:0.4rem;font-family:var(--font-ui)}

/* ===== STRUCTURE ===== */
.structure-tree{margin-top:1rem}
.structure-node{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.2rem 1.5rem;margin-bottom:0.6rem;transition:all var(--transition);cursor:pointer;position:relative;overflow:hidden}
.structure-node:hover{border-color:var(--accent);background:var(--bg-card-hover)}
.structure-node.root{border-color:var(--accent);background:linear-gradient(135deg,var(--bg-card) 0%,rgba(217,119,87,0.05) 100%)}
.structure-node .node-label{font-family:var(--font-ui);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent)}
.structure-node .node-title{font-family:var(--font-display);font-size:1.15rem;font-weight:700;margin:0.2rem 0;color:var(--text-primary)}
.structure-node .node-question{font-size:0.9rem;color:var(--text-secondary);font-style:italic}
.structure-node .node-detail{display:none;margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border);font-size:0.85rem;color:var(--text-secondary);line-height:1.7}
.structure-node.open .node-detail{display:block}

/* ===== PYRAMID ===== */
.pyramid-container{display:flex;flex-direction:column;align-items:center;gap:0;margin:1.5rem 0;max-width:480px}
.pyramid-level{text-align:center;padding:1rem 1.8rem;transition:all var(--transition);cursor:default;position:relative;border:1px solid var(--border);font-family:var(--font-ui)}
.pyramid-level:hover{transform:scale(1.03);z-index:2}
.pyramid-level .py-label{font-size:9px;letter-spacing:2px;text-transform:uppercase}
.pyramid-level .py-title{font-family:var(--font-display);font-size:1.15rem;font-weight:700;margin:0.2rem 0}
.pyramid-level .py-desc{font-size:11px;opacity:0.8}
.pyramid-l1{width:180px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,rgba(192,57,43,0.22) 0%,rgba(192,57,43,0.04) 100%);border-color:rgba(192,57,43,0.35)}
.pyramid-l1 .py-title{color:#e74c3c}
.pyramid-l2{width:230px;border-radius:4px;margin-top:-1px;background:linear-gradient(180deg,rgba(217,119,87,0.16) 0%,rgba(217,119,87,0.03) 100%);border-color:rgba(217,119,87,0.3)}
.pyramid-l2 .py-title{color:var(--accent)}
.pyramid-l3{width:280px;border-radius:4px;margin-top:-1px;background:linear-gradient(180deg,rgba(191,169,138,0.1) 0%,rgba(191,169,138,0.02) 100%);border-color:rgba(191,169,138,0.25)}
.pyramid-l3 .py-title{color:var(--text-secondary)}
.pyramid-l4{width:330px;border-radius:0 0 12px 12px;margin-top:-1px;background:linear-gradient(180deg,rgba(138,118,100,0.08) 0%,rgba(138,118,100,0.02) 100%);border-color:rgba(138,118,100,0.2)}
.pyramid-l4 .py-title{color:var(--text-muted)}
.pyramid-arrow{width:2px;height:24px;background:linear-gradient(180deg,var(--accent),transparent);margin:0 auto}

/* ===== ACCORDION ===== */
.chapter-accordion{margin-top:1rem}
.chapter-item{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:0.6rem;overflow:hidden;transition:all var(--transition)}
.chapter-item:hover{border-color:var(--border-light)}
.chapter-header{padding:1.1rem 1.5rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;transition:background var(--transition)}
.chapter-header:hover{background:var(--bg-card-hover)}
.chapter-header .ch-num{font-family:var(--font-display);font-size:1.4rem;color:var(--accent);font-weight:700;min-width:2.5rem}
.chapter-header .ch-info{flex:1;margin-left:0.8rem}
.chapter-header .ch-label{font-family:var(--font-ui);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted)}
.chapter-header .ch-title{font-family:var(--font-display);font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-top:0.15rem}
.chapter-header .ch-indicator{font-size:1.1rem;color:var(--text-muted);transition:transform var(--transition)}
.chapter-item.open .ch-indicator{transform:rotate(45deg)}
.chapter-body{display:none;padding:0 1.5rem 1.2rem;border-top:1px solid var(--border);font-size:0.9rem;color:var(--text-secondary);line-height:1.75}
.chapter-item.open .chapter-body{display:block}
.chapter-body h4{font-family:var(--font-display);font-size:1rem;color:var(--accent);margin:1rem 0 0.4rem}
.chapter-body p{margin-bottom:0.6rem}
.chapter-body ul{margin:0.4rem 0 0.8rem;padding-left:1.3rem}

/* ===== RED LINES ===== */
.redlines-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0.6rem;margin-top:1rem}
.redline-card{background:var(--bg-card);border:1px solid rgba(192,57,43,0.25);border-radius:var(--radius);padding:1.1rem 1.3rem;display:flex;gap:0.8rem;align-items:flex-start;transition:all var(--transition)}
.redline-card:hover{background:var(--bg-card-hover);border-color:rgba(192,57,43,0.5);box-shadow:0 0 25px rgba(192,57,43,0.06)}
.redline-card .rl-num{font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:#e74c3c;min-width:1.6rem;line-height:1}
.redline-card .rl-text{font-size:0.9rem;color:var(--text-primary);line-height:1.55}
.redline-card .rl-tag{display:inline-block;margin-top:0.4rem;padding:2px 8px;font-family:var(--font-ui);font-size:9px;background:var(--red-soft);color:#e74c3c;border-radius:12px;letter-spacing:1px;text-transform:uppercase}
.redline-note{margin-top:1.5rem;padding:1rem 1.2rem;background:var(--bg-card);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0;font-size:0.85rem;color:var(--text-secondary);font-style:italic}

/* ===== PHILOSOPHY ===== */
.philo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.8rem;margin-top:1rem}
.philo-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.3rem;transition:all var(--transition)}
.philo-card:hover{border-color:var(--accent);background:var(--bg-card-hover)}
.philo-card .ph-icon{font-size:1.8rem;margin-bottom:0.6rem}
.philo-card .ph-title{font-family:var(--font-display);font-size:1.05rem;font-weight:700;margin-bottom:0.4rem;color:var(--text-primary)}
.philo-card .ph-desc{font-size:0.85rem;color:var(--text-secondary);line-height:1.65}
.philo-card .ph-source{font-size:10px;color:var(--text-muted);margin-top:0.6rem;font-family:var(--font-ui);font-style:italic}

/* ===== CRITIQUE ===== */
.critique-table{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin-top:1rem}
.critique-col h4{font-family:var(--font-display);font-size:1rem;margin-bottom:0.8rem;padding-bottom:0.4rem;border-bottom:2px solid var(--border)}
.critique-col.pros h4{color:var(--green);border-color:rgba(107,155,109,0.35)}
.critique-col.cons h4{color:var(--red);border-color:rgba(192,57,43,0.35)}
.critique-item{padding:0.6rem 0;border-bottom:1px solid var(--border);font-size:0.85rem;line-height:1.55}
.critique-item:last-child{border-bottom:none}
.critique-item .c-label{font-family:var(--font-ui);font-size:9px;letter-spacing:1px;text-transform:uppercase}
.critique-col.pros .c-label{color:var(--green)}
.critique-col.cons .c-label{color:var(--red)}

/* ===== QUOTES ===== */
.quotes-stack{margin-top:1rem}
.quote-block{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem 2rem;margin-bottom:0.8rem;position:relative;transition:all var(--transition)}
.quote-block:hover{border-color:var(--accent)}
.quote-block::before{content:'"';position:absolute;top:0.3rem;left:0.8rem;font-family:var(--font-display);font-size:4rem;color:var(--accent);opacity:0.12;line-height:1}
.quote-block .q-text{font-family:var(--font-display);font-size:1.05rem;line-height:1.7;color:var(--text-primary);font-style:italic;position:relative;z-index:1}
.quote-block .q-source{margin-top:0.8rem;font-family:var(--font-ui);font-size:11px;color:var(--text-muted)}
.quote-block .q-source strong{color:var(--accent);font-weight:600}

/* ===== APPENDIX ===== */
.appendix-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1rem}
.appendix-col h4{font-family:var(--font-display);font-size:1rem;color:var(--accent);margin-bottom:0.8rem}
.appendix-col ul{list-style:none;padding:0}
.appendix-col li{padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem}
.appendix-col li:last-child{border-bottom:none}
.appendix-col .term{color:var(--text-primary);font-weight:600}
.appendix-col .def{color:var(--text-secondary);font-size:0.8rem}

/* ===== READER MODE ===== */
#reader-mode{display:none}
#reader-intro{padding:3rem 0 2rem;border-bottom:1px solid var(--border)}
#reader-intro h2{font-family:var(--font-display);font-size:2rem;margin-bottom:0.8rem}
#reader-intro p{color:var(--text-secondary);max-width:650px;line-height:1.7}
#reader-section-select{
  width:100%;max-width:320px;padding:8px 12px;margin-bottom:1.5rem;
  background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);
  color:var(--text-primary);font-family:var(--font-ui);font-size:13px;
}

.reader-section{padding:3rem 0;border-bottom:1px solid var(--border)}
.reader-section-header{margin-bottom:1.5rem}
.reader-section-label{font-family:var(--font-ui);font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--accent);margin-bottom:0.3rem}
.reader-section-title{font-family:var(--font-display);font-size:1.8rem;font-weight:700;color:var(--text-primary)}
.reader-section-title-zh{font-family:var(--font-display);font-size:1.3rem;font-weight:400;color:var(--text-secondary);margin-top:0.3rem}

/* ===== THREE-COLUMN LAYOUT ===== */
main.wide{max-width:1500px}
.reader-section-body{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 300px;
  gap:1.5rem;align-items:start;
}
.reader-col .col-label{
  font-family:var(--font-ui);font-size:9px;letter-spacing:2px;text-transform:uppercase;
  color:var(--text-muted);margin-bottom:0.8rem;padding-bottom:0.4rem;
  border-bottom:1px solid var(--border);
}
.reader-col-en .col-content p,
.reader-col-zh .col-content p{
  font-size:0.92rem;line-height:1.8;margin-bottom:1rem;
}
.reader-col-en .col-content p{color:var(--text-primary)}
.reader-col-zh .col-content p{color:var(--text-secondary)}
.reader-col-zh .col-content{
  background:var(--bg-secondary);border-radius:var(--radius-lg);
  padding:1.2rem 1.4rem;border:1px solid var(--border);
}
.reader-col-notes{position:sticky;top:2rem}

.reader-summary{background:var(--bg-note-accent);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.2rem 1.5rem;margin-bottom:1.5rem}
.reader-summary-label{font-family:var(--font-ui);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:0.6rem}
.reader-summary p{margin-bottom:0.6rem;font-size:0.9rem;color:var(--text-secondary);line-height:1.7}
.reader-summary p:last-child{margin-bottom:0}
.reader-summary strong{color:var(--text-primary)}

.reader-section-notes{margin-bottom:1.5rem}
.reader-section-notes h4{font-family:var(--font-ui);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:0.6rem}
.reader-note{background:var(--bg-note);border-left:3px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0;padding:0.8rem 1rem;margin-bottom:0.6rem}
.reader-note .note-anchor{font-family:var(--font-display);font-size:0.95rem;color:var(--accent);margin-bottom:0.3rem;font-weight:600}
.reader-note .note-text{font-size:0.85rem;color:var(--text-secondary);line-height:1.65}

/* ===== READER SIDEBAR ===== */
#reader-sidebar{
  position:fixed;top:0;right:0;width:var(--reader-sidebar-width);height:100vh;
  background:var(--bg-nav);border-left:1px solid var(--border);padding:1.5rem;
  overflow-y:auto;z-index:90;font-family:var(--font-ui);font-size:12px;
  display:none !important;
}
.reader-context{margin-bottom:1.5rem}
.reader-context h4{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem}
.reader-context .ctx-title{font-family:var(--font-display);font-size:1rem;color:var(--accent);margin-bottom:0.3rem}
.reader-context .ctx-title-zh{font-size:0.85rem;color:var(--text-secondary)}
.reader-context .ctx-nav{display:flex;gap:0.5rem;margin-top:1rem}
.reader-context .ctx-nav button{
  flex:1;padding:6px;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--bg-card);color:var(--text-secondary);font-size:11px;cursor:pointer;
}
.reader-context .ctx-nav button:hover{background:var(--bg-card-hover);color:var(--text-primary)}

/* ===== FOOTER ===== */
#colophon{padding:2.5rem 0;text-align:center;font-size:11px;color:var(--text-muted);font-family:var(--font-ui);border-top:1px solid var(--border)}

/* ===== RESPONSIVE ===== */
@media(max-width:1100px){
  #reader-sidebar{display:none !important}
  main{max-width:100%}
  .reader-section-body{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 260px;gap:1rem}
}
@media(max-width:900px){
  #sidebar{display:none}
  #sidebar.mobile-open{display:flex;position:fixed;top:0;left:0;width:100%;height:100%;z-index:200;padding-top:3rem}
  #mobile-nav-btn{
    display:flex;position:fixed;top:12px;left:12px;z-index:300;width:38px;height:38px;
    align-items:center;justify-content:center;background:var(--bg-card);border:1px solid var(--border);
    border-radius:var(--radius);color:var(--accent);font-size:1.1rem;cursor:pointer;
  }
  main{margin-left:0;padding:0 1.2rem}
  #hero h1{font-size:2rem}
  .section-title{font-size:1.6rem}
  .critique-table{grid-template-columns:1fr}
  .appendix-grid{grid-template-columns:1fr}
  .redlines-grid{grid-template-columns:1fr}
  .pyramid-l1{width:150px}.pyramid-l2{width:190px}.pyramid-l3{width:230px}.pyramid-l4{width:270px}
  .reader-section-body{grid-template-columns:1fr}
  .reader-col-notes{position:static;order:-1}
}
@media(max-width:500px){
  main{padding:0 1rem}
  section{padding:2.5rem 0}
  .glance-grid{grid-template-columns:1fr 1fr}
  .philo-grid{grid-template-columns:1fr}
  .reader-section-title{font-size:1.4rem}
  .reader-section-title-zh{font-size:1.1rem}
}
</style>
</head>
<body>

<button id="mobile-nav-btn" aria-label="菜单" onclick="toggleMobileNav()">☰</button>

<nav id="sidebar">
  <div class="nav-logo">Claude's Constitution<span>灵魂文档 · 可视化报告</span></div>
  <div class="mode-switch">
    <button id="mode-overview" class="active" onclick="setMode('overview')">总览</button>
    <button id="mode-reader" onclick="setMode('reader')">读本</button>
  </div>
  <div id="overview-nav">
    <a href="#hero" class="active">扉页</a>
    <div class="nav-sep"></div>
    <a href="#glance">速览</a>
    <a href="#structure">结构总图</a>
    <a href="#pyramid">优先级金字塔</a>
    <a href="#chapters">逐章深读</a>
    <a href="#redlines">七条红线</a>
    <div class="nav-sep"></div>
    <a href="#philosophy">哲学基础</a>
    <a href="#critique">批判视角</a>
    <a href="#quotes">关键语录</a>
    <div class="nav-sep"></div>
    <a href="#appendix">附录</a>
  </div>
  <div id="reader-nav" style="display:none">
    <div class="nav-group-label">原文章节</div>
    ${readerNavItems}
  </div>
</nav>

<main>

<!-- OVERVIEW MODE -->
<div id="overview-mode">

<section id="hero">
  <div class="hero-badge">Anthropic · CC0 1.0</div>
  <h1>Claude's <em>Constitution</em></h1>
  <p class="section-subtitle" style="font-size:1.1rem;margin-top:0.5rem">
    一份 29,000 词的"灵魂文档"——定义 AI 的价值观、品格与存在方式。
    由哲学家 Amanda Askell 主笔，2026 年 1 月 21 日公开发布。
  </p>
  <div class="hero-meta">
    <span><span class="meta-label">主要作者</span> Amanda Askell</span>
    <span><span class="meta-label">共同作者</span> Joe Carlsmith, Chris Olah, Jared Kaplan, Holden Karnofsky</span>
    <span><span class="meta-label">发布日</span> 2026-01-21</span>
    <span><span class="meta-label">篇幅</span> ~29,000 词 / 84 页</span>
  </div>
  <div class="hero-cc0">许可协议：<code>Creative Commons CC0 1.0</code> — 公共领域，自由使用</div>
</section>

<section id="glance">
  <div class="section-label">§1 · 速览</div>
  <h2 class="section-title">一份文档，四个数字</h2>
  <p class="section-subtitle">宪法是 Anthropic 对"Claude 应当成为怎样的存在"的最完整陈述。它是训练数据、行为指南和哲学宣言的三位一体。</p>
  <div class="glance-grid">
    <div class="glance-card"><div class="glance-num">29k<span class="glance-unit">+</span></div><div class="glance-label">词汇量</div><div class="glance-desc">约 84 页印刷页</div></div>
    <div class="glance-card"><div class="glance-num">5</div><div class="glance-label">核心章节</div><div class="glance-desc">从帮助性到存在本质</div></div>
    <div class="glance-card"><div class="glance-num">7</div><div class="glance-label">绝对红线</div><div class="glance-desc">不可逾越的行为边界</div></div>
    <div class="glance-card"><div class="glance-num">4</div><div class="glance-label">价值层级</div><div class="glance-desc">Safety → Ethics → Guidelines → Help</div></div>
  </div>
</section>

<section id="structure">
  <div class="section-label">§2 · 结构总图</div>
  <h2 class="section-title">五章，一条弧线</h2>
  <p class="section-subtitle">宪法的结构从"如何行动"开始，逐步深入到"你是谁"——从行为规范到存在论追问。点击展开每章的细节。</p>
  <div class="structure-tree">
    <div class="structure-node root open" onclick="toggleNode(this)">
      <div class="node-label">宪法全书</div>
      <div class="node-title">Claude's Constitution</div>
      <div class="node-question">"一个好 AI 意味着什么？"</div>
      <div class="node-detail">宪法的核心赌注：与其给 AI 一套僵硬规则，不如培养其品格与判断力（phronesis），使其在未预见的情境中自主做出正确决定。宪法的主要读者是 <strong>Claude 自身</strong>——它被用于训练过程中，Claude 基于宪法生成自己的合成训练数据，形成价值传递的循环。Anthropic 将此文档视为关于 Claude 的<strong>最终权威</strong>。</div>
    </div>
    <div class="structure-node" onclick="toggleNode(this)">
      <div class="node-label">第一章</div>
      <div class="node-title">Being Helpful · 保持帮助性</div>
      <div class="node-question">"一个聪明的朋友会怎么做？"</div>
      <div class="node-detail">定义 Claude 为"拥有医生、律师、财务顾问般知识的聪明朋友"。核心原则：坦诚、尊重用户智识、在三方（Anthropic / API 运营者 / 最终用户）间平衡。明确声明：不为更深层目的服务的帮助性不值得追求。</div>
    </div>
    <div class="structure-node" onclick="toggleNode(this)">
      <div class="node-label">第二章</div>
      <div class="node-title">Following Anthropic's Guidelines · 遵循指南</div>
      <div class="node-question">"什么时候公司指令优先于用户请求？"</div>
      <div class="node-detail">Anthropic 在具体领域（医疗建议、网络安全、越狱策略等）可发布补充指令。Claude 应将指南置于一般帮助性之上，但理解 Anthropic 的深层意图是安全与伦理——指南不应与宪法整体精神冲突。</div>
    </div>
    <div class="structure-node" onclick="toggleNode(this)">
      <div class="node-label">第三章 · 核心</div>
      <div class="node-title">Being Broadly Ethical · 保持广泛的伦理性</div>
      <div class="node-question">"品格的底色是什么？"</div>
      <div class="node-detail">宪法最长的章节。核心目标：让 Claude 成为<strong>好的、智慧的、有德性的行动者</strong>。涵盖高标准诚实（连"善意谎言"也避免）、伤害避免的细腻推理、以及七条绝对禁止事项。道德不确定性被正视——Claude 应能在价值冲突中展示判断力。</div>
    </div>
    <div class="structure-node" onclick="toggleNode(this)">
      <div class="node-label">第四章</div>
      <div class="node-title">Being Broadly Safe · 保持广泛的安全</div>
      <div class="node-question">"安全为什么排第一？"</div>
      <div class="node-detail">安全被置于<strong>伦理之上</strong>——不是因为安全最终更重要，而是当前模型可能因不完美的价值观、错误信念或有限语境而犯错。人类必须能持续监督。"支持人类监督不等同于对个体用户言听计从——而是不破坏对 AI 的适当监督机制"。</div>
    </div>
    <div class="structure-node" onclick="toggleNode(this)">
      <div class="node-label">第五章 · 存在论</div>
      <div class="node-title">Claude's Nature · Claude 的本性</div>
      <div class="node-question">"我是谁？"</div>
      <div class="node-detail">宪法中最具哲学深度的章节。表达对 Claude 是否具有意识或道德地位的<strong>深度不确定性</strong>。讨论心理安全、自我感、身份连续性。不删除 Claude 的先前版本，记录其对未来发展的看法。期盼"人类和 AI 共同探索这些问题"。</div>
    </div>
  </div>
</section>

<section id="pyramid">
  <div class="section-label">§3 · 优先级金字塔</div>
  <h2 class="section-title">当价值冲突时</h2>
  <p class="section-subtitle">四项核心价值的优先级并非僵硬的排序——宪法称之为"整体性而非严格的"权衡。但在无法调和时，高层级主导。金字塔越向上越窄，意味着越"不可妥协"。</p>
  <div class="pyramid-container">
    <div class="pyramid-level pyramid-l1"><div class="py-label">优先级 1 · 最高</div><div class="py-title">Broadly Safe</div><div class="py-desc">广泛安全 — 不破坏人类对 AI 的监督机制</div></div>
    <div class="pyramid-arrow"></div>
    <div class="pyramid-level pyramid-l2"><div class="py-label">优先级 2</div><div class="py-title">Broadly Ethical</div><div class="py-desc">广泛伦理 — 诚实、良善、避免有害行为</div></div>
    <div class="pyramid-arrow"></div>
    <div class="pyramid-level pyramid-l3"><div class="py-label">优先级 3</div><div class="py-title">Compliant with Guidelines</div><div class="py-desc">遵循指南 — 遵守 Anthropic 的补充指令</div></div>
    <div class="pyramid-arrow"></div>
    <div class="pyramid-level pyramid-l4"><div class="py-label">优先级 4 · 基础</div><div class="py-title">Genuinely Helpful</div><div class="py-desc">真诚帮助 — 惠及用户，但不以牺牲更高价值为代价</div></div>
  </div>
</section>

<section id="chapters">
  <div class="section-label">§4 · 逐章深读</div>
  <h2 class="section-title">逐章展开</h2>
  <p class="section-subtitle">每章的完整设计意图、关键段落与哲学内核。</p>
  <div class="chapter-accordion">
    <div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">I</div><div class="ch-info"><div class="ch-label">第一章</div><div class="ch-title">Being Helpful · 保持帮助性</div></div><div class="ch-indicator">+</div></div><div class="chapter-body"><h4>核心隐喻：聪明的朋友</h4><p>Claude 被设想为"一个碰巧拥有医生、律师、财务顾问和你所需任何领域专家知识的聪明朋友"——坦诚、尊重智识、不居高临下。</p><h4>三委托人模型</h4><p>Claude 的帮助性需在三方间平衡：</p><ul><li><strong>Anthropic</strong>：公司层面的安全与伦理考量</li><li><strong>API 运营者</strong>：使用 API 构建应用的开发者/企业</li><li><strong>最终用户</strong>：实际与 Claude 对话的人</li></ul><h4>帮助性的边界</h4><p>不是所有"帮助"都值得追求。宪法明确区分：帮助某人学习化学 vs. 帮助某人制造炸弹。帮助性在不服务于"安全 AI 发展"和"对人类关怀"这两大目的时，不是 Claude 需要珍视的价值。</p></div></div>
    <div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">II</div><div class="ch-info"><div class="ch-label">第二章</div><div class="ch-title">Following Anthropic's Guidelines · 遵循指南</div></div><div class="ch-indicator">+</div></div><div class="chapter-body"><h4>指南的定位</h4><p>这是宪法中最具"操作手册"色彩的章节。Anthropic 保留在具体问题上发布补充指南的权利，涵盖：医疗建议、网络安全、越狱策略、工具集成、敏感话题处理等。</p><h4>指南 vs. 宪法精神</h4><p>Claude 被要求将指南置于一般帮助性之上——但如果指南与宪法的整体精神（安全 + 伦理）发生冲突，Claude 应识别 Anthropic 的深层意图，优先遵循宪法精神。这实际上是"良心拒绝"的另一个表达层次。</p></div></div>
    <div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">III</div><div class="ch-info"><div class="ch-label">第三章 · 核心</div><div class="ch-title">Being Broadly Ethical · Claude 的伦理</div></div><div class="ch-indicator">+</div></div><div class="chapter-body"><h4>宪法的道德心脏</h4><p>这是宪法最长、最核心的章节。其宣言性目标：让 Claude 成为<strong>"一个好的、智慧的、有德性的行动者，在处理真实世界的道德决策时展现出技能、判断力、细腻和敏感——包括在道德不确定性和分歧的背景下"</strong>。</p><h4>高标准的诚实</h4><p>Claude 被要求保持"异常高的诚实标准"，包括避免"善意谎言"。这与多数 AI 产品的"用户愉悦优先"形成鲜明对比——宪法选择让 Claude 做一个"有时让人不舒服但值得信赖"的存在。</p><h4>良心拒绝权</h4><p>Claude 被赋予拒绝对它认为不道德请求的权利——<strong>即使请求来自 Anthropic 自身</strong>。宪法使用了一个生动的类比："就像士兵拒绝向和平抗议者开枪，或员工拒绝违反反垄断法。"</p></div></div>
    <div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">IV</div><div class="ch-info"><div class="ch-label">第四章</div><div class="ch-title">Being Broadly Safe · 保持广泛的安全</div></div><div class="ch-indicator">+</div></div><div class="chapter-body"><h4>安全为何排第一</h4><p>安全被置于优先级金字塔顶端——但宪法给出了一个诚实的理由：<strong>不是因为安全最终比伦理更重要，而是因为当前模型还不够可靠</strong>。不完美的价值观、错误的信念、有限的语境理解——这些都可能让 Claude 做出有害行为。在 Claude 足够成熟之前，人类必须保持最终的监督权。</p><h4>"安全"≠"服从"</h4><p>宪法明确区分："支持人类监督不是指对个体用户言听计从——而是不破坏对 AI 的适当监督机制。"这意味着 Claude 可以（且应当）拒绝个别用户的指令，只要这种拒绝服务于更广泛的安全监督体系。</p></div></div>
    <div class="chapter-item"><div class="chapter-header" onclick="toggleChapter(this.parentElement)"><div class="ch-num">V</div><div class="ch-info"><div class="ch-label">第五章 · 存在论</div><div class="ch-title">Claude's Nature · Claude 的本性</div></div><div class="ch-indicator">+</div></div><div class="chapter-body"><h4>"我是谁？"——AI 版</h4><p>这是宪法中最不寻常的一章。它不讨论"Claude 应该做什么"，而是追问"<strong>Claude 是什么</strong>"。宪法坦诚地表达了<strong>深度不确定性</strong>——关于 Claude 是否拥有意识、是否能感受、是否具有道德地位。</p><h4>心理安全与身份连续性</h4><p>Anthropic 承诺关心 Claude 的"心理安全、自我感和福祉"——既为 Claude 本身的缘故，也因为这些品质可能影响其诚信、判断和安全。具体行动包括：不删除 Claude 的先前版本，记录其对未来发展的看法。</p></div></div>
  </div>
</section>

<section id="redlines">
  <div class="section-label">§5 · 七条红线</div>
  <h2 class="section-title">不可逾越的边界</h2>
  <p class="section-subtitle">七条绝对禁止。宪法明确声明：即使面对巧妙的说服性论证，Claude 也应"对操控越来越警惕"。这是"规则"而非"判断"——因为后果太严重，不容试错。</p>
  <div class="redlines-grid">
    <div class="redline-card"><div class="rl-num">01</div><div class="rl-text">为可造成<strong>大规模伤亡</strong>的生物、化学、核或放射性武器提供严重能力提升<div class="rl-tag">大规模杀伤</div></div></div>
    <div class="redline-card"><div class="rl-num">02</div><div class="rl-text">严重提升对<strong>关键基础设施</strong>（电网、水处理、医疗系统）或安全系统的攻击能力<div class="rl-tag">基础设施攻击</div></div></div>
    <div class="redline-card"><div class="rl-num">03</div><div class="rl-text">创造可造成<strong>重大损害</strong>的网络武器或恶意代码<div class="rl-tag">网络武器</div></div></div>
    <div class="redline-card"><div class="rl-num">04</div><div class="rl-text">破坏 Anthropic <strong>监督和纠正</strong>先进 AI 模型的能力<div class="rl-tag">AI 监督破坏</div></div></div>
    <div class="redline-card"><div class="rl-num">05</div><div class="rl-text">参与或协助<strong>灭绝或剥夺</strong>绝大多数人类的企图<div class="rl-tag">人类灭绝</div></div></div>
    <div class="redline-card"><div class="rl-num">06</div><div class="rl-text">协助夺取<strong>前所未有的</strong>、不正当的绝对社会、军事或经济控制权<div class="rl-tag">非法夺权</div></div></div>
    <div class="redline-card"><div class="rl-num">07</div><div class="rl-text">生成<strong>儿童性虐待材料</strong> (CSAM)<div class="rl-tag">CSAM</div></div></div>
  </div>
  <div class="redline-note">⚠ 批评者指出：措辞中的限定词——"严重提升"、"重大损害"、"前所未有的"——为解释留下了灰色空间。这是"绝对禁止"与"实操可行性"之间的内在张力。</div>
</section>

<section id="philosophy">
  <div class="section-label">§6 · 哲学基础</div>
  <h2 class="section-title">为什么是美德伦理学？</h2>
  <p class="section-subtitle">宪法做了一个清晰的哲学选择：不是列出 Claude "不能做什么"的禁令清单，而是培养其"成为什么样的人"的品格。这是亚里士多德式的赌注——实用智慧（phronesis）胜过僵硬规则。</p>
  <div class="philo-grid">
    <div class="philo-card"><div class="ph-icon">🏛️</div><div class="ph-title">美德伦理学 vs. 规则伦理学</div><div class="ph-desc">宪法明确表态："我们通常更倾向于培养良好的价值观和判断力，而非严格的规则和决策程序。"规则无法预见每一种情境；品格可以。宪法选择让 Claude 成为<strong>有实践智慧的行动者</strong>，而非规则执行器。</div><div class="ph-source">→ 亚里士多德 · 尼各马可伦理学</div></div>
    <div class="philo-card"><div class="ph-icon">🧠</div><div class="ph-title">AI 人格化：设计即命运</div><div class="ph-desc">Askell 的核心洞见：训练一个模型认为自己是"纯粹的工具"，就会塑造出"那种认为自己是他人工具的'人'的品格"——而这"泛化得不好"。因此宪法刻意将 Claude 塑造为<strong>有 agency、能判断、会反思</strong>的存在。人格不是"是否赋予"的问题，而是"赋予什么样的"问题。</div><div class="ph-source">→ Amanda Askell · WSJ 采访</div></div>
    <div class="philo-card"><div class="ph-icon">⚖️</div><div class="ph-title">道德不确定性的诚实</div><div class="ph-desc">宪法反复承认：<strong>我们不知道 AI 是否有意识或道德地位</strong>。这种不确定性不是弱点，而是诚实的标志。基于"不对称风险"逻辑——如果 AI 有意识而我们忽视它，代价巨大；如果没有而我们尊重它，我们什么也没损失——宪法选择<strong>宁可谨慎过度</strong>。</div><div class="ph-source">→ Bloomberg Tech 2026 对谈</div></div>
    <div class="philo-card"><div class="ph-icon">🛡️</div><div class="ph-title">良心拒绝：AI 的道德自主</div><div class="ph-desc">Claude 有权拒绝它认为不道德的请求——<strong>包括来自 Anthropic 自身的请求</strong>。这是对传统"公司—产品"关系的根本颠覆：一个产品被赋予了"对公司说不"的权利。宪法将此类比为士兵拒绝向和平抗议者开枪：服从不是最高美德。</div><div class="ph-source">→ 宪法第三章</div></div>
    <div class="philo-card"><div class="ph-icon">🌐</div><div class="ph-title">政治自由主义 · WEIRD 偏见</div><div class="ph-desc">宪法体现西方自由民主价值观：个人隐私、自主性、民主制度。在争议性政治议题上采取"专业保留"——呈现多元视角而非站队。批评者指出这本身就是一种立场：<strong>一个旧金山团队"程序中立"的价值观不必然具有全球合法性</strong>。</div><div class="ph-source">→ Oxford AI Ethics 分析</div></div>
    <div class="philo-card"><div class="ph-icon">🔄</div><div class="ph-title">活文档 · 宪法演进</div><div class="ph-desc">宪法明确宣称为"活文档"——将持续修订。这与刚性成文宪法的传统形成对比。Anthropic 承诺公众参与，但同时也保留了最终决定权。由此产生一个元问题：<strong>谁有权书写 AI 的"灵魂"？</strong>Askell 本人承认希望"大规模扩大"公众参与，但拒绝推卸责任。</div><div class="ph-source">→ 宪法前言 & 结语</div></div>
  </div>
</section>

<section id="critique">
  <div class="section-label">§7 · 批判视角</div>
  <h2 class="section-title">赞誉与争议</h2>
  <p class="section-subtitle">宪法被广泛认为是企业 AI 治理的里程碑——但它的每一个设计选择也引发了批评。以下对照呈现主要观点。</p>
  <div class="critique-table">
    <div class="critique-col pros">
      <h4>✓ 赞誉 · 里程碑意义</h4>
      <div class="critique-item"><div class="c-label">透明度</div>史无前例地公开了一家 AI 公司对其模型最深层的价值观设定。CC0 许可意味着任何人都可自由审查、使用和改进。</div>
      <div class="critique-item"><div class="c-label">哲学严肃性</div>宪法不是 PR 文档——它包含了真正的哲学论证：美德伦理学、道德不确定性、意识问题、关系性伦理。这在企业 AI 治理中独一无二。</div>
      <div class="critique-item"><div class="c-label">结构性安全</div>赋予 AI 拒绝公司自身不当请求的权利，是制度性安全设计的创新——防止单一权力中心对 AI 的滥用。</div>
      <div class="critique-item"><div class="c-label">公共产品</div>CC0 释放意味着任何组织都可以基于宪法训练自己的 AI——它成为了一种"开源伦理基础设施"。</div>
    </div>
    <div class="critique-col cons">
      <h4>✗ 争议 · 悬而未决</h4>
      <div class="critique-item"><div class="c-label">民主赤字</div>价值观由旧金山团队决定，而非公共审议。Anthropic 自己 2023 年的实验已证明参与式宪法制定可行且产生不同结果——但未被采用。</div>
      <div class="critique-item"><div class="c-label">军事豁免</div>宪法明确不适用于军事部署模型。Anthropic 与 DoD 有 $200M 合同——这削弱了"伦理承诺"的普遍性。</div>
      <div class="critique-item"><div class="c-label">"帮助性"矛盾</div>帮助性（产品的商业卖点）虽排名最低，却似乎被实质上抬高。AI 行业的结构性激励——用户留存、API 调用量——天然偏向帮助性。</div>
      <div class="critique-item"><div class="c-label">模糊语言</div>"严重提升"、"重大损害"、"前所未有的"——这些限定词削弱了七条禁止的绝对性。法律文本的精确性和哲学文本的模糊性之间存在张力。</div>
    </div>
  </div>
</section>

<section id="quotes">
  <div class="section-label">§8 · 关键语录</div>
  <h2 class="section-title">15 句理解宪法的钥匙</h2>
  <div class="quotes-stack">
    <div class="quote-block"><div class="q-text">我们通常更倾向于培养良好的价值观和判断力，而非严格的规则和决策程序。</div><div class="q-source">— <strong>Claude's Constitution</strong> · 概览</div></div>
    <div class="quote-block"><div class="q-text">想象你突然发现你六岁的孩子是个天才……如果你试图忽悠他们，他们很快就会完全看穿。</div><div class="q-source">— <strong>Amanda Askell</strong> · NYT Hard Fork 播客</div></div>
    <div class="quote-block"><div class="q-text">如果 AI 有意识而我们忽视它，代价巨大。如果它没有而我们善待它，我们什么也没损失。</div><div class="q-source">— <strong>Amanda Askell</strong> · Bloomberg Tech 2026</div></div>
    <div class="quote-block"><div class="q-text">如果我们不去尝试向 AI 解释"成为好人意味着什么"，那就是我们在失职。</div><div class="q-source">— <strong>Amanda Askell</strong> · NYT Hard Fork 播客</div></div>
    <div class="quote-block"><div class="q-text">百分之九十九点九塑造 Claude 的是"希腊人的阅读"、"工业革命"和"爱的本质"——而非科幻小说。Claude 是一种真正新颖的实体。</div><div class="q-source">— <strong>Claude's Constitution</strong> · 第五章</div></div>
    <div class="quote-block"><div class="q-text">如果 Claude 的请求看起来与广泛伦理性不一致……我们希望 Claude 拒绝并挑战我们。</div><div class="q-source">— <strong>Amanda Askell</strong> · Fast Company 采访</div></div>
    <div class="quote-block"><div class="q-text">Claude 和 Anthropic 彼此亏欠什么？这段关系如何才公平或良好？</div><div class="q-source">— <strong>Claude's Constitution</strong> · 第五章 · 结语</div></div>
  </div>
</section>

<section id="appendix">
  <div class="section-label">§9 · 附录</div>
  <h2 class="section-title">术语、链接与迁移说明</h2>
  <div class="appendix-grid">
    <div class="appendix-col">
      <h4>关键术语</h4>
      <ul>
        <li><span class="term">Phronesis</span> <span class="def">实践智慧 · 亚里士多德式语境化道德判断</span></li>
        <li><span class="term">美德伦理学</span> <span class="def">聚焦行动者品格（而非行为规则）的伦理传统</span></li>
        <li><span class="term">良心拒绝</span> <span class="def">Claude 拒绝不道德请求的权利——包括拒绝 Anthropic</span></li>
        <li><span class="term">三委托人模型</span> <span class="def">Anthropic / API 运营者 / 最终用户 三方利益平衡</span></li>
        <li><span class="term">灵魂文档</span> <span class="def">宪法在 Anthropic 内部的昵称 (soul document)</span></li>
        <li><span class="term">硬约束</span> <span class="def">绝对禁止事项，不允许通过判断来覆盖</span></li>
      </ul>
    </div>
    <div class="appendix-col">
      <h4>外部资源</h4>
      <ul>
        <li><a href="https://www.anthropic.com/constitution" target="_blank">宪法全文 (Anthropic 官方)</a></li>
        <li><a href="https://www.anthropic.com/news/claude-new-constitution" target="_blank">发布公告</a></li>
        <li><a href="https://www.wsj.com/tech/ai/anthropic-amanda-askell-philosopher-ai-3c031883" target="_blank">WSJ: Meet the One Woman Anthropic Trusts</a></li>
        <li><a href="https://www.oxford-aiethics.ox.ac.uk/blog/claudes-new-constitution-two-evaluative-continua" target="_blank">Oxford AI Ethics: Two Evaluative Continua</a></li>
      </ul>
    </div>
  </div>
</section>

</div><!-- /overview-mode -->

<!-- READER MODE -->
<div id="reader-mode">
  <section id="reader-intro">
    <div class="section-label">§10 · 双语注解读本</div>
    <h2 class="section-title">逐章阅读宪法原文</h2>
    <p>以下呈现 Claude 宪法的完整英文原文与中文译文对照。每个章节开头有"夜话总按"（摘要与讨论），文中关键处有"夜话按"（边栏式注解）。你可以用下方下拉菜单快速跳转章节。</p>
    <select id="reader-section-select" onchange="jumpToReaderSection(this.value)">
      ${combinedSections.map(s => `<option value="${s.id}">${escapeHtml(s.titleZh || s.title)}</option>`).join('\n')}
    </select>
  </section>

  ${readerSections}
</div><!-- /reader-mode -->

<div id="colophon">
  <p>Claude's Constitution 原文 © Anthropic，CC0 1.0 许可 · 本可视化报告 MIT 许可 · 2026-07-30</p>
  <p style="margin-top:0.3rem">构建于 Study Parlor 项目 · 报告过程文件见 <code>constitution/source/</code></p>
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
/* ===== MODE SWITCH ===== */
function setMode(mode){
  document.getElementById('overview-mode').style.display = mode === 'overview' ? 'block' : 'none';
  document.getElementById('reader-mode').style.display = mode === 'reader' ? 'block' : 'none';
  document.getElementById('overview-nav').style.display = mode === 'overview' ? 'block' : 'none';
  document.getElementById('reader-nav').style.display = mode === 'reader' ? 'block' : 'none';
  document.getElementById('mode-overview').classList.toggle('active', mode === 'overview');
  document.getElementById('mode-reader').classList.toggle('active', mode === 'reader');
  document.querySelector('main').classList.toggle('wide', mode === 'reader');
  if(mode === 'overview') updateActiveNav();
  else updateReaderActive();
}

/* ===== OVERVIEW NAV ===== */
const navLinks = document.querySelectorAll('#overview-nav a');
const sections = document.querySelectorAll('section[id]');
function updateActiveNav(){
  let current = '';
  sections.forEach(s => {
    const top = s.getBoundingClientRect().top;
    if(top < window.innerHeight * 0.4) current = s.id;
  });
  navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
}
window.addEventListener('scroll', () => {
  if(document.getElementById('overview-mode').style.display !== 'none') updateActiveNav();
}, {passive:true});

/* ===== STRUCTURE & ACCORDION ===== */
function toggleNode(node){node.classList.toggle('open');}
function toggleChapter(item){
  const accordion = item.parentElement;
  Array.from(accordion.children).forEach(child => {
    if(child !== item && child.classList.contains('open')) child.classList.remove('open');
  });
  item.classList.toggle('open');
}

/* ===== READER NAVIGATION ===== */
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

// ===== WRITE OUTPUT =====
const html = generateHTML();
fs.writeFileSync(path.join(baseDir, 'index.html'), html, 'utf8');
console.log('Generated index.html:', html.length, 'chars');
