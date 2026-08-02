const fs = require('fs');
const path = require('path');

const baseDir = 'C:/Users/86468/Desktop/project/study-parlor/constitution';

const partial = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/reader-annotations-partial.json'), 'utf8'));
const agent1 = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/agent-results-1.json'), 'utf8'));
const agent2 = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/agent-results-2.json'), 'utf8'));
const agent3 = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/agent-results-3.json'), 'utf8'));
const agent4 = JSON.parse(fs.readFileSync(path.join(baseDir, 'source/agent-results-4.json'), 'utf8'));

// Combine all section arrays/objects
const allSections = [
  ...partial.sections,
  agent2,
  ...agent1,
  ...agent3,
  ...agent4
];

// Normalize notes: ensure each note has 'text' not 'commentary'
allSections.forEach(sec => {
  if (sec.notes) {
    sec.notes = sec.notes.map(n => ({
      anchor: n.anchor,
      text: n.text || n.commentary || ''
    }));
  }
});

// Ensure correct order by id
const expectedOrder = [
  'authors',
  'published',
  'acknowledgements',
  'preface',
  'overview',
  'being-helpful',
  'following-anthropic-s-guidelines',
  'being-broadly-ethical',
  'hard-constraints',
  'being-broadly-safe',
  'claude-s-nature',
  'concluding-thoughts',
  'a-final-word'
];

const sectionsById = {};
allSections.forEach(s => { sectionsById[s.id] = s; });

const orderedSections = expectedOrder.map(id => {
  if (!sectionsById[id]) {
    console.error('Missing section:', id);
    return {id, titleZh: id, zhText: '(missing)' };
  }
  return sectionsById[id];
});

const output = { sections: orderedSections };
fs.writeFileSync(path.join(baseDir, 'source/reader-annotations.json'), JSON.stringify(output, null, 2), 'utf8');
console.log('Combined', orderedSections.length, 'sections into reader-annotations.json');
console.log('Sections:', orderedSections.map(s => s.id + ' (' + (s.titleZh || s.title) + ')').join('\n'));
