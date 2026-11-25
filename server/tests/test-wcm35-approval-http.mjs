
import { config } from "dotenv";
config({ path: new URL("../.env", import.meta.url) });

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import { pool } from "../src/config/db.js";
import { createProjectGraph } from "../src/agents/graph.js";
import { createPostgresCheckpointer } from "../src/agents/postgresCheckpointer.js";

const API = "http://localhost:3002";
const usersToClean = [];
let saver;
let passed = 0;

function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  console.log(`PASS ${++passed}: ${name}`);
}

function token(userId) {
  return jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: "project-v",
      audience: "project-v-api",
      expiresIn: "5m"
    }
  );
}

async function request(actionId, decision, userToken) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (userToken) {
    headers.Authorization = `Bearer ${userToken}`;
  }

  const res = await fetch(
    `${API}/api/chat/actions/${actionId}/decide`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ decision }),
      signal: AbortSignal.timeout(15000)
    }
  );

  return {
    status: res.status,
    body: await res.json()
  };
}

async function createUser() {
  const email = `wcm35-${randomUUID()}@example.invalid`;

  const result = await pool.query(
    "INSERT INTO users(email) VALUES($1) RETURNING id",
    [email]
  );

  const id = result.rows[0].id;
  usersToClean.push(id);
  return id;
}

async function createAction(userId, graph, expired = false) {
  const session = await pool.query(
    `INSERT INTO sessions(user_id)
     VALUES($1) RETURNING id`,
    [userId]
  );

  const sessionId = session.rows[0].id;

  if (!expired) {
    await graph.invoke(
      {
        taskId: randomUUID(),
        prompt: "Deploy AWS infrastructure"
      },
      { configurable: { thread_id: sessionId } }
    );

    const state = await graph.getState({
      configurable: { thread_id: sessionId }
    });

    assert.ok(
      state.tasks.some(
        t => (t.interrupts?.length ?? 0) > 0
      ),
      "Expected graph to pause at approval"
    );
  }

  const result = await pool.query(
    `INSERT INTO pending_actions(
       user_id,
       session_id,
       target_agent,
       action_type,
       supervisor_state,
       action_payload,
       expires_at
     )
     VALUES(
       $1, $2, $3, $4,
       $5::jsonb, $6::jsonb, $7
     )
     RETURNING id`,
    [
      userId,
      sessionId,
      "specialist",
      "APPROVAL",
      "{}",
      "{}",
      expired
        ? new Date(Date.now() - 60000)
        : new Date(Date.now() + 600000)
    ]
  );

  return {
    actionId: result.rows[0].id,
    sessionId
  };
}

try {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET missing");
  }

  saver = await createPostgresCheckpointer();
  const graph = createProjectGraph(saver);

  const owner = await createUser();
  const outsider = await createUser();

  const ownerToken = token(owner);
  const outsiderToken = token(outsider);

  const approval = await createAction(owner, graph);

  const missingJwt = await request(
    approval.actionId, "APPROVE", null
  );
  check("Missing JWT rejected", missingJwt.status, 401);

  const invalidJwt = await request(
    approval.actionId, "APPROVE", "invalid-token"
  );
  check("Invalid JWT rejected", invalidJwt.status, 401);

  const wrongUser = await request(
    approval.actionId, "APPROVE", outsiderToken
  );
  check("Other user cannot approve", wrongUser.status, 404);

  const approved = await request(
    approval.actionId, "APPROVE", ownerToken
  );
  check("Owner approval succeeds", approved.status, 200);

  const state = await graph.getState({
    configurable: { thread_id: approval.sessionId }
  });
  check("LangGraph resumed", state.values.status, "completed");

  const actionRow = await pool.query(
    "SELECT status FROM pending_actions WHERE id=$1",
    [approval.actionId]
  );
  check("Action stored as approved",
    actionRow.rows[0].status, "APPROVED");

  const duplicate = await request(
    approval.actionId, "APPROVE", ownerToken
  );
  check("Duplicate approval blocked", duplicate.status, 409);

  const rejection = await createAction(owner, graph);
  const rejected = await request(
    rejection.actionId, "REJECT", ownerToken
  );
  check("Rejection succeeds", rejected.status, 200);

  const rejectedState = await graph.getState({
    configurable: { thread_id: rejection.sessionId }
  });
  check("Rejected graph stops",
    rejectedState.values.status, "rejected");

  const expired = await createAction(owner, graph, true);
  const expiredResponse = await request(
    expired.actionId, "APPROVE", ownerToken
  );
  check("Expired action blocked", expiredResponse.status, 409);

  console.log(
    `SUCCESS: ${passed}/10 HTTP approval tests passed`
  );
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  for (const userId of usersToClean.reverse()) {
    try {
      await pool.query(
        "DELETE FROM users WHERE id=$1",
        [userId]
      );
    } catch (error) {
      console.error("Cleanup failed:", error.message);
      process.exitCode = 1;
    }
  }

  await saver?.end();
  await pool.end();
  console.log("Demo SQL users cleaned up");
}
