using System.Data;
using System.Text.Json;
using Dapper;
using Npgsql;
using RagLlm.Api.Models;

namespace RagLlm.Api.Repositories;

/// <summary>
/// Requirement #5: PostgreSQL Vector Store with pgvector extension.
/// Uses the cosine distance operator '<=>' and HNSW / IVFFlat vector indexing.
/// Cosine Similarity = 1 - (embedding <=> query_vector)
/// </summary>
public class PgVectorRepository : IVectorRepository
{
    private readonly string _connectionString;
    private readonly ILogger<PgVectorRepository> _logger;

    public PgVectorRepository(IConfiguration configuration, ILogger<PgVectorRepository> logger)
    {
        _connectionString = configuration.GetConnectionString("PostgreSql") 
            ?? "Host=localhost;Port=5432;Database=ragdb;Username=postgres;Password=postgres";
        _logger = logger;
    }

    private NpgsqlConnection CreateConnection() => new(_connectionString);

    public async Task InitializeDatabaseSchemaAsync()
    {
        using var connection = CreateConnection();
        await connection.OpenAsync();

        var sql = """
            -- Enable pgvector extension
            CREATE EXTENSION IF NOT EXISTS vector;

            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                file_name VARCHAR(255),
                department VARCHAR(100) NOT NULL,
                required_security_role VARCHAR(100) NOT NULL,
                raw_content TEXT NOT NULL,
                cleaned_content TEXT NOT NULL,
                character_count BIGINT,
                estimated_tokens INT,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS document_chunks (
                id UUID PRIMARY KEY,
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                chunk_index INT NOT NULL,
                content TEXT NOT NULL,
                character_count INT,
                token_count INT,
                department VARCHAR(100) NOT NULL,
                required_security_role VARCHAR(100) NOT NULL,
                source_title VARCHAR(255) NOT NULL,
                embedding vector(768) NOT NULL,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- HNSW index for fast sub-millisecond cosine distance approximate nearest neighbors
            CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
            ON document_chunks USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);

            CREATE INDEX IF NOT EXISTS idx_document_chunks_security 
            ON document_chunks(required_security_role, department);
        """;

        await connection.ExecuteAsync(sql);
        _logger.LogInformation("PostgreSQL pgvector schema verified and initialized.");
    }

    public async Task StoreDocumentWithChunksAsync(Document document, IReadOnlyList<DocumentChunk> chunks, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var tx = await connection.BeginTransactionAsync(cancellationToken);

        try
        {
            var insertDocSql = """
                INSERT INTO documents (id, title, file_name, department, required_security_role, raw_content, cleaned_content, character_count, estimated_tokens, created_at_utc)
                VALUES (@Id, @Title, @FileName, @Department, @RequiredSecurityRole, @RawContent, @CleanedContent, @CharacterCount, @EstimatedTokens, @CreatedAtUtc)
                ON CONFLICT (id) DO UPDATE SET 
                    title = EXCLUDED.title,
                    cleaned_content = EXCLUDED.cleaned_content;
            """;
            await connection.ExecuteAsync(insertDocSql, document, tx);

            var insertChunkSql = """
                INSERT INTO document_chunks (id, document_id, chunk_index, content, character_count, token_count, department, required_security_role, source_title, embedding, created_at_utc)
                VALUES (@Id, @DocumentId, @ChunkIndex, @Content, @CharacterCount, @TokenCount, @Department, @RequiredSecurityRole, @SourceTitle, @EmbeddingText::vector, @CreatedAtUtc)
            """;

            var chunkParams = chunks.Select(c => new
            {
                c.Id,
                c.DocumentId,
                c.ChunkIndex,
                c.Content,
                c.CharacterCount,
                c.TokenCount,
                c.Department,
                c.RequiredSecurityRole,
                c.SourceTitle,
                EmbeddingText = "[" + string.Join(",", c.Embedding) + "]",
                c.CreatedAtUtc
            });

            await connection.ExecuteAsync(insertChunkSql, chunkParams, tx);
            await tx.CommitAsync(cancellationToken);
            _logger.LogInformation("Saved document {DocId} with {Count} vector chunks to pgvector.", document.Id, chunks.Count);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<IReadOnlyList<RetrievedChunkDto>> SearchSimilarAsync(
        float[] queryEmbedding,
        int topK,
        float minSimilarityScore,
        string? departmentFilter,
        IReadOnlyList<string> userRoles,
        CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        var embeddingString = "[" + string.Join(",", queryEmbedding) + "]";

        // Requirement #6: Cosine similarity in pgvector is 1 - (embedding <=> queryVector)
        // With RBAC security role and optional department filters
        var sql = """
            SELECT 
                dc.id AS ChunkId,
                dc.document_id AS DocumentId,
                dc.source_title AS DocumentTitle,
                dc.chunk_index AS ChunkIndex,
                dc.content AS Content,
                (1 - (dc.embedding <=> @QueryEmbedding::vector)) AS SimilarityScore,
                dc.required_security_role AS SecurityRole,
                dc.department AS Department
            FROM document_chunks dc
            WHERE (@DepartmentFilter IS NULL OR dc.department = @DepartmentFilter)
              AND (
                  dc.required_security_role = 'Public' 
                  OR dc.required_security_role = ANY(@AllowedRoles)
              )
              AND (1 - (dc.embedding <=> @QueryEmbedding::vector)) >= @MinScore
            ORDER BY dc.embedding <=> @QueryEmbedding::vector ASC
            LIMIT @TopK;
        """;

        var parameters = new
        {
            QueryEmbedding = embeddingString,
            MinScore = minSimilarityScore,
            TopK = topK,
            DepartmentFilter = string.IsNullOrWhiteSpace(departmentFilter) ? null : departmentFilter,
            AllowedRoles = userRoles.ToArray()
        };

        var results = await connection.QueryAsync<RetrievedChunkDto>(sql, parameters);
        return results.ToList();
    }

    public async Task<IReadOnlyList<Document>> GetAllDocumentsAsync(CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        var sql = "SELECT id, title, file_name AS FileName, department, required_security_role AS RequiredSecurityRole, character_count AS CharacterCount, estimated_tokens AS EstimatedTokens, created_at_utc AS CreatedAtUtc FROM documents ORDER BY created_at_utc DESC;";
        var docs = await connection.QueryAsync<Document>(sql);
        return docs.ToList();
    }

    public async Task<Document?> GetDocumentByIdAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        var sql = "SELECT * FROM documents WHERE id = @Id;";
        return await connection.QuerySingleOrDefaultAsync<Document>(sql, new { Id = documentId });
    }

    public async Task<bool> DeleteDocumentAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        var affected = await connection.ExecuteAsync("DELETE FROM documents WHERE id = @Id;", new { Id = documentId });
        return affected > 0;
    }

    public async Task<int> GetTotalChunksCountAsync(CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        return await connection.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM document_chunks;");
    }
}
