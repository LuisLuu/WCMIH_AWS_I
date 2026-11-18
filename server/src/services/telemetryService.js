
import { pool } from "../config/db.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredText(value, field, maxLength) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength
  ) {
    throw new Error(`Invalid ${field}`);
  }

  return value.trim();
}

function tokenCount(value, field) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2147483647
  ) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

/**
 * WCM-30: Record actual AI model usage.
 *
 * No API keys, prompts or model responses
 * should be stored in telemetry.
 */
export async function logModelUsage(data, db = pool) {
  const {
    userId,
    sessionId = null,
    provider,
    agentId,
    modelName,
    promptTokens,
    completionTokens,
    latencyMs = null
  } = data;

  if (
    typeof userId !== "string" ||
    !UUID_PATTERN.test(userId)
  ) {
    throw new Error("Invalid userId");
  }

  if (
    sessionId !== null &&
    (typeof sessionId !== "string" ||
      !UUID_PATTERN.test(sessionId))
  ) {
    throw new Error("Invalid sessionId");
  }

  const safeProvider = requiredText(
    provider, "provider", 50
  );

  const safeAgentId = requiredText(
    agentId, "agentId", 50
  );

  const safeModelName = requiredText(
    modelName, "modelName", 100
  );

  const input = tokenCount(
    promptTokens, "promptTokens"
  );

  const output = tokenCount(
    completionTokens, "completionTokens"
  );

  const total = input + output;

  if (total > 2147483647) {
    throw new Error("Token total exceeds limit");
  }

  if (
    latencyMs !== null &&
    (!Number.isSafeInteger(latencyMs) ||
      latencyMs < 0 ||
      latencyMs > 2147483647)
  ) {
    throw new Error("Invalid latencyMs");
  }

  const result = await db.query(
    `INSERT INTO telemetry_logs (
      user_id,
      session_id,
      provider,
      agent_id,
      model_name,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      latency_ms
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9
    )
    RETURNING id, user_id, provider,
      model_name, total_tokens, created_at`,
    [
      userId,
      sessionId,
      safeProvider,
      safeAgentId,
      safeModelName,
      input,
      output,
      total,
      latencyMs
    ]
  );

  return result.rows[0];
}
