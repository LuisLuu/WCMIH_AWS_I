CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS document_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    source_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    s3_key TEXT,
    content_chunk TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_memories_embedding 
ON document_memories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_document_memories_user_id 
ON document_memories(user_id);
