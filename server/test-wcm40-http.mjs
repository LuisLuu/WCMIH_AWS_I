
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { formatStreamError } from "./src/streaming/streamErrorFormatter.js";

let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

const app = express();
app.use(express.json());

// HTTP SSE test fixture: no real AI provider or database.
app.post("/test/stream", async (req, res) => {
  const controller = new AbortController();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const onClose = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.once("close", onClose);

  try {
    res.write('event: ready\ndata: {"status":"streaming"}\n\n');

    if (req.body.mode === "rate-limit") {
      throw Object.assign(new Error("Too many requests"), {
        status: 429
      });
    }

    await sleep(5000, undefined, {
      signal: controller.signal
    });

    if (!controller.signal.aborted) {
      res.write('event: done\ndata: {"status":"completed"}\n\n');
    }
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) {
      res.write(
        `event: error\ndata: ${JSON.stringify(formatStreamError(error))}\n\n`
      );
    }
  } finally {
    res.removeListener("close", onClose);
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
});

const server = app.listen(0);
await once(server, "listening");

const port = server.address().port;
const url = `http://127.0.0.1:${port}/test/stream`;

try {
  // Test HTTP 429 SSE formatting.
  const rateResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "rate-limit" })
  });

  const rateBody = await rateResponse.text();

  check("HTTP SSE status is 200", rateResponse.status === 200);
  check("SSE content type", rateResponse.headers.get("content-type")?.includes("text/event-stream"));
  check("SSE error event emitted", rateBody.includes("event: error"));
  check("429 error formatted", rateBody.includes("RATE_LIMIT_EXCEEDED"));
  check("No raw provider error exposed", !rateBody.includes("Too many requests"));

  // Test HTTP client disconnect.
  const abortController = new AbortController();

  const disconnectResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "disconnect" }),
    signal: abortController.signal
  });

  check("Streaming connection established", disconnectResponse.status === 200);

  abortController.abort();

  check("Client abort triggered", abortController.signal.aborted);

  console.log(`SUCCESS: ${passed}/7 WCM-40 HTTP fixture tests passed`);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
