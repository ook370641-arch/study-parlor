/**
 * Build step: copies the pre-built constitution report from the deconstruct-report
 * skill template into the Electron main process output directory, so it gets
 * bundled in the packaged asar and can be synced to the study library on boot.
 *
 * The skill template lives at ~/.claude/skills/deconstruct-report/templates/constitution/
 * and contains the pre-built index.html + source/ files.
 *
 * If the skill template doesn't exist (e.g. CI without the skill installed),
 * this script is a silent no-op — the constitution report simply won't be
 * available in the packaged app.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const templateDir = path.join(
  os.homedir(),
  '.claude',
  'skills',
  'deconstruct-report',
  'templates',
  'constitution'
);

const outDir = path.join(__dirname, '..', 'out', 'main', 'constitution');

if (!fs.existsSync(path.join(templateDir, 'index.html'))) {
  console.log('[copy-constitution] skill template not found, skipping');
  process.exit(0);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(templateDir, outDir);
console.log('[copy-constitution] copied template to', outDir);
