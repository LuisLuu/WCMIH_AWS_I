const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { encryptSecret } = require('../services/kms');

async function main() {
  const ciphertext = await encryptSecret('dummy-openai-api-key-not-a-real-secret');
  console.log('Dummy value encrypted successfully. Base64 ciphertext:');
  console.log(ciphertext);
}

main().catch((error) => {
  console.error(`KMS demo failed: ${error.message}`);
  process.exitCode = 1;
});
