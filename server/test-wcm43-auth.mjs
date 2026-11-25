import assert from 'node:assert/strict';

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function runTests() {
  console.log('🧪 Running WCM-43 Auth & Demo Login API tests...');

  // 1. Register new user
  const testEmail = `tester_${Date.now()}@wcmih.local`;
  const testPassword = 'TestPassword123!';

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(regRes.status, 201, 'Register should return 201');
  const regData = await regRes.json();
  assert.ok(regData.token, 'Register should return JWT token');
  assert.equal(regData.user.email, testEmail);
  console.log('✅ POST /api/auth/register passed');

  // 2. Duplicate register should fail with 409
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(dupRes.status, 409, 'Duplicate email should return 409');
  console.log('✅ Duplicate email check passed');

  // 3. Login with wrong password -> 401, correct password -> 200
  const badLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'WrongPassword!' }),
  });
  assert.equal(badLogin.status, 401, 'Wrong password should return 401');

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(loginRes.status, 200, 'Login should return 200');
  const loginData = await loginRes.json();
  assert.ok(loginData.token, 'Login should return JWT token');
  console.log('✅ POST /api/auth/login passed');

  // 4. GET /api/auth/me with Bearer token
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  assert.equal(meRes.status, 200, 'GET /api/auth/me should return 200');
  const meData = await meRes.json();
  assert.equal(meData.user.email, testEmail);
  console.log('✅ GET /api/auth/me passed');

  // 5. POST /api/auth/demo-token
  const demoRes = await fetch(`${BASE_URL}/api/auth/demo-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(demoRes.status, 200, 'POST /api/auth/demo-token should return 200 in dev');
  const demoData = await demoRes.json();
  assert.equal(demoData.user.email, 'demo.user@wcmih.local');
  assert.ok(demoData.token, 'Demo login should return valid JWT');

  // Verify demo token works with /api/protected
  const protRes = await fetch(`${BASE_URL}/api/protected`, {
    headers: { Authorization: `Bearer ${demoData.token}` },
  });
  assert.equal(protRes.status, 200, 'Demo token must pass verifyToken middleware');
  console.log('✅ POST /api/auth/demo-token + verifyToken passed');

  console.log('🎉 All WCM-43 Auth API tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
