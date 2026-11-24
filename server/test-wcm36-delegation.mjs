
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  MemorySaver,
  Command
} from "@langchain/langgraph";

import {
  createProjectGraph
} from "./src/agents/graph.js";

let passed = 0;

function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  console.log(`PASS ${++passed}: ${name}`);
}

function makeRouter(mode, specialist) {
  return async (prompt, taskId) => ({
    taskId,
    mode,
    targetModel: mode === "ESCALATE"
      ? "premium"
      : "free",
    specialist,
    steps: mode === "ESCALATE"
      ? ["Review task", "Request approval"]
      : []
  });
}

function createTestGraph(mode, specialist) {
  return createProjectGraph(
    new MemorySaver(),
    { router: makeRouter(mode, specialist) }
  );
}

function config() {
  return {
    configurable: { thread_id: randomUUID() }
  };
}

// Test 1-3: Direct route
const direct = createTestGraph("DIRECT", "general");
const directConfig = config();

const directResult = await direct.invoke(
  {
    taskId: randomUUID(),
    prompt: "Explain JavaScript"
  },
  directConfig
);

check("Direct workflow completes",
  directResult.status, "completed");

check("General specialist persisted",
  directResult.specialist, "general");

check("Mock output preserved",
  directResult.output,
  "MOCK SPECIALIST RESULT: Explain JavaScript");

// Test 4-7: Coding workflow
const coding = createTestGraph("ESCALATE", "coding");
const codingConfig = config();

await coding.invoke(
  {
    taskId: randomUUID(),
    prompt: "Debug JavaScript backend"
  },
  codingConfig
);

let codingState = await coding.getState(codingConfig);

check("Coding specialist stored",
  codingState.values.specialist, "coding");

check("Coding workflow paused",
  codingState.tasks.some(
    task => (task.interrupts?.length ?? 0) > 0
  ), true);

await coding.invoke(
  new Command({
    resume: { decision: "APPROVE" }
  }),
  codingConfig
);

codingState = await coding.getState(codingConfig);

check("Approved coding workflow completed",
  codingState.values.status, "completed");

check("Coding specialist survives resume",
  codingState.values.specialist, "coding");

// Test 8-10: Database workflow
const database = createTestGraph(
  "ESCALATE",
  "database"
);
const databaseConfig = config();

await database.invoke(
  {
    taskId: randomUUID(),
    prompt: "Optimize PostgreSQL query"
  },
  databaseConfig
);

let dbState = await database.getState(databaseConfig);

check("Database specialist stored",
  dbState.values.specialist, "database");

await database.invoke(
  new Command({
    resume: { decision: "REJECT" }
  }),
  databaseConfig
);

dbState = await database.getState(databaseConfig);

check("Rejected workflow stops",
  dbState.values.status, "rejected");

check("Database selection preserved",
  dbState.values.specialist, "database");

console.log(
  `SUCCESS: ${passed}/10 WCM-36 delegation tests passed`
);
