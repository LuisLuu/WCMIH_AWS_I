
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createProjectGraph } from "../src/agents/graph.js";
import { createPostgresCheckpointer } from
  "../src/agents/postgresCheckpointer.js";

async function main() {
  const checkpointer = await createPostgresCheckpointer();
  const graph = createProjectGraph(checkpointer);

  const threadId = randomUUID();
  const config = {
    configurable: { thread_id: threadId }
  };

  const result = await graph.invoke({
    taskId: randomUUID(),
    prompt: "Hello Project V"
  }, config);

  assert.equal(result.status, "completed");
  console.log("PASS 1: PostgreSQL graph execution");

  const saved = await graph.getState(config);

  assert.equal(saved.values.status, "completed");
  console.log("PASS 2: Checkpoint persisted");

  // Simulate creating a new graph instance.
  const restoredGraph = createProjectGraph(checkpointer);
  const restored = await restoredGraph.getState(config);

  assert.equal(restored.values.status, "completed");
  console.log("PASS 3: State restored by new graph");

  console.log("SUCCESS: 3/3 PostgreSQL tests passed");
  console.log("Test thread ID:", threadId);
}

main().then(
  () => { process.exitCode = 0; },
  (error) => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  }
);
