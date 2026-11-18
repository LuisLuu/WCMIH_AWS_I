const { EncryptCommand, KMSClient } = require('@aws-sdk/client-kms');

const kmsClient = new KMSClient({});

async function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TypeError('plaintext must be a non-empty string');
  }

  const keyId = process.env.KMS_KEY_ID;
  if (!keyId || keyId.startsWith('replace-with-')) {
    throw new Error('Set KMS_KEY_ID to an existing AWS KMS key before encrypting');
  }

  const result = await kmsClient.send(new EncryptCommand({
    KeyId: keyId,
    Plaintext: Buffer.from(plaintext, 'utf8'),
  }));

  if (!result.CiphertextBlob) {
    throw new Error('AWS KMS returned no ciphertext');
  }

  return Buffer.from(result.CiphertextBlob).toString('base64');
}

module.exports = { encryptSecret };