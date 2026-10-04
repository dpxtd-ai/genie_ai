-- =========================================================================
-- Microsoft SQL Server 2025 / Azure SQL Native Vector Search Schema
-- Supports native VECTOR(768) type and VECTOR_DISTANCE('cosine', ...) function
-- =========================================================================

-- 1. Master Documents Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Documents')
BEGIN
    CREATE TABLE Documents (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Title NVARCHAR(255) NOT NULL,
        FileName NVARCHAR(255) NULL,
        Department NVARCHAR(100) NOT NULL DEFAULT 'General',
        RequiredSecurityRole NVARCHAR(100) NOT NULL DEFAULT 'Public',
        RawContent NVARCHAR(MAX) NOT NULL,
        CleanedContent NVARCHAR(MAX) NOT NULL,
        CharacterCount BIGINT NOT NULL,
        EstimatedTokens INT NOT NULL,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 2. Document Chunks Table with Native Vector Type
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DocumentChunks')
BEGIN
    CREATE TABLE DocumentChunks (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        DocumentId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Documents(Id) ON DELETE CASCADE,
        ChunkIndex INT NOT NULL,
        Content NVARCHAR(MAX) NOT NULL,
        CharacterCount INT NOT NULL,
        TokenCount INT NOT NULL,
        Department NVARCHAR(100) NOT NULL DEFAULT 'General',
        RequiredSecurityRole NVARCHAR(100) NOT NULL DEFAULT 'Public',
        SourceTitle NVARCHAR(255) NOT NULL,
        -- SQL Server 2025 native VECTOR type
        Embedding VECTOR(768) NOT NULL,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE NONCLUSTERED INDEX IX_DocumentChunks_SecurityDept 
    ON DocumentChunks (RequiredSecurityRole, Department);
END
GO

-- 3. Example Query: Cosine Distance Search with Security Filter
-- SELECT TOP 4
--     dc.Id AS ChunkId,
--     dc.SourceTitle AS DocumentTitle,
--     dc.Content AS Content,
--     CAST(1.0 - VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbeddingJson AS VECTOR(768))) AS REAL) AS SimilarityScore
-- FROM DocumentChunks dc
-- WHERE (dc.RequiredSecurityRole = 'Public' OR dc.RequiredSecurityRole IN ('InternalEmployee', 'Admin'))
--   AND (1.0 - VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbeddingJson AS VECTOR(768)))) >= 0.55
-- ORDER BY VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbeddingJson AS VECTOR(768))) ASC;
