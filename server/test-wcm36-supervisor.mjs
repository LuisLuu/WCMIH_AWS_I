
import "dotenv/config";
import assert from "node:assert/strict";

import {
  routeIntent
} from "./src/agents/supervisor.js";

let passed = 0;

async function test(name, fn) {
  await fn();
  console.log(`PASS ${++passed}: ${name}`);
}

function mockModel(response) {
  return {
    withStructuredOutput() {
      return {
        async invoke() {
          if (response instanceof Error) {
            throw response;
          }
          return response;
        }
      };
    }
  };
}

await test("Simple prompt routes DIRECT", async () => {
  const result = await routeIntent(
    "Hello",
    "task-1",
    {
      model: mockModel({
        mode: "DIRECT",
        targetModel: "free",
        steps: []
      })
    }
  );

  assert.equal(result.mode, "DIRECT");
  assert.equal(result.taskId, "task-1");
});

await test("Complex task escalates", async () => {
  const result = await routeIntent(
    "Deploy infrastructure",
    "task-2",
    {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        steps: ["Plan", "Request approval"]
      })
    }
  );

  assert.equal(result.mode, "ESCALATE");
  assert.equal(result.steps.length, 2);
});

await test("Invalid routing rejected", async () => {
  await assert.rejects(
    routeIntent("Hello", "task-3", {
      model: mockModel({
        mode: "UNKNOWN",
        targetModel: "free",
        steps: []
      })
    })
  );
});

await test("Provider failure is not hidden", async () => {
  await assert.rejects(
    routeIntent("Hello", "task-4", {
      model: mockModel(new Error("Provider unavailable"))
    })
  );
});

await test("Empty prompt rejected", async () => {
  await assert.rejects(
    routeIntent("", "task-5", {
      model: mockModel({
        mode: "DIRECT",
        targetModel: "free",
        steps: []
      })
    })
  );
});

await test("Empty escalation plan rejected", async () => {
  await assert.rejects(
    routeIntent("Deploy server", "task-6", {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        steps: []
      })
    })
  );
});

await test("Unsupported model rejected", async () => {
  await assert.rejects(
    routeIntent("Hello", "task-7", {
      model: { invoke: async () => ({}) }
    }),
    /does not support structured output/
  );
});

await test("Invalid target model rejected", async () => {
  await assert.rejects(
    routeIntent("Deploy infrastructure", "task-8", {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "unknown",
        steps: ["Deploy"]
      })
    })
  );
});

await test("Direct route normalized to free tier", async () => {
  const result = await routeIntent(
    "Explain this concept",
    "task-9",
    {
      model: mockModel({
        mode: "DIRECT",
        targetModel: "premium",
        steps: ["Unnecessary step"]
    })
    }
  );

  assert.equal(result.mode, "DIRECT");
  assert.equal(result.targetModel, "gemini-2.5-flash");
  assert.deepEqual(result.steps, []);
});
await test("Too many steps rejected", async () => {
  await assert.rejects(
    routeIntent("Deploy infrastructure", "task-10", {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        steps: Array(9).fill("Deploy")
      })
    })
  );
});


await test("Coding specialist selected", async () => {
  const result = await routeIntent(
    "Debug my JavaScript backend",
    "task-11",
    {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        specialist: "coding",
        steps: ["Inspect code", "Debug errors"]
      })
    }
  );

  assert.equal(result.mode, "ESCALATE");
  assert.equal(result.specialist, "coding");
});

await test("Database specialist selected", async () => {
  const result = await routeIntent(
    "Optimize PostgreSQL queries",
    "task-12",
    {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        specialist: "database",
        steps: ["Analyze queries"]
      })
    }
  );

  assert.equal(result.specialist, "database");
});

await test("Invalid specialist rejected", async () => {
  await assert.rejects(
    routeIntent("Deploy server", "task-13", {
      model: mockModel({
        mode: "ESCALATE",
        targetModel: "premium",
        specialist: "unknown_agent",
        steps: ["Deploy"]
      })
    })
  );
});


console.log(
  `SUCCESS: ${passed}/13 WCM-36 supervisor tests passed`
);
