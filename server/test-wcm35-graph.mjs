
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Command } from "@langchain/langgraph";
import { graph } from "./src/agents/graph.js";

let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

try {
  // Test DIRECT routing
  const directConfig = {
    configurable: { thread_id: randomUUID() }
  };

  const direct = await graph.invoke({
    taskId: randomUUID(),
    prompt: "Hello Project V"
  }, directConfig);

  check(
    "Direct task completes",
    direct.status === "completed"
  );

  check(
    "Specialist produces output",
    direct.output.includes("Hello Project V")
  );

  const savedDirect = await graph.getState(directConfig);

  check(
    "Graph state checkpoint exists",
    savedDirect.values.status === "completed"
  );

  // Test ESCALATE routing
  const approvalConfig = {
    configurable: { thread_id: randomUUID() }
  };

  await graph.invoke({
    taskId: randomUUID(),
    prompt: "Please configure AWS infrastructure"
  }, approvalConfig);

  const paused = await graph.getState(approvalConfig);

  check(
    "Approval gate interrupts execution",
    paused.tasks.some(
      task => (task.interrupts?.length ?? 0) > 0
    )
  );

  const resumed = await graph.invoke(
    new Command({
      resume: { decision: "APPROVE" }
    }),
    approvalConfig
  );

  check(
    "Approved workflow resumes",
    resumed.status === "completed"
  );

  // Test rejection
  const rejectConfig = {
    configurable: { thread_id: randomUUID() }
  };

  await graph.invoke({
    taskId: randomUUID(),
    prompt: "Deploy AWS production resources"
  }, rejectConfig);

  const rejected = await graph.invoke(
    new Command({
      resume: { decision: "REJECT" }
    }),
    rejectConfig
  );

  check(
    "Rejected workflow stops",
    rejected.status === "rejected" &&
    !rejected.output
  );

  console.log(
    `SUCCESS: ${passed}/6 WCM-35 tests passed`
  );
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
