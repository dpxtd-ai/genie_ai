using System.Collections.Concurrent;
using RagLlm.Api.Models;
using RagLlm.Api.Services;

namespace RagLlm.Api.Repositories;

/// <summary>
/// High-performance in-memory vector store with SIMD/Cosine dot product calculation.
/// Ideal for rapid prototyping, unit tests, and development without database dependencies.
/// </summary>
public class InMemoryVectorRepository : IVectorRepository
{
    private readonly ConcurrentDictionary<Guid, Document> _documents = new();
    private readonly ConcurrentDictionary<Guid, DocumentChunk> _chunks = new();
    private readonly ILogger<InMemoryVectorRepository> _logger;

    public InMemoryVectorRepository(ILogger<InMemoryVectorRepository> logger)
    {
        _logger = logger;
    }

    public Task StoreDocumentWithChunksAsync(Document document, IReadOnlyList<DocumentChunk> chunks, CancellationToken cancellationToken = default)
    {
        _documents[document.Id] = document;
        foreach (var chunk in chunks)
        {
            _chunks[chunk.Id] = chunk;
        }

        _logger.LogInformation("Stored document {Title} ({Id}) with {Count} chunks in memory vector store.", 
            document.Title, document.Id, chunks.Count);

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<RetrievedChunkDto>> SearchSimilarAsync(
        float[] queryEmbedding,
        int topK,
        float minSimilarityScore,
        string? departmentFilter,
        IReadOnlyList<string> userRoles,
        CancellationToken cancellationToken = default)
    {
        var matched = new List<RetrievedChunkDto>();

        foreach (var chunk in _chunks.Values)
        {
            // Department metadata filter
            if (!string.IsNullOrEmpty(departmentFilter) && 
                !string.Equals(chunk.Department, departmentFilter, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            // Security role filter (RBAC)
            bool isAllowed = string.Equals(chunk.RequiredSecurityRole, "Public", StringComparison.OrdinalIgnoreCase) ||
                             userRoles.Any(r => string.Equals(r, chunk.RequiredSecurityRole, StringComparison.OrdinalIgnoreCase));

            if (!isAllowed) continue;

            // Cosine similarity
            float score = EmbeddingService.CosineSimilarity(queryEmbedding, chunk.Embedding);
            if (score >= minSimilarityScore)
            {
                matched.Add(new RetrievedChunkDto
                {
                    ChunkId = chunk.Id,
                    DocumentId = chunk.DocumentId,
                    DocumentTitle = chunk.SourceTitle,
                    ChunkIndex = chunk.ChunkIndex,
                    Content = chunk.Content,
                    SimilarityScore = (float)Math.Round(score, 4),
                    SecurityRole = chunk.RequiredSecurityRole,
                    Department = chunk.Department
                });
            }
        }

        var topResults = matched
            .OrderByDescending(m => m.SimilarityScore)
            .Take(topK)
            .ToList();

        return Task.FromResult<IReadOnlyList<RetrievedChunkDto>>(topResults);
    }

    public Task<IReadOnlyList<Document>> GetAllDocumentsAsync(CancellationToken cancellationToken = default)
    {
        var list = _documents.Values.OrderByDescending(d => d.CreatedAtUtc).ToList();
        return Task.FromResult<IReadOnlyList<Document>>(list);
    }

    public Task<Document?> GetDocumentByIdAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        return Task.FromResult(doc);
    }

    public Task<bool> DeleteDocumentAsync(Guid documentId, CancellationToken cancellationToken = default)
    {
        var removed = _documents.TryRemove(documentId, out _);
        if (removed)
        {
            var chunkKeys = _chunks.Where(kvp => kvp.Value.DocumentId == documentId).Select(kvp => kvp.Key).ToList();
            foreach (var key in chunkKeys)
            {
                _chunks.TryRemove(key, out _);
            }
        }
        return Task.FromResult(removed);
    }

    public Task<int> GetTotalChunksCountAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_chunks.Count);
    }
}
