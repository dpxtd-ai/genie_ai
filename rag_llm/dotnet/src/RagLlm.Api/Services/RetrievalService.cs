using System.Diagnostics;
using RagLlm.Api.Models;
using RagLlm.Api.Repositories;

namespace RagLlm.Api.Services;

public interface IRetrievalService
{
    /// <summary>
    /// Requirement #6: Embeds user query and runs similarity search with metadata & security filters.
    /// </summary>
    Task<RetrievalResult> RetrieveRelevantChunksAsync(
        string question,
        float minSimilarityScore = 0.55f,
        int topK = 4,
        string? departmentFilter = null,
        IReadOnlyList<string>? userRoles = null,
        CancellationToken cancellationToken = default);
}

public record RetrievalResult
{
    public required string Question { get; init; }
    public float[] QueryEmbedding { get; init; } = Array.Empty<float>();
    public IReadOnlyList<RetrievedChunkDto> RelevantChunks { get; init; } = Array.Empty<RetrievedChunkDto>();
    public double EmbeddingDurationMs { get; init; }
    public double SearchDurationMs { get; init; }
    public bool HasContext => RelevantChunks.Count > 0;
}

public class RetrievalService : IRetrievalService
{
    private readonly IEmbeddingService _embeddingService;
    private readonly IVectorRepository _vectorRepository;
    private readonly ILogger<RetrievalService> _logger;

    public RetrievalService(
        IEmbeddingService embeddingService,
        IVectorRepository vectorRepository,
        ILogger<RetrievalService> logger)
    {
        _embeddingService = embeddingService;
        _vectorRepository = vectorRepository;
        _logger = logger;
    }

    public async Task<RetrievalResult> RetrieveRelevantChunksAsync(
        string question,
        float minSimilarityScore = 0.55f,
        int topK = 4,
        string? departmentFilter = null,
        IReadOnlyList<string>? userRoles = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(question);

        var roles = userRoles ?? new[] { "Public" };

        var sw = Stopwatch.StartNew();
        // 1. Convert user question to vector embedding
        var queryEmbedding = await _embeddingService.GenerateEmbeddingAsync(question, cancellationToken);
        var embeddingMs = sw.Elapsed.TotalMilliseconds;

        // 2. Perform similarity search in Vector Store with pgvector / SQL Server and RBAC filters
        sw.Restart();
        var chunks = await _vectorRepository.SearchSimilarAsync(
            queryEmbedding,
            topK,
            minSimilarityScore,
            departmentFilter,
            roles,
            cancellationToken);
        var searchMs = sw.Elapsed.TotalMilliseconds;

        _logger.LogInformation(
            "Query: '{Question}' | Chunks Found: {Count} | MinScore: {MinScore} | Roles: [{Roles}] | EmbedMs: {EmbedMs:F1} | SearchMs: {SearchMs:F1}",
            question, chunks.Count, minSimilarityScore, string.Join(", ", roles), embeddingMs, searchMs);

        return new RetrievalResult
        {
            Question = question,
            QueryEmbedding = queryEmbedding,
            RelevantChunks = chunks,
            EmbeddingDurationMs = embeddingMs,
            SearchDurationMs = searchMs
        };
    }
}
