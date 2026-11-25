import { getModelAdapter } from '../src/config/models.js';

async function run() {
  console.log("Starting failover test...");
  const start = Date.now();
  const model = getModelAdapter();

  try {
    const res = await model.invoke("Say the word 'Testing'");
    console.log(`Response received in ${(Date.now() - start) / 1000}s`);
    console.log("Output:", res.content);
  } catch (e) {
    console.error("Test failed entirely:", e.message);
  }
}
run();