
import {
  reserveQuota,
  releaseQuota
} from "./quotaGuard.js";

import { logModelUsage } from "./telemetryService.js";

export async function executeGuardedMock({
  userId,
  prompt,
  estimatedTokens = 500,
  execute
}) {
  if (
    typeof prompt !== "string" ||
    !prompt.trim() ||
    typeof execute !== "function" ||
    !Number.isSafeInteger(estimatedTokens) ||
    estimatedTokens <= 0
  ) {
    throw new Error("INVALID_EXECUTION_REQUEST");
  }

  const provider = "mock";
  const modelName = "mock-model";

  const reservation = await reserveQuota({
    userId,
    provider,
    modelName,
    estimatedTokens
  });

  if (!reservation.allowed) {
    return {
      status: "blocked",
      reason: reservation.reason
    };
  }

  let result;
  const startedAt = Date.now();

  // The caller must supply a trusted, local-only mock.
  // Never pass a paid-provider callback here.
  try {
    result = await execute(prompt);
  } catch (error) {
    // The trusted local mock has no billable usage.
    await releaseQuota({
      userId,
      modelName,
      tokens: estimatedTokens
    });
    throw error;
  }

  const usage = result?.usage;

  if (
    !Number.isSafeInteger(usage?.promptTokens) ||
    !Number.isSafeInteger(usage?.completionTokens) ||
    !Number.isSafeInteger(usage?.totalTokens) ||
    usage.promptTokens < 0 ||
    usage.completionTokens < 0 ||
    usage.totalTokens < 0 ||
    usage.totalTokens > estimatedTokens ||
    usage.promptTokens + usage.completionTokens !==
      usage.totalTokens
  ) {
    // Fail closed: keep the reservation because
    // usage cannot be reconciled reliably.
    throw new Error("INVALID_MOCK_USAGE");
  }

  // Do not release the reservation if telemetry fails.
  // This prevents accidentally undercounting usage.
  const telemetry = await logModelUsage({
    userId,
    provider,
    agentId: "mock-agent",
    modelName,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    latencyMs: Date.now() - startedAt
  });

  const unused = estimatedTokens - usage.totalTokens;

  if (unused > 0) {
    await releaseQuota({
      userId,
      modelName,
      tokens: unused
    });
  }

  return {
    status: "completed",
    output: result.output,
    usage,
    telemetryId: telemetry.id
  };
}
