
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "./src/config/db.js";
import { executeGuardedMock } from "./src/services/modelExecutionGuard.js";

const userId = randomUUID();
let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

async function getUsage() {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(total_tokens_used),0)::int AS used
     FROM user_daily_token_usage
     WHERE user_id=$1
       AND usage_date=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`,
    [userId]
  );
  return rows[0].used;
}

const mockExecute = async (prompt) => ({
  output: `MOCK RESPONSE: ${prompt}`,
  usage: {
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200
  }
});

try {
  await pool.query(
    `INSERT INTO users (id,email,daily_token_limit)
     VALUES ($1,$2,1000)`,
    [userId, `wcm30-exec-${userId}@example.invalid`]
  );

  const result = await executeGuardedMock({
    userId,
    prompt: "Hello Project V",
    estimatedTokens: 500,
    execute: mockExecute
  });

  check("Mock execution completed",
    result.status === "completed");

  check("Correct mock output",
    result.output === "MOCK RESPONSE: Hello Project V");

  check("Correct actual token usage",
    result.usage.totalTokens === 200);

  check("Unused quota released",
    await getUsage() === 200);

  const { rows } = await pool.query(
    `SELECT provider,model_name,prompt_tokens,
            completion_tokens,total_tokens
     FROM telemetry_logs
     WHERE user_id=$1 AND id=$2`,
    [userId, result.telemetryId]
  );

  check("Telemetry persisted",
    rows.length === 1 &&
    rows[0].provider === "mock" &&
    rows[0].model_name === "mock-model" &&
    rows[0].prompt_tokens === 120 &&
    rows[0].completion_tokens === 80 &&
    rows[0].total_tokens === 200
  );

  const blocked = await executeGuardedMock({
    userId,
    prompt: "Request exceeding quota",
    estimatedTokens: 900,
    execute: mockExecute
  });

  check("Over-limit execution blocked",
    blocked.status === "blocked" &&
    blocked.reason === "DAILY_QUOTA_EXCEEDED");

  check("Blocked request did not consume tokens",
    await getUsage() === 200);

  console.log(`SUCCESS: ${passed}/7 tests passed`);

} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  try {
    await pool.query(
      "DELETE FROM users WHERE id=$1",
      [userId]
    );
    console.log("Demo user cleaned up");
  } catch (error) {
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  }
  await pool.end();
}
