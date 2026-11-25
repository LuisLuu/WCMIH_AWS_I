import { routeIntent } from '../src/agents/supervisor.js';

async function run() {
  const p1 = "What is the capital of France?";
  const p2 = "I need you to write a Node.js script using lgtv2 to control my TV over WebSockets, write the output to a file, and deploy a new AWS KMS key using Terraform.";

  console.log("Test 1 (Expected: PASS) ->", await routeIntent(p1, "task-1"));
  console.log("Test 2 (Expected: ESCALATE) ->", await routeIntent(p2, "task-2"));
}
run();