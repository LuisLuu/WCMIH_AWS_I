
require("dotenv").config();

const assert = require("node:assert/strict");

const {
  encryptApiKey,
  decryptApiKey
} = require("./src/services/keyRingCrypto.cjs");

const dummyKey = "sk-dummy-key-not-real";
const userId = "user-001";
const provider = "openai";

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS: ${name}`);
  } catch {
    console.log(`FAIL: ${name}`);
    process.exitCode = 1;
  }
}

const encrypted = encryptApiKey(
  dummyKey,
  userId,
  provider
);

runTest("Encryption", () => {
  assert.notEqual(encrypted.data, dummyKey);
});

runTest("Decryption", () => {
  assert.equal(
    decryptApiKey(encrypted, userId, provider),
    dummyKey
  );
});

runTest("Wrong User Rejected", () => {
  assert.throws(() =>
    decryptApiKey(encrypted, "user-002", provider)
  );
});

runTest("Wrong Provider Rejected", () => {
  assert.throws(() =>
    decryptApiKey(encrypted, userId, "anthropic")
  );
});

runTest("Tampering Rejected", () => {
  const modified = {
    ...encrypted,
    tag: Buffer.alloc(16).toString("base64")
  };

  assert.throws(() =>
    decryptApiKey(modified, userId, provider)
  );
});

runTest("Unique Encryption", () => {
  const second = encryptApiKey(
    dummyKey,
    userId,
    provider
  );

  assert.notDeepEqual(second, encrypted);
});

runTest("Missing API Key Rejected", () => {
  assert.throws(() =>
    encryptApiKey("", userId, provider)
  );
});

console.log("WCM-29 encryption tests completed");
