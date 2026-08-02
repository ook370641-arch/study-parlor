const fs = require('fs');

let text = fs.readFileSync('C:/Users/86468/Desktop/project/study-parlor/constitution/source/reader-annotations-partial.json', 'utf8');

let result = '';
let inString = false;
let escaped = false;

for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (escaped) {
    result += ch;
    escaped = false;
    continue;
  }
  if (ch === '\\') {
    result += ch;
    escaped = true;
    continue;
  }
  if (ch === '"') {
    if (!inString) {
      inString = true;
      result += ch;
    } else {
      let j = i + 1;
      while (j < text.length && /[\s\n\r]/.test(text[j])) j++;
      const next = text[j];
      if (next === ',' || next === '}' || next === ']' || next === ':' || next === undefined) {
        inString = false;
        result += ch;
      } else {
        result += '\\"';
      }
    }
  } else {
    result += ch;
  }
}

fs.writeFileSync('C:/Users/86468/Desktop/project/study-parlor/constitution/source/reader-annotations-partial-fixed.json', result, 'utf8');

try {
  JSON.parse(result);
  console.log('FIXED JSON IS VALID');
} catch (e) {
  console.log('STILL INVALID:', e.message);
  console.log('Snippet around error:', result.slice(Math.max(0, e.message.match(/position (\d+)/)?.[1] - 50), e.message.match(/position (\d+)/)?.[1] + 50));
}
