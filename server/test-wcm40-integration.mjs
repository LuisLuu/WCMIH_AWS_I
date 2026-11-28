import assert from "node:assert/strict";
import { runGraphStream } from "./src/streaming/streamService.js";
import {
  formatStreamError
} from "./src/streaming/streamErrorFormatter.js";

let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

// Test 1: AbortSignal reaches LangGraph
const controller = new AbortController();
let receivedSignal;

const abortGraph = {
  async *streamEvents(input, config) {
    receivedSignal = config.signal;

    yield {
      event: "on_chain_start",
      name: "supervisor_node"
    };

    // Remaining execution must stop after cancellation.
    yield {
      event: "on_chain_end",
      name: "supervisor_node"
    };
  },

  async getState() {
    return { next: [] };
  }
};

const abortEvents = [];

const abortResult = await runGraphStream({
  graph: abortGraph,
  prompt: "Test cancellation",
  threadId: "wcm40-abort-test",
  signal: controller.signal,
  send: async (event, data) => {
    abortEvents.push({ event, data });

    if (event === "agent_start") {
      controller.abort();
    }
  }
});

check(
  "AbortSignal forwarded to LangGraph",
  receivedSignal === controller.signal
);

check(
  "Cancellation detected",
  abortResult.status === "cancelled"
);

check(
  "No completion event after cancellation",
  !abortEvents.some(e => e.event === "done")
);

// Test 2: Provider raises HTTP 429
const rateLimitGraph = {
  async *streamEvents() {
    throw Object.assign(
      new Error("Provider rate limited"),
      { status: 429 }
    );
  }
};

let caughtError;

try {
  await runGraphStream({
    graph: rateLimitGraph,
    prompt: "Test rate limit",
    threadId: "wcm40-rate-test",
    send: async () => {}
  });
} catch (error) {
  caughtError = error;
}

check(
  "Provider failure propagated",
  caughtError?.status === 429
);

const formatted = formatStreamError(caughtError);

check(
  "Rate limit formatted correctly",
  formatted.code === "RATE_LIMIT_EXCEEDED"
);

check(
  "Rate limit marked retryable",
  formatted.retryable === true
);

console.log(
  `SUCCESS: ${passed}/6 WCM-40 integration tests passed`
);
