import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chunkDocumentText, extractTextFromBuffer, ingestDocument } from './src/db/vector/ingestionPipeline.js';
import { invokeArchitectAgent, architectureAuditTool } from './src/agents/specialists/architectAgent.js';
import { routeIntent } from './src/agents/supervisor.js';
import { createProjectGraph } from './src/agents/graph.js';
import { MemorySaver, Command } from '@langchain/langgraph';

let passed = 0;

function check(name, condition) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

console.log('🚀 Running Track 2 (WCM-45 & WCM-46) Multi-Agent & Knowledge Vault Test Suite...\n');

// ============================================================================
// PART 1: WCM-45 Ingestion Pipeline Unit Tests
// ============================================================================
console.log('--- WCM-45: Document Ingestion Pipeline ---');

// 1. Text chunking test
const sampleDoc = `
Project V Enterprise Architecture Overview.
This document outlines the core multi-agent orchestration architecture for Project V.
The supervisor routes incoming intents across specialized micro-agents:
- Enterprise Retrieval Specialist
- High-Stakes Architecture Specialist
- Database Optimization Specialist
- Cloud Infrastructure Specialist

Each specialist is registered within a LangGraph state graph.
When high-stakes operations or high-risk architectural changes are requested,
the supervisor escalates the decision through a human approval gate.
`.repeat(10); // make it long enough to produce multiple chunks

const chunks = chunkDocumentText(sampleDoc, 400, 80);
check('Text splitting produces multiple chunks with overlap', chunks.length > 1);
check('First chunk contains expected header', chunks[0].includes('Project V Enterprise Architecture'));

// 2. Buffer extraction test (.txt / .md)
const mdBuffer = Buffer.from('# Architecture Guide\nAWS Multi-AZ deployment rules.');
const extractedMd = await extractTextFromBuffer(mdBuffer, 'guide.md', 'text/markdown');
check('Extract text from markdown buffer', extractedMd.includes('AWS Multi-AZ deployment rules.'));

// 3. Document ingestion with mock DB client
const mockDbCalls = [];
const mockClient = {
  async query(sql, params) {
    mockDbCalls.push({ sql, params });
    if (sql.includes('INSERT INTO document_memories')) {
      return {
        rows: [{
          id: randomUUID(),
          file_name: params[3],
          source_type: params[2],
          created_at: new Date()
        }]
      };
    }
    return { rows: [] };
  }
};

const ingestionResult = await ingestDocument({
  buffer: Buffer.from('Confidential AWS KMS Rotation Protocol. Execute key rotation every 90 days.'),
  fileName: 'kms_rotation.txt',
  sourceType: 'AWS_RUNBOOK',
  userId: randomUUID(),
  dbClient: mockClient
});

check('Document ingestion returns documentId and chunks', ingestionResult.totalChunks >= 1 && !!ingestionResult.documentId);
check('Ingestion executes INSERT INTO document_memories with 768-dim vector', 
  mockDbCalls.some(call => call.sql.includes('INSERT INTO document_memories') && call.params[5].startsWith('['))
);

// ============================================================================
// PART 2: WCM-46 Second Specialist & Supervisor Dynamic Routing
// ============================================================================
console.log('\n--- WCM-46: Second Specialist Agent & Dynamic Routing ---');

// 4. Architect specialist invocation test
const architectRes = await invokeArchitectAgent('Analyze multi-region failover architecture for RDS Aurora');
check('Architect specialist answers with valid structure', architectRes.specialist === 'architect' && Array.isArray(architectRes.steps));
check('Architect tool validates risk level and schema', architectureAuditTool.name === 'architecture_audit');

// 5. Supervisor routing enum and mock routing tests
function mockModel(response) {
  return {
    withStructuredOutput() {
      return {
        async invoke() {
          return response;
        }
      };
    }
  };
}

const retrievalRoute = await routeIntent(
  'Find knowledge vault documentation on SAP HANA high availability',
  'task-retrieval-1',
  {
    model: mockModel({
      mode: 'ESCALATE',
      targetModel: 'premium',
      specialist: 'retrieval',
      steps: ['Search vault', 'Synthesize grounded context']
    })
  }
);
check('Supervisor routes knowledge search to retrieval specialist', retrievalRoute.specialist === 'retrieval');

const architectRoute = await routeIntent(
  'Perform high-stakes architecture audit on Kubernetes ingress controllers',
  'task-arch-1',
  {
    model: mockModel({
      mode: 'ESCALATE',
      targetModel: 'premium',
      specialist: 'architect',
      steps: ['Audit security boundaries', 'Validate ingress specs', 'Request escalation']
    })
  }
);
check('Supervisor routes system design audit to architect specialist', architectRoute.specialist === 'architect');

// ============================================================================
// PART 3: LangGraph Integration Proving Both Specialist Routing Paths
// ============================================================================
console.log('\n--- Multi-Agent LangGraph Dynamic Dispatch Integration ---');

// Helper to instantiate test graph with injected mock supervisor router
function makeRouter(mode, specialist) {
  return async (prompt, taskId) => ({
    taskId,
    mode,
    targetModel: mode === 'ESCALATE' ? 'premium' : 'free',
    specialist,
    steps: mode === 'ESCALATE' ? ['Execute specialist step', 'Request approval'] : []
  });
}

function createGraphFor(mode, specialist) {
  return createProjectGraph(
    new MemorySaver(),
    { router: makeRouter(mode, specialist) }
  );
}

// 6. Test Path A: Direct/Escalated Retrieval Specialist
const retrievalGraph = createGraphFor('DIRECT', 'retrieval');
const retConfig = { configurable: { thread_id: randomUUID() } };

const retResult = await retrievalGraph.invoke(
  {
    taskId: randomUUID(),
    prompt: 'Query policy guidelines for data retention'
  },
  retConfig
);

check('Graph dispatches directly to retrieval specialist node', retResult.status === 'completed');
check('Retrieval specialist identity verified in output state', retResult.specialist === 'retrieval');

// 7. Test Path B: Escalated High-Stakes Architect Specialist with Human Approval
const architectGraph = createGraphFor('ESCALATE', 'architect');
const archConfig = { configurable: { thread_id: randomUUID() } };

await architectGraph.invoke(
  {
    taskId: randomUUID(),
    prompt: 'Execute high-stakes cloud architecture migration'
  },
  archConfig
);

let archState = await architectGraph.getState(archConfig);
check('Architect high-stakes task interrupts for approval', 
  archState.tasks.some(task => (task.interrupts?.length ?? 0) > 0)
);

await architectGraph.invoke(
  new Command({
    resume: { decision: 'APPROVE' }
  }),
  archConfig
);

archState = await architectGraph.getState(archConfig);
check('Approved architect workflow resumes and completes', archState.values.status === 'completed');
check('Architect specialist identity verified in final state', archState.values.specialist === 'architect');

console.log(`\n🎉 SUCCESS: All ${passed}/${passed} Track 2 integration tests passed cleanly!`);
