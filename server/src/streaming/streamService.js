
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
