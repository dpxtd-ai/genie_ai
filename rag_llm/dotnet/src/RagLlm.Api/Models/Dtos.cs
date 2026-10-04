namespace RagLlm.Api.Models;

public record IngestDocumentRequest
{
    public required string Title { get; init; }
    public required string Content { get; init; }
    public string FileName { get; init; } = "document.txt";
    public string Department { get; init; } = "General";
    public string RequiredSecurityRole { get; init; } = "Public";
    public int ChunkSize { get; init; } = 400; // In characters or approximate tokens
    public int ChunkOverlap { get; init; } = 80;
}

public record UploadFileDocumentRequest
{
    public required string FileName { get; init; }
    public string? Base64Data { get; init; }
    public string? RawText { get; init; }
    public string? Title { get; init; }
    public string Department { get; init; } = "General";
    public string RequiredSecurityRole { get; init; } = "Public";
}

public record IngestDocumentResponse
{
    public Guid DocumentId { get; init; }
    public string Title { get; init; } = string.Empty;
    public int ChunksCreated { get; init; }
    public int TotalTokens { get; init; }
    public long CleanedLength { get; init; }
    public TimeSpan ProcessingDuration { get; init; }
    public List<ChunkSummaryDto> SampleChunks { get; init; } = new();
}

public record ChunkSummaryDto
{
    public Guid ChunkId { get; init; }
    public int Index { get; init; }
    public string Preview { get; init; } = string.Empty;
    public int TokenCount { get; init; }
    public int EmbeddingDimensions { get; init; }
}

public record RagQueryRequest
{
    public required string Question { get; init; }
    public float MinSimilarityScore { get; init; } = 0.55f; // Threshold for cosine similarity
    public int TopK { get; init; } = 4;
    public string? DepartmentFilter { get; init; }
    public List<string> UserRoles { get; init; } = new() { "Public" }; // Role claims for RBAC
    public bool IncludeDebugTraces { get; init; } = true;
}

public record RagQueryResponse
{
    public string Question { get; init; } = string.Empty;
    public string Answer { get; init; } = string.Empty;
    
    /// <summary>
    /// Critical Requirement #7: True if context chunks were found and used; False if vector search returned no chunks above threshold and the raw input text was sent directly to the LLM.
    /// </summary>
    public bool ContextFound { get; init; }
    
    public string ExecutionMode { get; init; } = string.Empty; // "RetrievalAugmented" or "DirectLlmFallback"
    public int RetrievedChunksCount { get; init; }
    public List<RetrievedChunkDto> Sources { get; init; } = new();
    public List<CitationDto> Citations { get; init; } = new();
    
    /// <summary>
    /// Requirement #8: Validation summary checking groundedness and citation consistency
    /// </summary>
    public ValidationReportDto Validation { get; init; } = new();

    public QueryMetricsDto Metrics { get; init; } = new();
}

public record RetrievedChunkDto
{
    public Guid ChunkId { get; init; }
    public Guid DocumentId { get; init; }
    public string DocumentTitle { get; init; } = string.Empty;
    public int ChunkIndex { get; init; }
    public string Content { get; init; } = string.Empty;
    public float SimilarityScore { get; init; } // Cosine similarity: 0.0 to 1.0
    public string SecurityRole { get; init; } = "Public";
    public string Department { get; init; } = "General";
}

public record CitationDto
{
    public string CitationLabel { get; init; } = string.Empty; // e.g., "[Doc: Title #1]"
    public Guid ChunkId { get; init; }
    public string DocumentTitle { get; init; } = string.Empty;
    public string CitedSnippet { get; init; } = string.Empty;
    public float SimilarityScore { get; init; }
}

public record ValidationReportDto
{
    public bool IsGroundedInSources { get; init; }
    public double GroundednessConfidence { get; init; } // 0.0 - 1.0
    public int CitedSourceCount { get; init; }
    public List<string> ValidationWarnings { get; init; } = new();
    public bool FallbackModeTriggered { get; init; }
}

public record QueryMetricsDto
{
    public double EmbeddingTimeMs { get; init; }
    public double VectorSearchTimeMs { get; init; }
    public double LlmInferenceTimeMs { get; init; }
    public double ValidationTimeMs { get; init; }
    public double TotalDurationMs { get; init; }
    public int ContextTokenCount { get; init; }
}
