using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using RagLlm.Api.Models;

namespace RagLlm.Api.Repositories;

/// <summary>
/// Requirement #5: SQL Server 2025 / Azure SQL Vector Search.
/// Uses native VECTOR(768) type and VECTOR_DISTANCE('cosine', Embedding, @queryVector).
/// Cosine Similarity = 1.0 - VECTOR_DISTANCE('cosine', Embedding, CAST(@queryVector AS VECTOR(768)))
/// </summary>
public class SqlServerVectorRepository : IVectorRepository
{
    private readonly string _connectionString;
    private readonly ILogger<SqlServerVectorRepository> _logger;

    public SqlServerVectorRepository(IConfiguration configuration, ILogger<SqlServerVectorRepository> logger)
    {
        _connectionString = configuration.GetConnectionString("SqlServer") 
            ?? "Server=localhost,1433;Database=RagDb;User Id=sa;Password=Your_Strong_Password123!;TrustServerCertificate=True;";
        _logger = logger;
    }

    private SqlConnection CreateConnection() => new(_connectionString);

    public async Task InitializeDatabaseSchemaAsync()
    {
        using var connection = CreateConnection();
        await connection.OpenAsync();

        var sql = """
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Documents')
            BEGIN
                CREATE TABLE Documents (
                    Id UNIQUEIDENTIFIER PRIMARY KEY,
                    Title NVARCHAR(255) NOT NULL,
                    FileName NVARCHAR(255),
                    Department NVARCHAR(100) NOT NULL,
                    RequiredSecurityRole NVARCHAR(100) NOT NULL,
                    RawContent NVARCHAR(MAX) NOT NULL,
                    CleanedContent NVARCHAR(MAX) NOT NULL,
                    CharacterCount BIGINT,
                    EstimatedTokens INT,
                    CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                );
            END

            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DocumentChunks')
            BEGIN
                CREATE TABLE DocumentChunks (
                    Id UNIQUEIDENTIFIER PRIMARY KEY,
                    DocumentId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES Documents(Id) ON DELETE CASCADE,
                    ChunkIndex INT NOT NULL,
                    Content NVARCHAR(MAX) NOT NULL,
                    CharacterCount INT,
                    TokenCount INT,
                    Department NVARCHAR(100) NOT NULL,
                    RequiredSecurityRole NVARCHAR(100) NOT NULL,
                    SourceTitle NVARCHAR(255) NOT NULL,
                    -- SQL Server 2025 native vector column
                    Embedding VECTOR(768) NOT NULL,
                    CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
                );

                CREATE INDEX IX_DocumentChunks_Metadata ON DocumentChunks(RequiredSecurityRole, Department);
            END
        """;

        await connection.ExecuteAsync(sql);
        _logger.LogInformation("SQL Server Vector Search schema verified and initialized.");
    }

    public async Task StoreDocumentWithChunksAsync(Document document, IReadOnlyList<DocumentChunk> chunks, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var tx = connection.BeginTransaction();

        try
        {
            var insertDocSql = """
                MERGE INTO Documents AS target
                USING (SELECT @Id AS Id) AS source
                ON (target.Id = source.Id)
                WHEN MATCHED THEN
                    UPDATE SET Title = @Title, CleanedContent = @CleanedContent
                WHEN NOT MATCHED THEN
                    INSERT (Id, Title, FileName, Department, RequiredSecurityRole, RawContent, CleanedContent, CharacterCount, EstimatedTokens, CreatedAtUtc)
                    VALUES (@Id, @Title, @FileName, @Department, @RequiredSecurityRole, @RawContent, @CleanedContent, @CharacterCount, @EstimatedTokens, @CreatedAtUtc);
            """;
            await connection.ExecuteAsync(insertDocSql, document, tx);

            var insertChunkSql = """
                INSERT INTO DocumentChunks (Id, DocumentId, ChunkIndex, Content, CharacterCount, TokenCount, Department, RequiredSecurityRole, SourceTitle, Embedding, CreatedAtUtc)
                VALUES (@Id, @DocumentId, @ChunkIndex, @Content, @CharacterCount, @TokenCount, @Department, @RequiredSecurityRole, @SourceTitle, CAST(@EmbeddingJson AS VECTOR(768)), @CreatedAtUtc);
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
                EmbeddingJson = "[" + string.Join(",", c.Embedding) + "]",
                c.CreatedAtUtc
            });

            await connection.ExecuteAsync(insertChunkSql, chunkParams, tx);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
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

        var embeddingJson = "[" + string.Join(",", queryEmbedding) + "]";

        // Requirement #6: SQL Server 2025 native VECTOR_DISTANCE cosine function
        var sql = """
            SELECT TOP (@TopK)
                dc.Id AS ChunkId,
                dc.DocumentId AS DocumentId,
                dc.SourceTitle AS DocumentTitle,
                dc.ChunkIndex AS ChunkIndex,
                dc.Content AS Content,
                CAST(1.0 - VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbedding AS VECTOR(768))) AS REAL) AS SimilarityScore,
                dc.RequiredSecurityRole AS SecurityRole,
                dc.Department AS Department
            FROM DocumentChunks dc
            WHERE (@DepartmentFilter IS NULL OR dc.Department = @DepartmentFilter)
              AND (
                  dc.RequiredSecurityRole = 'Public' 
                  OR dc.RequiredSecurityRole IN @AllowedRoles
              )
              AND (1.0 - VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbedding AS VECTOR(768)))) >= @MinScore
            ORDER BY VECTOR_DISTANCE('cosine', dc.Embedding, CAST(@QueryEmbedding AS VECTOR(768))) ASC;
        """;

        var parameters = new
        {
            QueryEmbedding = embeddingJson,
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
        var sql = "SELECT Id, Title, FileName, Department, RequiredSecurityRole, CharacterCount, EstimatedTokens, CreatedAtUtc FROM Documents ORDER BY CreatedAtUtc DESC;";
        var docs = await connection.QueryAsync<Document>(sql);
        return docs.ToList();
    }

    public async Task<Document?> GetDocumentByIdAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        var sql = "SELECT * FROM Documents WHERE Id = @Id;";
        return await connection.QuerySingleOrDefaultAsync<Document>(sql, new { Id = documentId });
    }

    public async Task<bool> DeleteDocumentAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        var affected = await connection.ExecuteAsync("DELETE FROM Documents WHERE Id = @Id;", new { Id = documentId });
        return affected > 0;
    }

    public async Task<int> GetTotalChunksCountAsync(CancellationToken cancellationToken = default)
    {
        using var connection = CreateConnection();
        return await connection.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM DocumentChunks;");
    }
}
