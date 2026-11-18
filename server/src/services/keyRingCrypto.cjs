
const crypto = require("node:crypto");

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

function getMasterKey() {
  const value = process.env.LOCAL_KMS_KEY;

  if (!value || value.length < 32) {
    throw new Error("Invalid LOCAL_KMS_KEY");
  }

  // Standard 32-byte key encoded as hexadecimal
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  // Local development fallback
  if (process.env.NODE_ENV === "production") {
    throw new Error("Production requires a 64-character hex key");
  }

  return crypto.scryptSync(
    value,
    "project-v-local-keyring-v1",
    32
  );
}

function getContext(userId, provider) {
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    typeof provider !== "string" ||
    !provider.trim()
  ) {
    throw new Error("Invalid user or provider");
  }

  return Buffer.from(
    JSON.stringify([userId, provider]),
    "utf8"
  );
}


// Encrypt a user's API key
function encryptApiKey(apiKey, userId, provider) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Invalid API key");
  }

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    getMasterKey(),
    iv
  );

  cipher.setAAD(getContext(userId, provider));

  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final()
  ]);

  return {
    version: VERSION,
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

// Decrypt only with the matching user/provider
function decryptApiKey(payload, userId, provider) {
  if (!payload || payload.version !== VERSION) {
    throw new Error("Unsupported encrypted payload");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getMasterKey(),
    Buffer.from(payload.iv, "base64")
  );

  decipher.setAAD(getContext(userId, provider));

  decipher.setAuthTag(
    Buffer.from(payload.tag, "base64")
  );

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(payload.data, "base64")
    ),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptApiKey,
  decryptApiKey
};
