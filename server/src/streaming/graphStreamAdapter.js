
import { randomUUID } from "node:crypto";

/**
 * WCM-39: LangGraph execution to SSE event adapter.
 *
 * The graph is injected so this module can be tested
 * independently of WCM-35/36.
 */
export async function* streamGraphEvents({
  graph,
  prompt,
  threadId = randomUUID(),
  signal
}) {
  if (!graph || typeof graph.stream !== "function") {
    throw new Error("LANGGRAPH_NOT_AVAILABLE");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("INVALID_PROMPT");
  }

  const config = {
    configurable: {
      thread_id: threadId
    },
    streamMode: "updates",
    signal
  };

  yield {
    type: "agent_start",
    data: {
      agent: "langgraph",
      threadId
    }
  };

  const updates = await graph.stream(
    {
      taskId: randomUUID(),
      prompt: prompt.trim()
    },
    config
  );

  for await (const update of updates) {
    if (signal?.aborted) return;

    for (const [node, value] of Object.entries(update)) {
      if (signal?.aborted) return;

      if (node === "__interrupt__") {
        yield {
          type: "approval_required",
          data: { threadId }
        };
        continue;
      }

      yield {
        type: "agent_start",
        data: { agent: node }
      };

      // Allowlisted public metadata only.
      // Do not send raw graph state to the frontend.
      yield {
        type: "agent_update",
        data: {
          agent: node,
          status: typeof value?.status === "string"
            ? value.status
            : "updated"
        }
      };

      yield {
        type: "agent_end",
        data: { agent: node }
      };
    }
  }
}
