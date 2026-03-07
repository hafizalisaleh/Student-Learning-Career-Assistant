-- Migration: Add PGVector extension and chunks table for document embeddings
-- Replaces ChromaDB with PostgreSQL-native vector search

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create chunks table for storing document embeddings
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(384),
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    token_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON chunks (document_id, chunk_index);

-- IVFFlat index for vector similarity search
-- NOTE: lists=1 is safe for small datasets. Increase to sqrt(row_count) for larger datasets.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(384),
    match_count INT DEFAULT 10,
    filter_document_id UUID DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    content TEXT,
    similarity FLOAT,
    metadata JSONB,
    chunk_index INTEGER,
    token_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS chunk_id,
        c.document_id,
        c.content,
        1 - (c.embedding <=> query_embedding) AS similarity,
        c.metadata,
        c.chunk_index,
        c.token_count
    FROM chunks c
    WHERE c.embedding IS NOT NULL
      AND (filter_document_id IS NULL OR c.document_id = filter_document_id)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
