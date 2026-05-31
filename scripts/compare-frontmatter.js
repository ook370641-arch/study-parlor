const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const libPath = 'c:/Users/86468/Desktop/工作与学习/学习库';
const topics = fs.readdirSync(libPath).filter(d => fs.statSync(path.join(libPath, d)).isDirectory());

console.log('=== 学习报告 Frontmatter 对比 ===\n');

for (const topic of topics) {
  const topicPath = path.join(libPath, topic);
  const sessions = fs.readdirSync(topicPath).filter(d => fs.statSync(path.join(topicPath, d)).isDirectory());
  for (const session of sessions) {
    const reportPath = path.join(topicPath, session, '学习报告.md');
    if (!fs.existsSync(reportPath)) continue;

    const raw = fs.readFileSync(reportPath, 'utf8');
    const parsed = matter(raw);
    const d = parsed.data;

    const hasDesc = !!d.description;
    const hasSummary = !!d.progress_summary;
    const hasTags = Array.isArray(d.tags) && d.tags.length > 0;
    const tagCount = hasTags ? d.tags.length : 0;
    const descLen = hasDesc ? d.description.length : 0;
    const summaryLen = hasSummary ? d.progress_summary.length : 0;

    console.log(`${topic}/${session}: ${d.title}`);
    console.log(`  type=${d.type} | difficulty=${d.difficulty} | session=${d.session_number}`);
    console.log(`  description: ${hasDesc ? 'OK (' + descLen + ' chars)' : 'MISSING'}`);
    console.log(`  tags: ${hasTags ? d.tags.join(', ') + ' (' + tagCount + ')' : 'MISSING'}`);
    console.log(`  progress_summary: ${hasSummary ? 'OK (' + summaryLen + ' chars)' : 'MISSING'}`);
    console.log(`  visual_density_score: desc=${hasDesc ? 1 : 0} + tags=${tagCount} + summary=${hasSummary ? 1 : 0} = ${(hasDesc ? 1 : 0) + tagCount + (hasSummary ? 1 : 0)}`);
    console.log();
  }
}
