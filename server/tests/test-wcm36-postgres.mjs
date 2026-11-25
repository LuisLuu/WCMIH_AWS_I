
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url) });

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";

import { createProjectGraph } from "../src/agents/graph.js";
import {
  createPostgresCheckpointer
} from "../src/agents/postgresCheckpointer.js";

let passed = 0;
let checkpointer;

function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  console.log(`PASS ${++passed}: ${name}`);
}

function mockRouter(specialist) {
  return async (prompt, taskId) => ({
    taskId,
    mode: "ESCALATE",
    targetModel: "premium",
    specialist,
    steps: ["Review request", "Request approval"]
  });
}

function newConfig() {
  return {
    configurable: {
      thread_id: randomUUID()
    }
  };
}

try {
  checkpointer = await createPostgresCheckpointer();

  const graph = createProjectGraph(checkpointer, {
    router: mockRouter("coding")
  });

  const thread = newConfig();

  await graph.invoke({
    taskId: randomUUID(),
    prompt: "Debug JavaScript backend"
  }, thread);

  const paused = await graph.getState(thread);

  check("Coding specialist stored",
    paused.values.specialist, "coding");

  check("Approval gate paused",
    paused.tasks.some(t =>
      (t.interrupts?.length ?? 0) > 0
    ), true);

  // Simulate graph reconstruction using the same database.
  const restoredGraph = createProjectGraph(
    checkpointer,
    { router: mockRouter("coding") }
  );

  const restored = await restoredGraph.getState(thread);

  check("Specialist restored from PostgreSQL",
    restored.values.specialist, "coding");

  await restoredGraph.invoke(
    new Command({
      resume: { decision: "APPROVE" }
    }),
    thread
  );

  const completed = await restoredGraph.getState(thread);

  check("Approved workflow completed",
    completed.values.status, "completed");

  check("Coding specialist preserved",
    completed.values.specialist, "coding");

  const databaseGraph = createProjectGraph(
    checkpointer,
    { router: mockRouter("database") }
  );

  const databaseThread = newConfig();

  await databaseGraph.invoke({
    taskId: randomUUID(),
    prompt: "Optimize PostgreSQL query"
  }, databaseThread);

  const dbPaused = await databaseGraph.getState(
    databaseThread
  );

  check("Database specialist stored",
    dbPaused.values.specialist, "database");

  await databaseGraph.invoke(
    new Command({
      resume: { decision: "REJECT" }
    }),
    databaseThread
  );

  const rejected = await databaseGraph.getState(
    databaseThread
  );

  check("Rejected workflow stopped",
    rejected.values.status, "rejected");

  check("Database specialist preserved",
    rejected.values.specialist, "database");

  console.log(
    `SUCCESS: ${passed}/8 PostgreSQL delegation tests passed`
  );
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  // Release database connections if supported.
  if (checkpointer?.end) {
    await checkpointer.end();
  }
}
