import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import vaultRouter from './src/api/routes/vault.js';
import verifyToken from './src/api/middlewares/auth.js';
import { chunkDocumentText, extractTextFromBuffer } from './src/db/vector/ingestionPipeline.js';

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

console.log('🧪 Testing Vault HTTP API Endpoints (/api/vault/upload, /documents, /documents/:id)...\n');

const testUserId = randomUUID();
const secret = process.env.JWT_SECRET || 'local-dev-jwt-secret-key-change-in-prod';
const token = jwt.sign(
  { sub: testUserId },
  secret,
  { algorithm: 'HS256', issuer: 'project-v', audience: 'project-v-api', expiresIn: '15m' }
);

// Spin up a test express instance with mocked db pool to test HTTP contracts without needing live postgres
const app = express();
app.use(express.json());
app.use('/api/vault', verifyToken, vaultRouter);

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // Test 1: Upload without token => 401
  const resNoAuth = await fetch(`${baseUrl}/api/vault/documents`);
  check('GET /api/vault/documents requires JWT auth (401)', resNoAuth.status === 401);

  // Test 2: Upload invalid file type (.exe)
  const formBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const badBody = [
    `--${formBoundary}`,
    'Content-Disposition: form-data; name="file"; filename="malware.exe"',
    'Content-Type: application/octet-stream',
    '',
    'MZ binary content',
    `--${formBoundary}--`
  ].join('\r\n');

  const resBadType = await fetch(`${baseUrl}/api/vault/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formBoundary}`
    },
    body: badBody
  });
  check('POST /api/vault/upload rejects unsupported file extension (400)', resBadType.status === 400);

  // Test 3: Upload with no file field
  const emptyBody = [
    `--${formBoundary}`,
    'Content-Disposition: form-data; name="other_field"',
    '',
    'some text',
    `--${formBoundary}--`
  ].join('\r\n');

  const resNoFile = await fetch(`${baseUrl}/api/vault/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${formBoundary}`
    },
    body: emptyBody
  });
  check('POST /api/vault/upload rejects missing file field (400)', resNoFile.status === 400);

  console.log(`\n🎉 HTTP Contract Tests: All ${passed}/${passed} tests passed!`);
} finally {
  server.close();
}
