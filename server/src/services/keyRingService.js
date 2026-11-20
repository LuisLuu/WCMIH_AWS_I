
import { pool } from "../config/db.js";
import keyRingCrypto from "./keyRingCrypto.cjs";

const { encryptApiKey, decryptApiKey } = keyRingCrypto;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;

function validateUserId(userId) {
  if (typeof userId !== "string" ||
      !UUID_PATTERN.test(userId)) {
    throw new Error("INVALID_USER_ID");
  }
}

function normalizeProvider(provider) {
  if (typeof provider !== "string") {
    throw new Error("INVALID_PROVIDER");
  }

  const value = provider.toLowerCase();

  if (!PROVIDER_PATTERN.test(value)) {
    throw new Error("INVALID_PROVIDER");
  }

  return value;
}

// Save an encrypted API key for a user
export async function saveApiKey(userId, provider, apiKey) {
  validateUserId(userId);
  const name = normalizeProvider(provider);

  if (
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    apiKey.length > 8192
  ) {
    throw new Error("INVALID_API_KEY");
  }

  const encrypted = encryptApiKey(
    apiKey,
    userId,
    name
  );

  const result = await pool.query(
    `UPDATE users
     SET kms_encrypted_keys = jsonb_set(
       COALESCE(kms_encrypted_keys, '{}'::jsonb),
       ARRAY[$2]::text[],
       $3::jsonb,
       true
     ),
     updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [userId, name, JSON.stringify(encrypted)]
  );

  return result.rowCount > 0;
}

// List provider names only - never return secret values
export async function listApiKeys(userId) {
  validateUserId(userId);

  const result = await pool.query(
    `SELECT kms_encrypted_keys
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const stored = result.rows[0].kms_encrypted_keys || {};

  return Object.keys(stored).sort();
}

// Delete the encrypted key for one provider
export async function deleteApiKey(userId, provider) {
  validateUserId(userId);
  const name = normalizeProvider(provider);

  const result = await pool.query(
    `UPDATE users
     SET kms_encrypted_keys =
       COALESCE(kms_encrypted_keys, '{}'::jsonb) - $2,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [userId, name]
  );

  return result.rowCount > 0;
}

// Internal backend function only.
// Never expose the decrypted key through a public API.
export async function getDecryptedApiKey(userId, provider) {
  validateUserId(userId);
  const name = normalizeProvider(provider);

  const result = await pool.query(
    `SELECT kms_encrypted_keys -> $2 AS encrypted
     FROM users
     WHERE id = $1`,
    [userId, name]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const encrypted = result.rows[0].encrypted;

  if (!encrypted) {
    return null;
  }

  return decryptApiKey(encrypted, userId, name);
}
