const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-that-is-never-used-outside-tests';
process.env.FRONTEND_ORIGIN = 'http://localhost:3000';

const { app, authenticateToken } = require('../src/app');
const { encryptSecret } = require('../src/services/kms');

const server = app.listen(0);
const baseUrl = new Promise((resolve) => {
  server.once('listening', () => {
    resolve(`http://127.0.0.1:${server.address().port}`);
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('health endpoint responds with status and allows the configured frontend origin', async () => {
  const response = await fetch(`${await baseUrl}/api/health`, {
    headers: { Origin: 'http://localhost:3000' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('requests from other origins are rejected', async () => {
  const response = await fetch(`${await baseUrl}/api/health`, {
    headers: { Origin: 'https://not-allowed.example' },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origin not allowed' });
});

test('JWT middleware accepts a valid HS256 bearer token', () => {
  const token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const req = { get: () => `Bearer ${token}` };
  const res = {
    statusCode: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  authenticateToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.sub, 'test-user');
});

test('JWT middleware rejects a missing bearer token', () => {
  const req = { get: () => undefined };
  const res = {
    statusCode: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  authenticateToken(req, res, () => {
    assert.fail('next must not be called for a missing token');
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Bearer token required' });
});

test('KMS encryption refuses to run without an AWS KMS key ID', async () => {
  delete process.env.KMS_KEY_ID;
  await assert.rejects(encryptSecret('dummy-value'), /KMS_KEY_ID/);
});
