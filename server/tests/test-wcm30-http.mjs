
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../src/config/db.js";

const userId = randomUUID();
const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

const token = jwt.sign(
  { sub: userId },
  process.env.JWT_SECRET,
  {
    algorithm: "HS256",
    issuer: "project-v",
    audience: "project-v-api",
    expiresIn: "10m"
  }
);

async function callApi(prompt, authorization = token) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (authorization) {
    headers.Authorization = `Bearer ${authorization}`;
  }

  const response = await fetch(
    `${baseUrl}/api/wcm30/mock`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt })
    }
  );

  return {
    status: response.status,
    body: await response.json()
  };
}

try {
  await pool.query(
    `INSERT INTO users
       (id, email, daily_token_limit)
     VALUES ($1, $2, 600)`,
    [userId, `wcm30-http-${userId}@example.invalid`]
  );

  const unauthorized = await callApi("hello", null);

  check(
    "JWT protection",
    unauthorized.status === 401
  );

  const invalid = await callApi("");

  check(
    "Invalid prompt rejected",
    invalid.status === 400
  );

  const success = await callApi("Hello Project V");

  check(
    "Mock API execution",
    success.status === 200 &&
    success.body.status === "completed" &&
    success.body.usage.totalTokens === 200
  );

  const telemetry = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM telemetry_logs
     WHERE user_id = $1 AND total_tokens = 200`,
    [userId]
  );

  check(
    "Telemetry stored in PostgreSQL",
    telemetry.rows[0].total === 1
  );

  const quota = await pool.query(
    `SELECT COALESCE(SUM(total_tokens_used),0)::int AS used
     FROM user_daily_token_usage
     WHERE user_id = $1`,
    [userId]
  );

  check(
    "Quota settled to actual usage",
    quota.rows[0].used === 200
  );

  // 400 tokens remain, but the API reserves 500.
  const blocked = await callApi("Second request");

  check(
    "Second request blocked by quota",
    blocked.status === 429 &&
    blocked.body.reason === "DAILY_QUOTA_EXCEEDED"
  );

  const finalQuota = await pool.query(
    `SELECT COALESCE(SUM(total_tokens_used),0)::int AS used
     FROM user_daily_token_usage
     WHERE user_id = $1`,
    [userId]
  );

  check(
    "Blocked request consumes no extra quota",
    finalQuota.rows[0].used === 200
  );

  console.log(`SUCCESS: ${passed}/7 HTTP tests passed`);

} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  try {
    await pool.query(
      "DELETE FROM users WHERE id = $1",
      [userId]
    );
    console.log("Demo user cleaned up");
  } catch (error) {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  }

  await pool.end();
}
