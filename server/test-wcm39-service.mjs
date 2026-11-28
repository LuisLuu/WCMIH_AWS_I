
import assert from "node:assert/strict";
import { runGraphStream } from "./src/streaming/streamService.js";

let passed = 0;

function check(name, actual, expected) {
  assert.deepEqual(actual, expected);
  console.log(`PASS ${++passed}: ${name}`);
}

function createMockGraph(awaitingApproval = false) {
  return {
    async *streamEvents(input, config) {
      assert.equal(input.prompt, "Hello Project V");
      assert.equal(config.version, "v2");
      assert.equal(config.configurable.thread_id, "wcm39-test");

      yield {
        event: "on_chain_start",
        name: "supervisor_node"
      };

      yield {
        event: "on_chain_end",
        name: "supervisor_node"
      };

      yield {
        event: "on_chain_start",
        name: "specialist_node"
      };

      yield {
        event: "on_chat_model_stream",
        data: {
          chunk: { content: "Hello " }
        }
      };

      yield {
        event: "on_chat_model_stream",
        data: {
          chunk: { content: "from Project V" }
        }
      };

      yield {
        event: "on_chain_end",
        name: "specialist_node"
      };
    },

    async getState() {
      return {
        next: awaitingApproval ? ["human_approval_node"] : []
      };
    }
  };
}

const received = [];

const result = await runGraphStream({
  graph: createMockGraph(),
  prompt: "Hello Project V",
  threadId: "wcm39-test",
  send: async (event, data) => {
    received.push({ event, data });
  }
});

check("Graph execution completed", result.status, "completed");
check("Supervisor start emitted", received[0].event, "agent_start");
check("Supervisor name correct", received[0].data.agent, "supervisor_node");
check("Supervisor end emitted", received[1].event, "agent_end");
check("Specialist start emitted", received[2].event, "agent_start");
check("First token emitted", received[3].data.content, "Hello ");
check("Second token emitted", received[4].data.content, "from Project V");
check("Specialist end emitted", received[5].event, "agent_end");
check("Done event emitted", received.at(-1).event, "done");
check("Done status correct", received.at(-1).data.status, "completed");

const approvalEvents = [];

const approval = await runGraphStream({
  graph: createMockGraph(true),
  prompt: "Hello Project V",
  threadId: "wcm39-test",
  send: async (event, data) => {
    approvalEvents.push({ event, data });
  }
});

check("Approval status", approval.status, "awaiting_approval");
check(
  "Approval event emitted",
  approvalEvents.at(-2).event,
  "approval_required"
);
check(
  "Approval thread ID preserved",
  approvalEvents.at(-2).data.threadId,
  "wcm39-test"
);
check(
  "Approval done status",
  approvalEvents.at(-1).data.status,
  "awaiting_approval"
);

const controller = new AbortController();
controller.abort();

const cancelled = await runGraphStream({
  graph: createMockGraph(),
  prompt: "Hello Project V",
  threadId: "wcm39-test",
  signal: controller.signal,
  send: async () => {}
});

check("Aborted stream cancelled", cancelled.status, "cancelled");

console.log(`SUCCESS: ${passed}/15 WCM-39 service tests passed`);
