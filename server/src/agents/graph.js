
import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt
} from "@langchain/langgraph";

import { MemorySaver } from "@langchain/langgraph";
import { routeIntent } from "./supervisor.js";

// WCM-35: Real LangGraph state schema
export const GraphState = Annotation.Root({
  taskId: Annotation(),
  prompt: Annotation(),
  mode: Annotation(),
  targetModel: Annotation(),
  specialist: Annotation(),
  steps: Annotation(),
  human_approval: Annotation(),
  output: Annotation(),
  status: Annotation()
});

// Temporary supervisor implementation.
// WCM-36 will implement LLM-based routing.


async function supervisorNode(state, router = routeIntent) {
  const result = await router(
    state.prompt,
    state.taskId
  );

  return {
    mode: result.mode,
    targetModel: result.targetModel,
    specialist: result.specialist ?? "general",
    steps: result.steps,
    status: "routed"
  };
}



// Route based on the Supervisor decision.
function routeAfterSupervisor(state) {
  if (state.mode === "ESCALATE") {
    return "human_approval_node";
  }

  return "specialist_node";
}

// Human approval gate, using real LangGraph interrupt.
async function humanApprovalNode(state) {
  const decision = interrupt({
    taskId: state.taskId,
    targetModel: state.targetModel,
    steps: state.steps,
    message: "Approval required"
  });

  if (
    !decision ||
    !["APPROVE", "DOWNGRADE", "REJECT"].includes(
      decision.decision
    )
  ) {
    throw new Error("INVALID_APPROVAL_DECISION");
  }

  return {
    human_approval: decision.decision,
    targetModel:
      decision.decision === "DOWNGRADE"
        ? "free"
        : state.targetModel,
    status:
      decision.decision === "REJECT"
        ? "rejected"
        : "approved"
  };
}

function routeAfterApproval(state) {
  return state.status === "rejected"
    ? END
    : "specialist_node";
}

// Placeholder specialist for WCM-35.
// No actual AI provider is invoked.

async function specialistNode(state) {
  const specialist = state.specialist ?? "general";

  // WCM-36: Specialist delegation metadata only.
  // Real specialist execution will be implemented later.
  return {
    output: `MOCK SPECIALIST RESULT: ${state.prompt}`,
    status: "completed",
    specialist
  };
}


export function createProjectGraph(
  checkpointer,
  { router = routeIntent } = {}
) {
  const workflow = new StateGraph(GraphState)
    .addNode(
  "supervisor_node",
  (state) => supervisorNode(state, router)
)
    .addNode("human_approval_node", humanApprovalNode)
    .addNode("specialist_node", specialistNode)

    .addEdge(START, "supervisor_node")

    .addConditionalEdges(
      "supervisor_node",
      routeAfterSupervisor,
      ["human_approval_node", "specialist_node"]
    )

    .addConditionalEdges(
      "human_approval_node",
      routeAfterApproval,
      [END, "specialist_node"]
    )

    .addEdge("specialist_node", END);

  return workflow.compile({
    checkpointer
  });
}

// Initial in-memory checkpointer for unit testing.
// PostgreSQL will replace this in the persistence phase.
export const graph = createProjectGraph(
  new MemorySaver()
);
