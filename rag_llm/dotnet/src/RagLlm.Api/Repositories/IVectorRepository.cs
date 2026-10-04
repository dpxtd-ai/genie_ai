using RagLlm.Api.Models;

namespace RagLlm.Api.Repositories;

public interface IVectorRepository
{
    Task StoreDocumentWithChunksAsync(Document document, IReadOnlyList<DocumentChunk> chunks, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Requirement #5 & #6: Queries the vector store with cosine similarity, metadata filtering, and RBAC security filtering.
    /// </summary>
    Task<IReadOnlyList<RetrievedChunkDto>> SearchSimilarAsync(
        float[] queryEmbedding,
        int topK,
        float minSimilarityScore,
        string? departmentFilter,
        IReadOnlyList<string> userRoles,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Document>> GetAllDocumentsAsync(CancellationToken cancellationToken = default);
    Task<Document?> GetDocumentByIdAsync(Guid documentId, CancellationToken cancellationToken = default);
    Task<bool> DeleteDocumentAsync(Guid documentId, CancellationToken cancellationToken = default);
    Task<int> GetTotalChunksCountAsync(CancellationToken cancellationToken = default);
}
