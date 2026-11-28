
/**
 * WCM-40: Convert provider failures into safe SSE payloads.
 * Never expose API keys, raw provider responses or stack traces.
 */

function findRateLimit(error) {
  const visited = new Set();
  let current = error;

  for (let i = 0; i < 5 && current; i++) {
    if (typeof current !== "object" || visited.has(current)) {
      break;
    }

    visited.add(current);

    const status = Number(
      current.status ?? current.statusCode ??
      current.response?.status
    );

    const code = String(current.code ?? "").toUpperCase();

    if (
      status === 429 ||
      code === "RATE_LIMIT_EXCEEDED" ||
      code === "RATE_LIMIT_ERROR" ||
      code === "TOO_MANY_REQUESTS"
    ) {
      return current;
    }

    current = current.cause;
  }

  return null;
}

export function isAbortError(error, signal) {
  return Boolean(
    signal?.aborted ||
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR"
  );
}

export function formatStreamError(error) {
  const rateLimit = findRateLimit(error);

  if (rateLimit) {
    return {
      code: "RATE_LIMIT_EXCEEDED",
      status: 429,
      message: "AI provider rate limit reached. Please try again later.",
      retryable: true
    };
  }

  return {
    code: "STREAM_EXECUTION_FAILED",
    status: 500,
    message: "The AI request failed. Please try again.",
    retryable: false
  };
}
