
import express from "express";
import { Command } from "@langchain/langgraph";
import { pool } from "../../config/db.js";
import { getGraph } from "../../agents/graphRuntime.js";

const router = express.Router();

const validDecisions = new Set([
  "APPROVE",
  "DOWNGRADE",
  "REJECT"
]);

router.post("/:actionId/decide", async (req, res) => {
  const { actionId } = req.params;
  const { decision } = req.body ?? {};
  const userId = req.user?.sub;

  if (!userId) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  if (!validDecisions.has(decision)) {
    return res.status(400).json({
      error: "Invalid decision"
    });
  }

  // Validate UUID before querying PostgreSQL.
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(actionId) || !uuidRegex.test(userId)) {
    return res.status(400).json({
      error: "Invalid identifier"
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock this action to prevent concurrent approvals.
    const { rows } = await client.query(
      `SELECT pa.id, pa.session_id, pa.status, pa.expires_at
      FROM pending_actions pa
      JOIN sessions s ON s.id = pa.session_id
      WHERE pa.id = $1
        AND pa.user_id = $2
         AND s.user_id = $2
        FOR UPDATE OF pa`,
      [actionId, userId]
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Action not found"
      });
    }

    const action = rows[0];

    if (action.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Action already resolved"
      });
    }
    if (new Date(action.expires_at).getTime() <= Date.now()) {
  await client.query("ROLLBACK");

  return res.status(409).json({
    error: "Action expired"
  });
}

    const graph = await getGraph();

    const config = {
      configurable: {
        thread_id: String(action.session_id)
      }
    };

    const snapshot = await graph.getState(config);

    // Only resume an actual interrupted approval gate.
    const awaitingApproval = snapshot.tasks?.some(
      task =>
        task.name === "human_approval_node" &&
        (task.interrupts?.length ?? 0) > 0
    );

    if (!awaitingApproval) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Workflow is not awaiting approval"
      });
    }

    // Resume the actual LangGraph execution.
    const result = await graph.invoke(
      new Command({
        resume: { decision }
      }),
      config
    );

    const expectedStatus =
      decision === "REJECT" ? "rejected" : "completed";

    if (result.status !== expectedStatus) {
      throw new Error("Unexpected workflow result");
    }

    const databaseStatus =
      decision === "REJECT" ? "REJECTED" : "APPROVED";

    await client.query(
      `UPDATE pending_actions
       SET status = $1, resolved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [databaseStatus, actionId]
    );

    await client.query("COMMIT");

    return res.json({
      status: result.status,
      threadId: String(action.session_id),
      decision
    });

  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Approval workflow failed:", error);

    return res.status(500).json({
      error: "Approval processing failed"
    });
  } finally {
    client?.release();
  }
});

export default router;
