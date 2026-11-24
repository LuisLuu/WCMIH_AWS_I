
import express from "express";

import verifyToken from "../middlewares/auth.js";

import {
  saveApiKey,
  listApiKeys,
  deleteApiKey
} from "../../services/keyRingService.js";

const router = express.Router();

// All Key Ring APIs require authentication
router.use(verifyToken);

function handleError(error, res) {
  if (error.message === "INVALID_USER_ID") {
    return res.status(401).json({
      error: "Invalid user identity"
    });
  }

  if (
    error.message === "INVALID_PROVIDER" ||
    error.message === "INVALID_API_KEY"
  ) {
    return res.status(400).json({
      error: "Invalid request data"
    });
  }

  // Do not expose database or secret details
  return res.status(500).json({
    error: "Internal server error"
  });
}

// GET /api/keys
router.get("/", async (req, res) => {
  try {
    const providers = await listApiKeys(req.user.sub);

    if (providers === null) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    return res.json({ providers });
  } catch (error) {
    return handleError(error, res);
  }
});

// PUT /api/keys/:provider
router.put("/:provider", async (req, res) => {
  try {
    const { apiKey } = req.body || {};

    const saved = await saveApiKey(
      req.user.sub,
      req.params.provider,
      apiKey
    );

    if (!saved) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    return res.json({
      success: true,
      provider: req.params.provider.toLowerCase()
    });
  } catch (error) {
    return handleError(error, res);
  }
});

// DELETE /api/keys/:provider
router.delete("/:provider", async (req, res) => {
  try {
    const deleted = await deleteApiKey(
      req.user.sub,
      req.params.provider
    );

    if (!deleted) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return handleError(error, res);
  }
});

export default router;
