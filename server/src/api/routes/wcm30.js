
import express from "express";
import { executeGuardedMock } from
  "../../services/modelExecutionGuard.js";

const router = express.Router();

const trustedMock = async (prompt) => ({
  output: `MOCK RESPONSE: ${prompt}`,
  usage: {
    promptTokens: 120,
    completionTokens: 80,
    totalTokens: 200
  }
});

router.post("/mock", async (req, res) => {
  try {
    const userId = req.user?.sub;
    const { prompt } = req.body ?? {};

    if (
      typeof prompt !== "string" ||
      !prompt.trim() ||
      prompt.length > 5000
    ) {
      return res.status(400).json({
        error: "INVALID_PROMPT"
      });
    }

    const result = await executeGuardedMock({
      userId,
      prompt,
      estimatedTokens: 500,
      execute: trustedMock
    });

    if (result.status === "blocked") {
      return res.status(429).json({
        status: "blocked",
        reason: result.reason
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("WCM-30 execution failed:", error.message);

    return res.status(500).json({
      error: "WCM30_EXECUTION_FAILED"
    });
  }
});

export default router;
