
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "./src/config/db.js";
import { reserveQuota } from "./src/services/quotaGuard.js";

const userId = randomUUID();
const email = `wcm30-${userId}@example.invalid`;
let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

try {
  // Create an isolated demo user with 1000 daily tokens
  await pool.query(
    `INSERT INTO users
       (id, email, daily_token_limit)
     VALUES ($1, $2, $3)`,
    [userId, email, 1000]
  );

  const first = await reserveQuota({
    userId,
    provider: "mock",
    modelName: "mock-model",
    estimatedTokens: 400
  });

  check(
    "Allowed request under limit",
    first.allowed === true &&
    first.remainingTokens === 600
  );

  const second = await reserveQuota({
    userId,
    provider: "mock",
    modelName: "mock-model",
    estimatedTokens: 700
  });

  check(
    "Over-limit request rejected",
    second.allowed === false &&
    second.reason === "DAILY_QUOTA_EXCEEDED"
  );

  const paid = await reserveQuota({
    userId,
    provider: "openai",
    modelName: "paid-model",
    estimatedTokens: 100
  });

  check(
    "Paid model blocked by zero-dollar policy",
    paid.allowed === false &&
    paid.reason === "ZERO_DOLLAR_POLICY"
  );

  // Concurrent requests: only one should fit
  const parallel = await Promise.all([
    reserveQuota({
      userId,
      provider: "mock",
      modelName: "mock-model",
      estimatedTokens: 400
    }),
    reserveQuota({
      userId,
      provider: "mock",
      modelName: "mock-model",
      estimatedTokens: 400
    })
  ]);

  check(
    "Concurrent quota requests are safe",
    parallel.filter(r => r.allowed).length === 1
  );

  const usage = await pool.query(
    `SELECT total_tokens_used
     FROM user_daily_token_usage
     WHERE user_id = $1 AND model_name = $2
       AND usage_date =
       (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`,
    [userId, "mock-model"]
  );

  check(
    "Database stores correct reserved tokens",
    usage.rowCount === 1 &&
    usage.rows[0].total_tokens_used === 800
  );

  console.log(`SUCCESS: ${passed}/5 tests passed`);

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
