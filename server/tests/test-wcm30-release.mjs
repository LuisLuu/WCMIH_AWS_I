
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";
import {
  reserveQuota,
  releaseQuota
} from "../src/services/quotaGuard.js";

const userId = randomUUID();
let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

async function getUsage() {
  const result = await pool.query(
    `SELECT COALESCE(SUM(total_tokens_used), 0)::int AS used
     FROM user_daily_token_usage
     WHERE user_id = $1
       AND usage_date =
       (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`,
    [userId]
  );
  return result.rows[0].used;
}

try {
  await pool.query(
    `INSERT INTO users (id, email, daily_token_limit)
     VALUES ($1, $2, 1000)`,
    [userId, `wcm30-release-${userId}@example.invalid`]
  );

  const reserved = await reserveQuota({
    userId,
    provider: "mock",
    modelName: "mock-model",
    estimatedTokens: 400
  });

  check(
    "Reserve 400 tokens",
    reserved.allowed === true
  );

  check(
    "Database usage equals 400",
    await getUsage() === 400
  );

  const released = await releaseQuota({
    userId,
    modelName: "mock-model",
    tokens: 150
  });

  check(
    "Release 150 unused tokens",
    released.released === true
  );

  check(
    "Actual quota usage equals 250",
    await getUsage() === 250
  );

  let excessReleaseRejected = false;

  try {
    await releaseQuota({
      userId,
      modelName: "mock-model",
      tokens: 999
    });
  } catch {
    excessReleaseRejected = true;
  }

  check(
    "Excessive release rejected",
    excessReleaseRejected
  );

  const finalRelease = await releaseQuota({
    userId,
    modelName: "mock-model",
    tokens: 250
  });

  check(
    "Release remaining reservation",
    finalRelease.released === true
  );

  check(
    "Database usage returns to zero",
    await getUsage() === 0
  );

  console.log(
    `SUCCESS: ${passed}/7 tests passed`
  );

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
