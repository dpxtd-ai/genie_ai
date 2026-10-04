-- =========================================================================
-- PostgreSQL with pgvector Initialization Script
-- Supports cosine distance operator (<=>), HNSW indexing, and RBAC security filtering
-- =========================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Master Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    department VARCHAR(100) NOT NULL DEFAULT 'General',
    required_security_role VARCHAR(100) NOT NULL DEFAULT 'Public',
    raw_content TEXT NOT NULL,
    cleaned_content TEXT NOT NULL,
    character_count BIGINT NOT NULL,
    estimated_tokens INT NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Document Chunks with Vector Embeddings Table
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    character_count INT NOT NULL,
    token_count INT NOT NULL,
    department VARCHAR(100) NOT NULL DEFAULT 'General',
    required_security_role VARCHAR(100) NOT NULL DEFAULT 'Public',
    source_title VARCHAR(255) NOT NULL,
    -- 768 dimensions for Gemini embedding / 1536 for OpenAI embedding
    embedding vector(768) NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. HNSW Vector Index for Sub-millisecond Cosine Similarity Search
-- (m = 16, ef_construction = 64 provides high recall and low search latency)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
ON document_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 5. Composite index for metadata and RBAC security filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_sec_dept 
ON document_chunks (required_security_role, department);

-- 6. Example Query: Cosine Similarity with RBAC & Department Filter
-- SELECT 
--     dc.id AS ChunkId,
--     dc.source_title AS DocumentTitle,
--     dc.content AS Content,
--     (1.0 - (dc.embedding <=> @QueryVector::vector)) AS SimilarityScore
-- FROM document_chunks dc
-- WHERE (dc.required_security_role = 'Public' OR dc.required_security_role = ANY(@UserRoles))
--   AND (1.0 - (dc.embedding <=> @QueryVector::vector)) >= 0.55
-- ORDER BY dc.embedding <=> @QueryVector::vector ASC
-- LIMIT 4;
