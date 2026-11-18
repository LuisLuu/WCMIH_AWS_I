
import { pool } from "../config/db.js";

// Local MVP: only this explicitly trusted mock model
// can pass the $0 cost policy.
const ZERO_COST_MODELS = new Set([
  "mock:mock-model"
]);

const MAX_TOKENS = 2147483647;

function validTokens(value) {
  return Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_TOKENS;
}

/**
 * Reserve tokens before a model call.
 * Locks the user row to prevent concurrent
 * requests from exceeding their daily quota.
 */
export async function reserveQuota({
  userId,
  provider,
  modelName,
  estimatedTokens
}) {
  if (
    typeof userId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    typeof provider !== "string" ||
    typeof modelName !== "string" ||
    modelName.length > 100 ||
    !validTokens(estimatedTokens)
  ) {
    throw new Error("INVALID_QUOTA_REQUEST");
  }

  // Fail closed: paid or unknown models are blocked.
  if (!ZERO_COST_MODELS.has(`${provider}:${modelName}`)) {
    return {
      allowed: false,
      reason: "ZERO_DOLLAR_POLICY"
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT daily_token_limit
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        reason: "USER_NOT_FOUND"
      };
    }

    const limit = userResult.rows[0].daily_token_limit;

    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error("INVALID_DAILY_LIMIT");
    }

    const usageResult = await client.query(
      `SELECT
         COALESCE(SUM(total_tokens_used), 0)::text
         AS used
       FROM user_daily_token_usage
       WHERE user_id = $1
         AND usage_date =
           (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`,
      [userId]
    );

    const used = Number(usageResult.rows[0].used);
    const remaining = limit - used;

    if (!Number.isSafeInteger(used) || used < 0) {
      throw new Error("INVALID_USAGE");
    }

    if (estimatedTokens > remaining) {
      await client.query("ROLLBACK");

      return {
        allowed: false,
        reason: "DAILY_QUOTA_EXCEEDED",
        remainingTokens: Math.max(0, remaining)
      };
    }

    await client.query(
      `INSERT INTO user_daily_token_usage
         (user_id, model_name, usage_date,
          total_tokens_used)
       VALUES (
         $1, $2,
         (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
         $3
       )
       ON CONFLICT (user_id, model_name, usage_date)
       DO UPDATE SET
         total_tokens_used =
           user_daily_token_usage.total_tokens_used
           + EXCLUDED.total_tokens_used`,
      [userId, modelName, estimatedTokens]
    );

    await client.query("COMMIT");

    return {
      allowed: true,
      reservedTokens: estimatedTokens,
      remainingTokens: remaining - estimatedTokens
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Release unused reserved tokens.
 *
 * For a failed request, release all reserved tokens.
 * For a successful request, release the difference
 * between reserved and actual usage.
 */
export async function releaseQuota({
  userId,
  modelName,
  tokens
}) {
  if (
    typeof userId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    typeof modelName !== "string" ||
    !modelName ||
    modelName.length > 100 ||
    !Number.isSafeInteger(tokens) ||
    tokens < 0
  ) {
    throw new Error("INVALID_RELEASE_REQUEST");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE user_daily_token_usage
       SET total_tokens_used =
         total_tokens_used - $3
       WHERE user_id = $1
         AND model_name = $2
         AND usage_date =
           (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
         AND total_tokens_used >= $3
       RETURNING total_tokens_used`,
      [userId, modelName, tokens]
    );

    if (result.rowCount !== 1) {
      throw new Error("QUOTA_RELEASE_FAILED");
    }

    await client.query("COMMIT");

    return {
      released: true,
      remainingReservedTokens:
        result.rows[0].total_tokens_used
    };

  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
