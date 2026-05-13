#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  SmartTransfer — Deploy Package Builder
//  Usage: node pack.js
//
//  Creates a clean .tar.gz archive ready to upload to server.
//  Excludes: node_modules, .next, .git, build artifacts, etc.
// ══════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'smarttransfer-deploy.tar.gz');

// Files/dirs to exclude
const excludes = [
  'node_modules',
  '.next',
  '.expo',
  '.git',
  '.git_backup_backend',
  '.git_backup_frontend',
  '.git_backup_driver',
  '.vercel',
  'dist',
  'android',            // Mobile native builds (not needed on server)
  'driver-app',         // Mobile app (not deployed to server)
  'partner-app',        // Mobile app (not deployed to server)
  'id-scanner-service', // Not needed for main deploy
  '*.tar.gz',
  '*.apk',
  '*.log',
  '*.txt',
  'build_output*.txt',
  'gradle_build*.log',
  'tsc_output.txt',
  'tsc_page.txt',
  'tsconfig.tsbuildinfo',
  // Backend scratch/debug files
  'backend/scratch',
  'backend/db-export',
  'backend/*.log',
  'backend/*.txt',
  'backend/tmp-*',
  'backend/test-*',
  'backend/test_*',
  'backend/check_*',
  'backend/check-*',
  'backend/debug-*',
  'backend/debug_*',
  'backend/fix-*',
  'backend/fix_*',
  'backend/dump-*',
  'backend/rail*.log',
  'backend/railway*.log',
  'backend/*.backup.js',
  'backend/sync_to_railway*',
  'backend/rebuild_*',
  'backend/restore_*',
  'backend/sanitize_*',
  'backend/reproduce_*',
  'backend/inject_*',
  'backend/seed_*',
  'backend/create_pool_data*',
  'backend/db_backup*',
  'backend/booking_dump*',
  'backend/messages.json',
  // Frontend debug/test files
  'frontend/test-*',
  'frontend/test_*',
  'frontend/*.log',
  'frontend/*.txt',
  'frontend/fix-*',
  'frontend/url*.txt',
  // Other
  'diff.txt',
  'fix_shuttle_jsx.py',
  'n8n-workflow-template.json',
  'ngrok*',
  'test-side.json',
  '.antigravityignore',
].map(e => `--exclude="${e}"`).join(' ');

// Use tar to create archive
console.log('📦 SmartTransfer deploy paketi oluşturuluyor...\n');

// Files to include
const includes = [
  'backend',
  'frontend',
  'setup.js',
  'setup.config.json',
  'DEPLOY.md',
];

// Check which exist
const existing = includes.filter(f => fs.existsSync(path.join(ROOT, f)));

try {
  // Use PowerShell Compress-Archive as fallback if tar is not available
  const tarCmd = `tar czf "${OUTPUT}" ${excludes} ${existing.join(' ')}`;
  execSync(tarCmd, { cwd: ROOT, stdio: 'pipe' });
  
  const size = fs.statSync(OUTPUT).size;
  const sizeMB = (size / 1024 / 1024).toFixed(1);
  
  console.log(`✅ Paket oluşturuldu!`);
  console.log(`   📁 ${OUTPUT}`);
  console.log(`   📊 Boyut: ${sizeMB} MB`);
  console.log(`\n📤 Bu dosyayı aaPanel File Manager ile sunucuya yükleyin.`);
} catch (e) {
  console.error('❌ tar komutu başarısız:', e.message);
  console.log('\nAlternatif: 7-Zip ile manuel olarak paketleyebilirsiniz.');
}
