#!/usr/bin/env node
/**
 * Study Parlor — Library Migration Script
 *
 * Migrates old folder structure (学习/, 寓言/, 图片/) to new 学习库/ structure.
 *
 * Usage:
 *   node scripts/migrate-library.js [--dry-run]
 *
 * Environment:
 *   STUDY_BASE — base directory containing 工作与学习/ (default: ~/Desktop)
 */

const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const STUDY_BASE = process.env.STUDY_BASE || path.join(require('os').homedir(), 'Desktop');
const SRC_ROOT = path.join(STUDY_BASE, '工作与学习');
const DIRS = {
  study: path.join(SRC_ROOT, '学习'),
  fable: path.join(SRC_ROOT, '寓言'),
  image: path.join(SRC_ROOT, '图片'),
};
const DEST_ROOT = path.join(SRC_ROOT, '学习库');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Mapping Tables ───────────────────────────────────────────────────────────

/**
 * Topic-level mapping.
 * Each topic defines:
 *   - study:  array of { srcFile, destSession } for 学习/ files
 *   - fable:  array of { srcFile, destSession, destName? } for 寓言/ files
 *   - images: array of { srcFile, destName } for 图片/ files
 */
const TOPIC_MAP = {
  'harness-engineering': {
    study: [
      { srcFile: '2026-04-27-harness-engineering-s1.md', destSession: 's1' },
    ],
    fable: [],
    images: [
      { srcFile: 'harness-engineering.png', destName: '学习配图.png' },
    ],
  },
  'Agent': {
    study: [],
    fable: [],
    images: [
      { srcFile: 'Agent.png', destName: '学习配图.png', srcDir: 'harness-engineering' },
    ],
  },
  'RAG': {
    study: [
      { srcFile: '2026-04-28-RAG-s1.md', destSession: 's1' },
    ],
    fable: [
      { srcFile: '2026-04-25-RAG-s1.md', destSession: 's1' },
    ],
    images: [
      { srcFile: 'RAG.png', destName: '学习配图.png' },
    ],
  },
  'vibe-coding': {
    study: [
      { srcFile: '2026-04-25-vibe-coding-s1.md', destSession: 's1' },
    ],
    fable: [
      { srcFile: '2026-04-24-vibe-coding-s1.md', destSession: 's1', destName: '寓言.md' },
      { srcFile: '2026-04-27-vibe-coding-s3.md', destSession: 's1', destName: '寓言2.md' },
    ],
    images: [
      { srcFile: 'vibe-coding.png', destName: '学习配图.png' },
      { srcFile: 'harness-engineering-research.png', destName: '寓言配图.png', srcDir: 'harness-engineering' },
    ],
  },
  '报告标准': {
    study: [
      { srcFile: '2026-04-01-报告标准-s1.md', destSession: 's1' },
      { srcFile: '2026-04-27-报告标准-s2.md', destSession: 's2' },
      { srcFile: '2026-04-28-报告标准-s5.md', destSession: 's3' },
    ],
    fable: [
      { srcFile: '2026-04-28-报告标准-s3.md', destSession: 's1' },
      { srcFile: '2026-04-28-报告标准-s4.md', destSession: 's2' },
      { srcFile: '2026-04-28-报告标准-s6.md', destSession: 's3' },
    ],
    images: [],
  },
  '板书系统': {
    study: [
      { srcFile: '2026-04-28-板书系统-s1.md', destSession: 's1' },
    ],
    fable: [
      { srcFile: '2026-04-28-板书系统-s2.md', destSession: 's1' },
    ],
    images: [],
  },
  '用户思维': {
    study: [
      { srcFile: '2026-04-29-用户思维-s1.md', destSession: 's1' },
    ],
    fable: [
      { srcFile: '2026-04-27-用户思维-s1.md', destSession: 's1' },
    ],
    images: [
      { srcFile: '用户思维.png', destName: '学习配图.png' },
      { srcFile: '用户思维-research.png', destName: '寓言配图.png' },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(...args);
}

function logError(...args) {
  console.error(...args);
}

function ensureDir(dirPath) {
  if (DRY_RUN) {
    return;
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dest) {
  if (DRY_RUN) {
    return true;
  }
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (err) {
    logError(`  ERROR copying: ${err.message}`);
    return false;
  }
}

function fileExists(p) {
  return fs.existsSync(p) && fs.statSync(p).isFile();
}

function dirExists(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSources() {
  let ok = true;
  for (const [name, dirPath] of Object.entries(DIRS)) {
    if (!dirExists(dirPath)) {
      logError(`ERROR: Source directory not found: ${dirPath}`);
      ok = false;
    }
  }
  return ok;
}

function validateDest() {
  if (dirExists(DEST_ROOT)) {
    logError(`ERROR: Destination directory already exists: ${DEST_ROOT}`);
    logError('       Please remove or rename it before running migration.');
    return false;
  }
  return true;
}

// ─── Migration ────────────────────────────────────────────────────────────────

function runMigration() {
  const report = {
    copied: [],
    skipped: [],
    missing: [],
    topics: {},
  };

  for (const [topic, config] of Object.entries(TOPIC_MAP)) {
    const topicReport = {
      copied: [],
      skipped: [],
      missing: [],
    };

    log(`\n[${topic}]`);

    // ── Study files ──
    for (const item of config.study) {
      const srcDir = item.srcDir || topic;
      const srcPath = path.join(DIRS.study, srcDir, item.srcFile);
      const destDir = path.join(DEST_ROOT, topic, item.destSession);
      const destPath = path.join(destDir, '学习报告.md');

      if (!fileExists(srcPath)) {
        log(`  MISSING (study): ${srcPath}`);
        topicReport.missing.push({ type: 'study', src: srcPath, dest: destPath });
        continue;
      }

      ensureDir(destDir);
      if (copyFile(srcPath, destPath)) {
        log(`  COPIED: ${srcPath} → ${destPath}`);
        topicReport.copied.push({ type: 'study', src: srcPath, dest: destPath });
      }
    }

    // ── Fable files ──
    for (const item of config.fable) {
      const srcDir = item.srcDir || topic;
      const srcPath = path.join(DIRS.fable, srcDir, item.srcFile);
      const destDir = path.join(DEST_ROOT, topic, item.destSession);
      const destName = item.destName || '寓言.md';
      const destPath = path.join(destDir, destName);

      if (!fileExists(srcPath)) {
        log(`  MISSING (fable): ${srcPath}`);
        topicReport.missing.push({ type: 'fable', src: srcPath, dest: destPath });
        continue;
      }

      ensureDir(destDir);
      if (copyFile(srcPath, destPath)) {
        log(`  COPIED: ${srcPath} → ${destPath}`);
        topicReport.copied.push({ type: 'fable', src: srcPath, dest: destPath });
      }
    }

    // ── Image files ──
    for (const item of config.images) {
      const srcDir = item.srcDir || topic;
      const srcPath = path.join(DIRS.image, srcDir, item.srcFile);
      // Determine which session this image belongs to
      // Images go to s1 by default, unless overridden
      const destSession = item.destSession || 's1';
      const destDir = path.join(DEST_ROOT, topic, destSession);
      const destPath = path.join(destDir, item.destName);

      if (!fileExists(srcPath)) {
        log(`  MISSING (image): ${srcPath}`);
        topicReport.missing.push({ type: 'image', src: srcPath, dest: destPath });
        continue;
      }

      ensureDir(destDir);
      if (copyFile(srcPath, destPath)) {
        log(`  COPIED: ${srcPath} → ${destPath}`);
        topicReport.copied.push({ type: 'image', src: srcPath, dest: destPath });
      }
    }

    report.topics[topic] = topicReport;
    report.copied.push(...topicReport.copied);
    report.skipped.push(...topicReport.skipped);
    report.missing.push(...topicReport.missing);
  }

  return report;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport(report) {
  log('\n' + '='.repeat(60));
  log('MIGRATION REPORT');
  log('='.repeat(60));

  if (DRY_RUN) {
    log('\n*** DRY RUN MODE — No files were actually copied ***\n');
  }

  log(`\nTotal copied:  ${report.copied.length}`);
  log(`Total missing: ${report.missing.length}`);
  log(`Total skipped: ${report.skipped.length}`);

  if (report.missing.length > 0) {
    log('\n--- Missing Files ---');
    for (const item of report.missing) {
      log(`  [${item.type}] ${item.src}`);
    }
  }

  log('\n--- Per-Topic Summary ---');
  for (const [topic, tr] of Object.entries(report.topics)) {
    const total = tr.copied.length + tr.missing.length + tr.skipped.length;
    if (total === 0) continue;
    log(`  ${topic}: ${tr.copied.length} copied, ${tr.missing.length} missing, ${tr.skipped.length} skipped`);
  }

  log('\n' + '='.repeat(60));
  log('NEXT STEPS');
  log('='.repeat(60));
  log(`1. Review the migration report above.`);
  if (!DRY_RUN) {
    log(`2. Update your .env file:`);
    log(`   STUDY_LIBRARY_PATH=${DEST_ROOT}`);
    log(`3. Restart Study Parlor to use the new library.`);
  } else {
    log(`2. Run without --dry-run to perform the actual migration:`);
    log(`   node scripts/migrate-library.js`);
  }
  log('='.repeat(60));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  log('='.repeat(60));
  log('Study Parlor — Library Migration');
  log('='.repeat(60));
  log(`Source root:  ${SRC_ROOT}`);
  log(`Dest root:    ${DEST_ROOT}`);
  log(`Dry run:      ${DRY_RUN ? 'YES' : 'NO'}`);
  log('='.repeat(60));

  if (!validateSources()) {
    process.exit(1);
  }

  if (!validateDest()) {
    process.exit(1);
  }

  const report = runMigration();
  printReport(report);

  if (report.missing.length > 0) {
    process.exit(2);
  }
}

main();
