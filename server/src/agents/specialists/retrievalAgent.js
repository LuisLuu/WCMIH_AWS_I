/**
 * retrievalAgent.js
 * -----------------
 * WCM-38 — Enterprise Retrieval Specialist Agent
 *
 * Implements a simple RAG (Retrieval-Augmented Generation) pattern:
 *   1. Embed the user query (mock or real)
 *   2. Search the Vector Knowledge Vault via pgvector
 *   3. Build a grounded context string
 *   4. Ask the LLM to synthesise an answer citing sources
 *
 * Compatible with MOCK_AGENTS=true (no API keys required).
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getModelAdapter } from '../../config/models.js';
import { searchKnowledgeVault, generateMockEmbedding } from '../../db/queries/vectorSearch.js';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an Enterprise Knowledge Retrieval Specialist. \
You have access to a Vector Knowledge Vault containing SAP architecture docs, \
AWS runbooks, and company policies. Answer questions using ONLY the provided \
context. If the context doesn't contain enough information, say so clearly. \
Always cite your sources by file_name.`;

// ---------------------------------------------------------------------------
// LangChain Tool: vector_vault_search
// ---------------------------------------------------------------------------

/**
 * LangChain tool that embeds a query and returns ranked document chunks from
 * the Vector Knowledge Vault.
 *
 * Schema:
 *   - query       {string}           Natural-language question or keyword string
 *   - source_type {string?}          Optional filter (e.g. 'SAP_ARCHITECTURE')
 *   - limit       {number, default=5} Max results to retrieve
 */
const vectorVaultSearchTool = tool(
  async ({ query, source_type, limit }) => {
    // 1. Generate the query embedding
    let queryEmbedding;

    if (process.env.MOCK_AGENTS === 'true') {
      // Deterministic mock embedding — matches the WCM-37 seeder approach
      queryEmbedding = generateMockEmbedding(query);
    } else {
      // ── Real embedding (swap this block to use a live embedding API) ──
      // Example with OpenAI:
      //   const { OpenAIEmbeddings } = await import('@langchain/openai');
      //   const embedder = new OpenAIEmbeddings({ model: 'text-embedding-ada-002' });
      //   queryEmbedding = await embedder.embedQuery(query);
      //
      // Example with Google GenAI (768-dim — pad to 1536 before passing):
      //   const { GoogleGenerativeAIEmbeddings } = await import('@langchain/google-genai');
      //   const embedder = new GoogleGenerativeAIEmbeddings({ model: 'embedding-001' });
      //   const raw = await embedder.embedQuery(query);
      //   queryEmbedding = [...raw, ...new Array(1536 - raw.length).fill(0)];
      //
      // For now, fall back to mock so the tool never hard-crashes without keys.
      console.warn('[vectorVaultSearchTool] No real embedding provider configured — falling back to mock embedding.');
      queryEmbedding = generateMockEmbedding(query);
    }

    // 2. Search the vault
    const rows = await searchKnowledgeVault(queryEmbedding, {
      limit,
      sourceType: source_type ?? null,
    });

    if (rows.length === 0) {
      return 'No relevant documents found in the Knowledge Vault for this query.';
    }

    // 3. Format results as a readable string for the LLM context window
    const formatted = rows
      .map((row, idx) => {
        const sim = typeof row.similarity === 'number'
          ? row.similarity.toFixed(4)
          : 'n/a';
        return [
          `[${idx + 1}] File: ${row.file_name} | Type: ${row.source_type} | Similarity: ${sim}`,
          row.content_chunk,
        ].join('\n');
      })
      .join('\n\n---\n\n');

    return formatted;
  },
  {
    name: 'vector_vault_search',
    description:
      'Search the Enterprise Vector Knowledge Vault for documents similar to the query. ' +
      'Returns ranked document chunks with similarity scores. ' +
      'Optionally filter by source_type (SAP_ARCHITECTURE | AWS_RUNBOOK | COMPANY_POLICY | AI_ML_GOVERNANCE).',
    schema: z.object({
      query: z.string().describe('Natural-language question or keyword string to search for'),
      source_type: z
        .string()
        .optional()
        .describe('Optional source category filter (e.g. SAP_ARCHITECTURE, AWS_RUNBOOK)'),
      limit: z
        .number()
        .int()
        .default(5)
        .describe('Maximum number of document chunks to return (default: 5)'),
    }),
  }
);

