import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt
} from "@langchain/langgraph";

import { MemorySaver } from "@langchain/langgraph";
import { routeIntent } from "./supervisor.js";
import { invokeRetrievalAgent } from "./specialists/retrievalAgent.js";
import { invokeArchitectAgent } from "./specialists/architectAgent.js";

// Re-export invokeRetrievalAgent so test-wcm38 and other callers can import from graph.js
export { invokeRetrievalAgent, invokeArchitectAgent };

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

  return routeToSpecialist(state);
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
    : routeToSpecialist(state);
}

// Dynamic specialist router
function routeToSpecialist(state) {
  const specialist = state.specialist ?? "general";
  if (specialist === "retrieval") {
    return "retrieval_specialist_node";
  }
  if (specialist === "architect") {
    return "architect_specialist_node";
  }
  return "specialist_node";
}

// Default generic specialist node (preserves backward compatibility with WCM-35/36 mocks)
async function specialistNode(state) {
  const specialist = state.specialist ?? "general";
  return {
    output: `MOCK SPECIALIST RESULT: ${state.prompt}`,
    status: "completed",
    specialist
  };
}

// Specialized retrieval agent node (WCM-38 / Track 2)
async function retrievalSpecialistNode(state) {
  const result = await invokeRetrievalAgent(state.prompt);
  return {
    output: result.answer || `RETRIEVAL_COMPLETED: ${state.prompt}`,
    status: "completed",
    specialist: "retrieval"
  };
}

// Specialized architecture & execution agent node (WCM-46 / Track 2)
async function architectSpecialistNode(state) {
  const result = await invokeArchitectAgent(state.prompt, {
    taskId: state.taskId
  });
  return {
    output: result.answer || `ARCHITECT_ANALYSIS_COMPLETED: ${state.prompt}`,
    status: "completed",
    specialist: "architect"
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
    .addNode("retrieval_specialist_node", retrievalSpecialistNode)
    .addNode("architect_specialist_node", architectSpecialistNode)

    .addEdge(START, "supervisor_node")

    .addConditionalEdges(
      "supervisor_node",
      routeAfterSupervisor,
      ["human_approval_node", "specialist_node", "retrieval_specialist_node", "architect_specialist_node"]
    )

    .addConditionalEdges(
      "human_approval_node",
      routeAfterApproval,
      [END, "specialist_node", "retrieval_specialist_node", "architect_specialist_node"]
    )

    .addEdge("specialist_node", END)
    .addEdge("retrieval_specialist_node", END)
    .addEdge("architect_specialist_node", END);

  return workflow.compile({
    checkpointer
  });
}

// Initial in-memory checkpointer for unit testing.
export const graph = createProjectGraph(
  new MemorySaver()
);
