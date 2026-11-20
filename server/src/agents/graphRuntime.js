
import { createProjectGraph } from "./graph.js";
import { createPostgresCheckpointer } from "./postgresCheckpointer.js";

let runtimePromise = null;

async function initializeRuntime() {
  const checkpointer = await createPostgresCheckpointer();

  return {
    graph: createProjectGraph(checkpointer),
    checkpointer
  };
}

export async function getGraphRuntime() {
  if (!runtimePromise) {
    runtimePromise = initializeRuntime().catch(error => {
      runtimePromise = null;
      throw error;
    });
  }

  return runtimePromise;
}

export async function getGraph() {
  const runtime = await getGraphRuntime();
  return runtime.graph;
}
