
import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";
import { getGraphRuntime, getGraph } from "../src/agents/graphRuntime.js";

config({ path: new URL("../.env", import.meta.url) });

let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
};

let runtime;

try {
  runtime = await getGraphRuntime();
  const graph = await getGraph();

  check("PostgreSQL runtime initialized",
    graph === runtime.graph);

  // Separate thread for approval workflow
  const config = {
    configurable: { thread_id: randomUUID() }
  };

  await graph.invoke({
    taskId: randomUUID(),
    prompt: "Deploy AWS infrastructure"
  }, config);

  const paused = await graph.getState(config);

  check("Workflow paused at approval gate",
    paused.tasks.some(t => (t.interrupts?.length ?? 0) > 0));

  // Resume via the real LangGraph mechanism
  const resumed = await graph.invoke(
    new Command({
      resume: { decision: "APPROVE" }
    }),
    config
  );

  check("Workflow resumed",
    resumed.status === "completed");

  const saved = await graph.getState(config);

  check("Completed state persisted",
    saved.values.status === "completed");

  console.log(`SUCCESS: ${passed}/4 runtime tests passed`);
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  await runtime?.checkpointer.end();
}
