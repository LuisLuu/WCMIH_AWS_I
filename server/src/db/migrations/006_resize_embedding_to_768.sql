-- Migration 006: Resize embedding column from 1536 → 768 dims
-- Reason: Google GenAI text-embedding-004 outputs 768-dimensional vectors.
-- Since all existing data is mock-seeded, we safely truncate and resize.

-- Step 1: Drop the HNSW index (required before column type change)
DROP INDEX IF EXISTS idx_document_memories_embedding;

-- Step 2: Clear mock-embedded rows — they will be re-seeded with real embeddings
TRUNCATE TABLE document_memories;

-- Step 3: Resize the column
ALTER TABLE document_memories
  ALTER COLUMN embedding TYPE vector(768);

-- Step 4: Recreate HNSW index for 768-dim cosine search
CREATE INDEX idx_document_memories_embedding
ON document_memories USING hnsw (embedding vector_cosine_ops);
