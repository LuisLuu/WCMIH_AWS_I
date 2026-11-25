import 'dotenv/config';
import { invokeRetrievalAgent } from '../src/agents/graph.js';

console.log('🔍 Testing WCM-38 RAG Agent...\n');

const result = await invokeRetrievalAgent(
  'What is the SAP HANA high availability configuration?'
);

console.log('=== ANSWER ===');
console.log(result.answer);

console.log('\n=== SOURCES ===');
result.sources.forEach(s => console.log(' -', s));

console.log(`\n=== CHUNKS RETRIEVED: ${result.rawChunks.length} ===`);
result.rawChunks.forEach(c =>
  console.log(`  [sim: ${Number(c.similarity).toFixed(3)}] ${c.file_name}`)
);
