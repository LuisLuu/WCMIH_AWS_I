import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (/\.(js|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('1. Checking syntax across all server JS/MJS files...');
const allFiles = collectJsFiles(serverRoot);
for (const file of allFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`✅ Syntax check passed (${allFiles.length} files)\n`);

console.log('2. Verifying ESM module imports...');
process.env.JWT_SECRET ||= 'ci-dummy-jwt-secret';
process.env.CLIENT_URL ||= 'http://localhost:5174';
process.env.LOCAL_KMS_KEY ||= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DATABASE_URL ||= 'postgresql://postgres:mysecretpassword@localhost:5432/project_v';

const modulesToVerify = [
  '../src/api/middlewares/auth.js',
  '../src/api/routes/auth.js',
  '../src/api/routes/actions.js',
  '../src/api/routes/keyRing.js',
  '../src/api/routes/stream.js',
  '../src/api/routes/telemetry.js',
  '../src/agents/supervisor.js',
  '../src/agents/graph.js',
  '../src/streaming/streamService.js',
];

for (const mod of modulesToVerify) {
  await import(mod);
}
console.log(`✅ ESM import verification passed (${modulesToVerify.length} modules)\n`);

console.log('3. Running standalone unit tests...');
const unitTests = [
  'test-wcm29.cjs',
  'test-wcm31-stream.mjs',
  'test-wcm35-graph.mjs',
  'test-wcm35-runtime.mjs',
  'test-wcm36-delegation.mjs',
  'test-wcm36-supervisor.mjs',
];

for (const testFile of unitTests) {
  const testPath = path.join(__dirname, testFile);
  if (!fs.existsSync(testPath)) continue;
  console.log(`▶ Running ${testFile}...`);
  execFileSync(process.execPath, [testPath], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

console.log('\n🎉 All syntax, ESM import, and unit tests passed!');
