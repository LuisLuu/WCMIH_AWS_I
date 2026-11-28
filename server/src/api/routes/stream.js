import { getGraphRuntime } from "../../agents/graphRuntime.js";
import { runGraphStream } from "../../streaming/streamService.js";
import express from "express";
import { randomUUID } from "node:crypto";
import {
  runMockStream,
  sendSSE
} from "../../streaming/streamService.js";

const router = express.Router();

// Active streams exist only in this Node process.
const activeStreams = new Map();

router.post("/stream", async (req, res) => {
  const userId = req.user?.sub;
  const prompt = req.body?.prompt;

  if (!userId) {
    return res.status(401).json({
      error: "UNAUTHORIZED"
    });
  }

  if (
    typeof prompt !== "string" ||
    !prompt.trim() ||
    prompt.length > 5000
  ) {
    return res.status(400).json({
      error: "INVALID_PROMPT"
    });
  }

  const streamId = randomUUID();
  const controller = new AbortController();

  activeStreams.set(streamId, {
    userId,
    controller
  });

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders();

  const onClose = () => {
    controller.abort();
  };

  res.once("close", onClose);

  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) {
      res.write(": heartbeat\n\n");
    }
  }, 15000);

  try {
    sendSSE(res, "ready", {
      streamId,
      status: "streaming"
    });

const send = async (event, data) => {
  if (controller.signal.aborted) return;
  if (!sendSSE(res, event, data)) {
    controller.abort();
  }
};

    const useMock = process.env.WCM39_MOCK_GRAPH === "true";

const result = useMock
  ? await runMockStream({
      signal: controller.signal,
      delayMs: 500,
      send
    })
  : await (async () => {
      const { graph } = await getGraphRuntime();

      return runGraphStream({
        graph,
        prompt,
        threadId: streamId,
        signal: controller.signal,
        send
      });
    })();

    if (
      result.status === "cancelled" &&
      !res.destroyed &&
      !res.writableEnded
    ) {
      sendSSE(res, "cancelled", {
        streamId,
        status: "cancelled"
      });
    }
  } catch (error) {
  console.error("[WCM-39] LangGraph stream failed:", error);

  if (!res.destroyed && !res.writableEnded) {
      sendSSE(res, "error", {
        code: "STREAM_EXECUTION_FAILED"
      });
    }
  } finally {
    clearInterval(heartbeat);
    res.removeListener("close", onClose);
    activeStreams.delete(streamId);

    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
});

// Cancel an active stream owned by the same user.
router.post("/stream/:streamId/cancel", (req, res) => {
  const { streamId } = req.params;
  const stream = activeStreams.get(streamId);

  if (!stream || stream.userId !== req.user?.sub) {
    return res.status(404).json({
      error: "STREAM_NOT_FOUND"
    });
  }

  stream.controller.abort();

  return res.status(200).json({
    status: "cancellation_requested",
    streamId
  });
});

export default router;
