
import { setTimeout as sleep } from "node:timers/promises";

export function formatSSE(event, data) {
  if (
    typeof event !== "string" ||
    !/^[a-z][a-z0-9_-]*$/i.test(event)
  ) {
    throw new Error("INVALID_SSE_EVENT");
  }

  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sendSSE(res, event, data) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }

  res.write(formatSSE(event, data));
  return true;
}

/**
 * Local mock multi-agent streaming.
 * No external AI provider is called.
 */
export async function runMockStream({
  send,
  signal,
  delayMs = 150
}) {
  if (typeof send !== "function") {
    throw new Error("INVALID_SEND_FUNCTION");
  }

  const events = [
    ["agent_start", {
      agent: "supervisor",
      message: "Analyzing user request"
    }],
    ["agent_end", {
      agent: "supervisor",
      message: "Routing completed"
    }],
    ["agent_start", {
      agent: "specialist",
      message: "Processing task"
    }],
    ["token", {
      agent: "specialist",
      content: "Hello "
    }],
    ["token", {
      agent: "specialist",
      content: "from Project V"
    }],
    ["agent_end", {
      agent: "specialist",
      message: "Task completed"
    }]
  ];

  try {
    signal?.throwIfAborted();

    for (const [event, data] of events) {
      await sleep(delayMs, undefined, { signal });
      signal?.throwIfAborted();

      await send(event, data);
    }

    signal?.throwIfAborted();
    await send("done", { status: "completed" });

    return { status: "completed" };
  } catch (error) {
    if (signal?.aborted || error.name === "AbortError") {
      return { status: "cancelled" };
    }

    throw error;
  }
}

/**
 * WCM-39: Stream real LangGraph execution events.
 * The graph is injected for independent testing.
 */
export async function runGraphStream({
  graph,
  prompt,
  threadId,
  signal,
  send
}) {
  if (!graph || typeof graph.streamEvents !== "function") {
    throw new Error("LANGGRAPH_NOT_AVAILABLE");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("INVALID_PROMPT");
  }

  if (typeof send !== "function") {
    throw new Error("INVALID_SEND_FUNCTION");
  }

  try {
    const events = graph.streamEvents(
      {
        taskId: threadId,
        prompt: prompt.trim()
      },
      {
        version: "v2",
        configurable: {
          thread_id: threadId
        },
        signal
      }
    );

    for await (const event of events) {
      signal?.throwIfAborted();

      if (event.event === "on_chat_model_stream") {
        const content = event.data?.chunk?.content;

        if (typeof content === "string" && content) {
          await send("token", {
            content
          });
        }
      }

      if (event.event === "on_chain_start" && event.name) {
        await send("agent_start", {
          agent: event.name
        });
      }

      if (event.event === "on_chain_end" && event.name) {
        await send("agent_end", {
          agent: event.name
        });
      }
    }

    signal?.throwIfAborted();

    signal?.throwIfAborted();

const state = await graph.getState({
  configurable: {
    thread_id: threadId
  }
});

const awaitingApproval = Boolean(state.next?.length);

const status = awaitingApproval
  ? "awaiting_approval"
  : "completed";

if (awaitingApproval) {
  await send("approval_required", {
    threadId,
    status
  });
}

await send("done", {
  status
});

return { status };
  } catch (error) {
    if (signal?.aborted || error.name === "AbortError") {
      return { status: "cancelled" };
    }

    throw error;
  }
}