// ---------------------------------------------------------------------------
// invokeRetrievalAgent — the main entry point
// ---------------------------------------------------------------------------

/**
 * Invokes the RAG retrieval agent for a given user query.
 *
 * Simple RAG pattern (no ReAct loop):
 *   embed → retrieve → build context → LLM synthesise → return structured result
 *
 * @param {string} userQuery - The question or retrieval request.
 * @param {object} options
 * @param {string|null} [options.sourceType=null]  - Optional source_type filter.
 * @param {string|null} [options.userId=null]       - Optional user_id filter.
 * @param {number}      [options.limit=5]           - Max chunks to retrieve.
 *
 * @returns {Promise<{ answer: string, sources: string[], rawChunks: object[] }>}
 */
export async function invokeRetrievalAgent(userQuery, options = {}) {
  const { sourceType = null, userId = null, limit = 5 } = options;

  // ── Step 1: Generate query embedding ──────────────────────────────────────
  let queryEmbedding;
  if (process.env.MOCK_AGENTS === 'true') {
    queryEmbedding = generateMockEmbedding(userQuery);
  } else {
    // See vectorVaultSearchTool above for real embedding provider examples.
    console.warn('[invokeRetrievalAgent] No real embedding provider configured — using mock embedding.');
    queryEmbedding = generateMockEmbedding(userQuery);
  }

  // ── Step 2: Search the Knowledge Vault ────────────────────────────────────
  let rawChunks = [];
  try {
    rawChunks = await searchKnowledgeVault(queryEmbedding, { limit, userId, sourceType });
  } catch (dbErr) {
    console.warn("[invokeRetrievalAgent] Knowledge Vault search warning:", dbErr.message);
    rawChunks = [];
  }

  // ── Step 3: Build context string ──────────────────────────────────────────
  let contextString;
  let sources = [];

  if (rawChunks.length === 0) {
    contextString = 'No relevant documents were found in the Knowledge Vault.';
  } else {
    sources = [...new Set(rawChunks.map((r) => r.file_name))];

    contextString = rawChunks
      .map((row, idx) => {
        const sim = typeof row.similarity === 'number'
          ? row.similarity.toFixed(4)
          : 'n/a';
        return (
          `[Document ${idx + 1}]\n` +
          `File: ${row.file_name}\n` +
          `Type: ${row.source_type}\n` +
          `Similarity: ${sim}\n` +
          `Content:\n${row.content_chunk}`
        );
      })
      .join('\n\n---\n\n');
  }

  // ── Step 4: Call the LLM ──────────────────────────────────────────────────
  const model = getModelAdapter();

  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Context from the Knowledge Vault:\n\n${contextString}\n\n` +
      `User question: ${userQuery}`
    ),
  ];

  let answer;
  try {
    const response = await model.invoke(messages);

    // MockDriver._call() returns a plain string; real LangChain models return
    // an AIMessage object — handle both gracefully.
    if (typeof response === 'string') {
      answer = response;
    } else if (response?.content != null) {
      answer = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    } else {
      answer = String(response);
    }
  } catch (err) {
    // Degrade gracefully so the caller still gets a structured response
    console.error('[invokeRetrievalAgent] LLM invocation failed:', err.message);
    answer = `[LLM Error] ${err.message}. Retrieved ${rawChunks.length} document chunk(s) from the vault (see rawChunks).`;
  }

  // ── Step 5: Return structured result ──────────────────────────────────────
  return {
    answer,
    sources,
    rawChunks,
  };
}

// ---------------------------------------------------------------------------
// Named exports
// ---------------------------------------------------------------------------
export { vectorVaultSearchTool };
