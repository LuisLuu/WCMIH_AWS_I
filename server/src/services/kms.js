
const crypto = require("node:crypto");

function getKey() {
  const key = process.env.LOCAL_KMS_KEY;

  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("Invalid LOCAL_KMS_KEY");
  }

  return Buffer.from(key, "hex");
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    getKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ]);

  return {
    iv: iv.toString("base64"),
    data: encrypted.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(payload.iv, "base64")
  );

  decipher.setAuthTag(
    Buffer.from(payload.tag, "base64")
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(payload.data, "base64")
    ),
    decipher.final()
  ]).toString("utf8");
}

module.exports = { encrypt, decrypt };
