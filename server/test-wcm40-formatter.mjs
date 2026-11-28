
import assert from "node:assert/strict";
import {
  formatStreamError,
  isAbortError
} from "./src/streaming/streamErrorFormatter.js";

let passed = 0;

function check(name, actual, expected) {
  assert.deepEqual(actual, expected);
  console.log(`PASS ${++passed}: ${name}`);
}

// Test 1: Standard HTTP 429
const rateLimit = formatStreamError({ status: 429 });
check("429 code", rateLimit.code, "RATE_LIMIT_EXCEEDED");

// Test 2: Correct HTTP status
check("429 status", rateLimit.status, 429);

// Test 3: Rate limit is retryable
check("429 retryable", rateLimit.retryable, true);

// Test 4: Nested provider error
const nested = formatStreamError({
  cause: { response: { status: 429 } }
});
check("Nested 429 detected", nested.status, 429);

// Test 5: Standard provider failure
const generic = formatStreamError({
  status: 500,
  message: "Provider internal error"
});
check("Generic error code", generic.code, "STREAM_EXECUTION_FAILED");

// Test 6: Generic failure is not retryable by default
check("Generic retryable", generic.retryable, false);

// Test 7: Sensitive error details are hidden
const secret = formatStreamError({
  status: 500,
  message: "API key: secret123"
});
check(
  "Provider secret not exposed",
  JSON.stringify(secret).includes("secret123"),
  false
);

// Test 8: AbortError detection
check(
  "AbortError recognized",
  isAbortError({ name: "AbortError" }),
  true
);

// Test 9: AbortSignal detection
const controller = new AbortController();
controller.abort();
check(
  "Aborted signal recognized",
  isAbortError(new Error("Cancelled"), controller.signal),
  true
);

// Test 10: Normal error is not cancellation
check(
  "Normal failure not treated as abort",
  isAbortError(new Error("Provider failure")),
  false
);

console.log(`SUCCESS: ${passed}/10 WCM-40 formatter tests passed`);
