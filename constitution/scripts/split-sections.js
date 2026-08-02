const fs = require('fs');
const text = fs.readFileSync('C:/Users/86468/Desktop/project/study-parlor/constitution/source/constitution-full-text.md', 'utf8');
const lines = text.split('\n');

const sections = [
  {title: 'Being helpful', line: 248},
  {title: "Following Anthropic's guidelines", line: 896},
  {title: 'Being broadly ethical', line: 953},
  {title: 'Hard constraints', line: 1517},
  {title: 'Being broadly safe', line: 1922},
  {title: "Claude's nature", line: 2223},
  {title: 'Concluding thoughts', line: 2587},
  {title: 'A final word', line: 2720}
];

const dir = 'C:/Users/86468/Desktop/project/study-parlor/constitution/source/sections';
fs.mkdirSync(dir, {recursive: true});

for (let i = 0; i < sections.length; i++) {
  const s = sections[i];
  const nextLine = i < sections.length - 1 ? sections[i+1].line - 1 : lines.length;
  const content = lines.slice(s.line - 1, nextLine).join('\n').trim();
  const id = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const path = dir + '/' + id + '.md';
  fs.writeFileSync(path, content, 'utf8');
  console.log(id + ':', content.length, 'chars');
}
