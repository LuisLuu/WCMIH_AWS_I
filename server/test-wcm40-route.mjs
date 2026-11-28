
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

process.env.WCM39_MOCK_GRAPH = "true";

const { default: streamRouter } =
  await import("./src/api/routes/stream.js");

const app = express();
app.use(express.json());

// Test-only identity. Production JWT remains unchanged.
app.use("/api/chat", (req, res, next) => {
  req.user = { sub: "wcm40-test-user" };
  next();
});

app.use("/api/chat", streamRouter);

app.get("/test/health", (req, res) => {
  res.json({ status: "OK" });
});

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");

const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

try {
  const controller = new AbortController();

  // Call the actual Project V streaming route.
  const response = await fetch(`${base}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: "WCM40 client disconnect test"
    }),
    signal: controller.signal
  });

  check("Real SSE route responds", response.status === 200);

  check(
    "Correct SSE Content-Type",
    response.headers.get("content-type")
      ?.includes("text/event-stream")
  );

  const reader = response.body.getReader();
  const first = await reader.read();

  check("SSE data received", !first.done);

  const initialText = new TextDecoder().decode(first.value);

  check(
    "Ready event received",
    initialText.includes("event: ready")
  );

  controller.abort();

  check(
    "Client abort signal triggered",
    controller.signal.aborted
  );

  await sleep(700);

  const health = await fetch(`${base}/test/health`);

  check(
    "Server remains responsive after disconnect",
    health.status === 200
  );

  check(
    "Server health remains OK",
    (await health.json()).status === "OK"
  );

  console.log(
    `SUCCESS: ${passed}/7 WCM-40 real route tests passed`
  );
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
