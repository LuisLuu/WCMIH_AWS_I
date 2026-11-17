import { z } from "zod";
import { getModelAdapter } from "../config/models.js"; //

const escalationSchema = z.object({
  taskId: z.string().describe("The unique ID of the request"),
  mode: z.enum(["DIRECT", "ESCALATE"]).describe("DIRECT for simple chat, ESCALATE for code, db queries, or multi-step logic"),
  targetModel: z.string().describe("Suggested model tier: 'free' or 'premium'"),
  steps: z.array(z.string()).describe("Estimated steps to complete if ESCALATE is chosen")
});

export async function routeIntent(prompt, taskId) {
  // Simple mock routing logic
  const isComplex = prompt.toLowerCase().includes("aws") || prompt.length > 100;

  if (isComplex) {
    return {
      taskId,
      mode: 'ESCALATE',
      targetModel: 'premium',
      steps: [ 'Simulated AWS KMS Deployment', 'Simulated Vector DB write' ]
    };
  } else {
    return {
      taskId,
      mode: 'DIRECT',
      targetModel: 'gemini-2.5-flash',
      steps: []
    };
  }
}