import express from 'express';
import { pool } from '../../config/db.js'; 
import { graph } from '../../agents/graph.js';

const router = express.Router();

router.post('/:actionId/decide', async (req, res) => {
  const { actionId } = req.params;
  const { decision } = req.body; 

  // 1. Strict Input Validation
  const validDecisions = ["APPROVE", "DOWNGRADE", "REJECT"];
  if (!validDecisions.includes(decision)) {
    return res.status(400).json({ error: "Invalid decision payload. Must be APPROVE, DOWNGRADE, or REJECT." });
  }

  try {
    // 2. Fetch the paused thread
    const { rows } = await pool.query('SELECT session_id FROM pending_actions WHERE id = $1', [actionId]);
    if (!rows.length) return res.status(404).json({ error: "Action not found" });

    const threadId = rows[0].session_id;

    if (decision === "REJECT") {
      await pool.query('UPDATE pending_actions SET status = $1 WHERE id = $2', ['REJECTED', actionId]);
      return res.json({ status: "aborted" });
    }

    // 3. Resume the LangGraph thread by updating its state
    await graph.updateState(
      { configurable: { thread_id: threadId } },
      { human_approval: decision, target_model: decision === "DOWNGRADE" ? "free" : "premium" },
      "human_approval_node"
    );

    // 4. Update Database
    await pool.query('UPDATE pending_actions SET status = $1 WHERE id = $2', ['APPROVED', actionId]);
    
    // 5. Respond IMMEDIATELY to unblock the frontend
    res.json({ status: "resumed", threadId });

    // Note: The actual graph.stream() execution should be triggered 
    // by the client opening a connection to your WCM-29 SSE endpoint 
    // using this threadId, NOT awaited synchronously here.

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;