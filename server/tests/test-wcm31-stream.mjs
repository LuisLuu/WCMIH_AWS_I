
import assert from "node:assert/strict";
import {
  formatSSE,
  runMockStream
} from "../src/streaming/streamService.js";

let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

async function main() {
  // Test 1: correct SSE format
  const formatted = formatSSE("token", {
    content: "hello"
  });

  check(
    "Valid SSE format",
    formatted ===
      'event: token\ndata: {"content":"hello"}\n\n'
  );

  // Test 2: mock execution completes
  const events = [];

  const completed = await runMockStream({
    delayMs: 1,
    send: async (event, data) => {
      events.push({ event, data });
    }
  });

  check(
    "Mock stream completed",
    completed.status === "completed"
  );

  check(
    "Agent events received",
    events.some(e => e.event === "agent_start") &&
    events.some(e => e.event === "agent_end")
  );

  check(
    "Token events received",
    events.filter(e => e.event === "token").length === 2
  );

  check(
    "Done event emitted",
    events.at(-1)?.event === "done"
  );

  // Test cancellation
  const controller = new AbortController();
  const cancelledEvents = [];

  const cancelled = await runMockStream({
    signal: controller.signal,
    delayMs: 1,
    send: async (event, data) => {
      cancelledEvents.push({ event, data });

      if (cancelledEvents.length === 2) {
        controller.abort();
      }
    }
  });

  check(
    "AbortController cancels execution",
    cancelled.status === "cancelled"
  );

  check(
    "No further events after cancellation",
    cancelledEvents.length === 2 &&
    !cancelledEvents.some(e => e.event === "done")
  );

  console.log(`SUCCESS: ${passed}/7 tests passed`);
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
