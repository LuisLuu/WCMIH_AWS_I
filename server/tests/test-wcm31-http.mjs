
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "dotenv";

config({
  path: new URL("../.env", import.meta.url)
});

const base = "http://127.0.0.1:3002";
const token = jwt.sign(
  { sub: randomUUID() },
  process.env.JWT_SECRET,
  {
    algorithm: "HS256",
    issuer: "project-v",
    audience: "project-v-api",
    expiresIn: "10m"
  }
);

let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  console.log(`PASS ${++passed}: ${name}`);
}

async function openStream() {
  return fetch(`${base}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ prompt: "Test streaming" }),
    signal: AbortSignal.timeout(10000)
  });
}

async function readEvents(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop();

      for (const frame of frames) {
        const event = frame.match(/^event: (.+)$/m)?.[1];
        const data = frame.match(/^data: (.+)$/m)?.[1];

        if (event && data) {
          await onEvent(event, JSON.parse(data));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

try {
  // Test unauthenticated request
  const unauthorized = await fetch(
    `${base}/api/chat/stream`,
    { method: "POST" }
  );
  check("JWT required", unauthorized.status === 401);

  // Test normal streaming
  const response = await openStream();
  check("SSE endpoint returns 200",
    response.status === 200);

  check("SSE content type",
    response.headers.get("content-type")
      ?.includes("text/event-stream"));

  const events = [];

  await readEvents(response, async (event, data) => {
    events.push({ event, data });
  });

  check("Ready event received",
    events.some(e => e.event === "ready"));

  check("Agent activity received",
    events.some(e => e.event === "agent_start"));

  check("Streaming tokens received",
    events.some(e => e.event === "token"));

  check("Done event received",
    events.at(-1)?.event === "done");

  // Test authenticated cancellation
  const cancelling = await openStream();
  check("Second stream opened", cancelling.status === 200);

  let cancelStatus = null;
  const cancelledEvents = [];

  await readEvents(cancelling, async (event, data) => {
    cancelledEvents.push(event);

    if (event === "ready") {
      const result = await fetch(
        `${base}/api/chat/stream/${data.streamId}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      cancelStatus = result.status;
    }
  });

  check("Cancellation endpoint returns 200",
    cancelStatus === 200);

  check("Cancellation event received",
    cancelledEvents.includes("cancelled"));

  check("Cancelled stream does not finish",
    !cancelledEvents.includes("done"));

  console.log(`SUCCESS: ${passed}/11 HTTP tests passed`);
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
}
