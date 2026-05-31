const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const libPath = 'c:/Users/86468/Desktop/工作与学习/学习库';
const topics = fs.readdirSync(libPath).filter(d => fs.statSync(path.join(libPath, d)).isDirectory());

console.log('=== 所有文件类型的 Frontmatter 对比 ===\n');

for (const topic of topics) {
  const topicPath = path.join(libPath, topic);
  const sessions = fs.readdirSync(topicPath).filter(d => fs.statSync(path.join(topicPath, d)).isDirectory());
  for (const session of sessions) {
    const sessionPath = path.join(topicPath, session);
    const files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(sessionPath, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = matter(raw);
      const d = parsed.data;

      const hasDesc = !!d.description;
      const hasSummary = !!d.progress_summary;
      const hasTags = Array.isArray(d.tags) && d.tags.length > 0;
      const tagCount = hasTags ? d.tags.length : 0;

      console.log(topic + '/' + session + '/' + file);
      console.log('  title=' + (d.title || 'N/A') + ' | type=' + (d.type || 'N/A') + ' | difficulty=' + (d.difficulty || 'N/A'));
      console.log('  description=' + (hasDesc ? 'Y' : 'N') + ' | tags=' + tagCount + ' | summary=' + (hasSummary ? 'Y' : 'N'));
      console.log();
    }
  }
}
