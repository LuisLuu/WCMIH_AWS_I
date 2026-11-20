
import assert from "node:assert/strict";
import { runGraphStream } from "./src/streaming/streamService.js";

let passed = 0;

function check(name, actual, expected) {
  assert.deepEqual(actual, expected);
  console.log(`PASS ${++passed}: ${name}`);
}

const graph = {
  async *stream() {
    yield {
      supervisor_node: {
        status: "routed"
      }
    };

    yield {
      specialist_node: {
        status: "completed"
      }
    };
  }
};

const received = [];

const result = await runGraphStream({
  graph,
  prompt: "Hello Project V",
  threadId: "wcm39-test",
  send: async (event, data) => {
    received.push({ event, data });
  }
});

check(
  "Graph execution completed",
  result.status,
  "completed"
);

check(
  "Graph start emitted",
  received[0].event,
  "agent_start"
);

check(
  "Supervisor update emitted",
  received[2].event,
  "agent_update"
);

check(
  "Specialist update emitted",
  received[5].event,
  "agent_update"
);

check(
  "Done event emitted",
  received.at(-1).event,
  "done"
);

check(
  "Done status correct",
  received.at(-1).data.status,
  "completed"
);

const controller = new AbortController();
controller.abort();

const cancelled = await runGraphStream({
  graph,
  prompt: "Cancel test",
  signal: controller.signal,
  send: async () => {}
});

check(
  "Aborted stream cancelled",
  cancelled.status,
  "cancelled"
);

console.log(
  `SUCCESS: ${passed}/7 WCM-39 service tests passed`
);
