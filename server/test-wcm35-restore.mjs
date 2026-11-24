
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createProjectGraph } from "./src/agents/graph.js";
import { createPostgresCheckpointer } from "./src/agents/postgresCheckpointer.js";

config({ path: new URL("./.env", import.meta.url) });

const threadId = process.argv[2];

if (!threadId) {
  console.error("Usage: node test-wcm35-restore.mjs <thread_id>");
  process.exit(1);
}

let checkpointer;

try {
  checkpointer = await createPostgresCheckpointer();
  const graph = createProjectGraph(checkpointer);

  const snapshot = await graph.getState({
    configurable: { thread_id: threadId }
  });

  assert.equal(snapshot.values.status, "completed");

  console.log("PASS: Checkpoint restored after Node.js restart");
  console.log("Thread ID:", threadId);
  console.log("Status:", snapshot.values.status);
  console.log("SUCCESS: PostgreSQL restart persistence verified");
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
} finally {
  await checkpointer?.end();
}
