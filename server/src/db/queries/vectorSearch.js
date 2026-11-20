import pg from 'pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/37_38_WCM',
});

export async function generateMockEmbedding(queryInput) {
  let queryText = "";
  if (typeof queryInput === 'string') {
    queryText = queryInput;
  } else if (queryInput && typeof queryInput === 'object') {
    queryText = queryInput.query || queryInput.text || JSON.stringify(queryInput);
  } else {
    queryText = String(queryInput || '');
  }

  const dim = 768;
  const vector = new Array(dim);
  let seed = queryText.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  for (let i = 0; i < dim; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    vector[i] = (seed / 233280) * 2 - 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / (norm || 1));
}

export async function searchKnowledgeVault(queryText, options = {}) {
  const queryEmbedding = await generateMockEmbedding(queryText);
  const vectorString = '[' + queryEmbedding.join(',') + ']';

  const client = await pool.connect();
  try {
    const limit = options.limit || 5;
    // Dùng SELECT * và tính similarity tránh lỗi thiếu cột cụ thể
    const query = `
      SELECT *, 1 - (embedding <=> $1::vector) AS similarity
      FROM document_memories
      ORDER BY embedding <=> $1::vector
      LIMIT $2;
    `;
    const result = await client.query(query, [vectorString, limit]);
    return result.rows;
  } finally {
    client.release();
  }
}
