
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../src/config/db.js";
import { getDecryptedApiKey } from "../src/services/keyRingService.js";

const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
const userA = randomUUID();
const userB = randomUUID();
const dummyKey = `sk-dummy-${randomUUID()}`;
let passed = 0;

function tokenFor(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: "project-v",
      audience: "project-v-api",
      expiresIn: "10m"
    }
  );
}

async function request(method, path, token, body) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

try {
  console.log("=== WCM-29 Integration Tests ===");

  // Create two isolated demo users
  await pool.query(
    "INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)",
    [
      userA,
      `wcm29-${userA}@example.invalid`,
      userB,
      `wcm29-${userB}@example.invalid`
    ]
  );

  const tokenA = tokenFor(userA);
  const tokenB = tokenFor(userB);

  // 1. Missing authentication
  const noAuth = await request("GET", "/api/keys");
  check("Missing JWT rejected", noAuth.status === 401);

  // 2. Save dummy API key
  const saved = await request(
    "PUT",
    "/api/keys/openai",
    tokenA,
    { apiKey: dummyKey }
  );

  check(
    "PUT saves encrypted key",
    saved.status === 200 && saved.body.success === true
  );

  // 3. Inspect the database
  const dbResult = await pool.query(
    "SELECT kms_encrypted_keys FROM users WHERE id = $1",
    [userA]
  );

  const stored = dbResult.rows[0].kms_encrypted_keys;
  const payload = stored.openai;

  check(
    "PostgreSQL stores encrypted payload",
    Boolean(
      payload &&
      payload.iv &&
      payload.data &&
      payload.tag &&
      payload.version === 1
    )
  );

  check(
    "Plaintext is not stored",
    !JSON.stringify(stored).includes(dummyKey)
  );

  // 4. Verify internal decryption
  const decrypted = await getDecryptedApiKey(
    userA,
    "openai"
  );

  check(
    "Backend decrypts correct key",
    decrypted === dummyKey
  );

  // 5. List provider metadata
  const listA = await request(
    "GET",
    "/api/keys",
    tokenA
  );

  check(
    "GET lists provider only",
    listA.status === 200 &&
    Array.isArray(listA.body.providers) &&
    listA.body.providers.includes("openai") &&
    !JSON.stringify(listA.body).includes(dummyKey)
  );

  // 6. Other user cannot list A's keys
  const listB = await request(
    "GET",
    "/api/keys",
    tokenB
  );

  check(
    "User B cannot see User A's key",
    listB.status === 200 &&
    Array.isArray(listB.body.providers) &&
    listB.body.providers.length === 0
  );

  // 7. Other user cannot decrypt A's key
  let isolationPassed = false;

  try {
    await getDecryptedApiKey(userB, "openai");
    const otherKey = await getDecryptedApiKey(
      userB,
      "openai"
    );
    isolationPassed = otherKey === null;
  } catch {
    isolationPassed = true;
  }

  check("User isolation", isolationPassed);

  // 8. Delete key
  const deleted = await request(
    "DELETE",
    "/api/keys/openai",
    tokenA
  );

  check(
    "DELETE removes key",
    deleted.status === 200 &&
    deleted.body.success === true
  );

  // 9. Verify deletion in database
  const afterDelete = await pool.query(
    "SELECT kms_encrypted_keys FROM users WHERE id = $1",
    [userA]
  );

  check(
    "Key removed from PostgreSQL",
    !afterDelete.rows[0].kms_encrypted_keys?.openai
  );

  // 10. Verify GET after deletion
  const finalList = await request(
    "GET",
    "/api/keys",
    tokenA
  );

  check(
    "GET empty after DELETE",
    finalList.status === 200 &&
    finalList.body.providers.length === 0
  );

  console.log(`\nSUCCESS: ${passed}/10 tests passed`);
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  // Remove only the two temporary test users
  try {
    await pool.query(
      "DELETE FROM users WHERE id IN ($1, $2)",
      [userA, userB]
    );
    console.log("Test users cleaned up");
  } catch {
    console.error("WARNING: Demo user cleanup failed");
    process.exitCode = 1;
  }

  await pool.end();
}
