const { execSync } = require('child_process');
try {
  const result = execSync('npm run seed', { encoding: 'utf-8' });
  console.log('SUCCESS:', result);
} catch (e) {
  console.log('FAILED STDOUT:', e.stdout);
  console.error('FAILED STDERR:', e.stderr);
}
