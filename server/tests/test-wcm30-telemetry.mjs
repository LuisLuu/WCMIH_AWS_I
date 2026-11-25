import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";
import { logModelUsage } from "../src/services/telemetryService.js";

const userId = randomUUID();
const client = await pool.connect();

let passed = 0;

function check(description, condition) {
  assert.ok(condition, description);
  passed++;
  console.log(`PASS ${passed}: ${description}`);
}

try {
  await client.query("BEGIN");

  // Temporary user inside a rollback transaction
  await client.query(
    `INSERT INTO users (id, email)
     VALUES ($1, $2)`,
    [userId, `wcm30-${userId}@example.invalid`]
  );

  const result = await logModelUsage({
    userId,
    provider: "mock",
    agentId: "test-agent",
    modelName: "mock-model",
    promptTokens: 500,
    completionTokens: 200,
    latencyMs: 350
  }, client);

  check(
    "Telemetry inserted",
    Boolean(result.id)
  );

  check(
    "Correct user",
    result.user_id === userId
  );

  check(
    "Correct model",
    result.model_name === "mock-model"
  );

  check(
    "Correct total tokens",
    result.total_tokens === 700
  );

  
const stored = await client.query(
  `SELECT prompt_tokens, completion_tokens,
          total_tokens, latency_ms
   FROM telemetry_logs
   WHERE id = $1 AND user_id = $2`,
  [result.id, userId]
);

console.log("Database verification:", {
  rowsFound: stored.rowCount,
  usage: stored.rows[0] || null
});


  check(
    "Database stores accurate usage",
    stored.rowCount === 1 &&
    stored.rows[0].prompt_tokens === 500 &&
    stored.rows[0].completion_tokens === 200 &&
    stored.rows[0].total_tokens === 700 &&
    stored.rows[0].latency_ms === 350
  );

  console.log(`SUCCESS: ${passed}/5 tests passed`);

} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  // Undo the temporary user and telemetry record
  try {
    await client.query("ROLLBACK");
    console.log("Test transaction rolled back");
  } catch (error) {
    console.error("Rollback failed:", error.message);
    process.exitCode = 1;
  }

  client.release();
  await pool.end();
}
