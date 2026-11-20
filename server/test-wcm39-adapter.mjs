
import assert from "node:assert/strict";

import {
  streamGraphEvents
} from "./src/streaming/graphStreamAdapter.js";

let passed = 0;

function check(name, actual, expected) {
  assert.deepEqual(actual, expected);
  console.log(`PASS ${++passed}: ${name}`);
}

const mockGraph = {
  async *stream(input, config) {
    assert.equal(input.prompt, "Hello Project V");
    assert.equal(config.streamMode, "updates");

    yield {
      supervisor_node: {
        status: "routed",
        specialist: "coding"
      }
    };

    yield {
      specialist_node: {
        status: "completed",
        output: "Mock response"
      }
    };
  }
};

const events = [];

for await (const event of streamGraphEvents({
  graph: mockGraph,
  prompt: "Hello Project V",
  threadId: "wcm39-test"
})) {
  events.push(event);
}

check(
  "Graph start event",
  events[0].type,
  "agent_start"
);

check(
  "Supervisor event received",
  events[1].data.agent,
  "supervisor_node"
);

check(
  "Supervisor update received",
  events[2].data.status,
  "routed"
);

check(
  "Specialist event received",
  events[4].data.agent,
  "specialist_node"
);

check(
  "Specialist completion received",
  events[5].data.status,
  "completed"
);

check(
  "Thread ID preserved",
  events[0].data.threadId,
  "wcm39-test"
);

check(
  "Raw specialist output not exposed",
  Object.hasOwn(events[5].data, "output"),
  false
);

console.log(
  `SUCCESS: ${passed}/7 WCM-39 tests passed`
);
