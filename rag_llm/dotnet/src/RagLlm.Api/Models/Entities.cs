namespace RagLlm.Api.Models;

/// <summary>
/// Represents an ingested source document (PDF, DOCX, TXT, Markdown).
/// </summary>
public class Document
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "text/plain";
    public string RawContent { get; set; } = string.Empty;
    public string CleanedContent { get; set; } = string.Empty;
    public long CharacterCount { get; set; }
    public int EstimatedTokens { get; set; }
    public string Department { get; set; } = "General";
    public string RequiredSecurityRole { get; set; } = "Public"; // e.g. "Public", "InternalEmployee", "ConfidentialAdmin"
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAtUtc { get; set; }

    public ICollection<DocumentChunk> Chunks { get; set; } = new List<DocumentChunk>();
}

/// <summary>
/// A granular chunk of text extracted from a Document, coupled with its vector embedding.
/// </summary>
public class DocumentChunk
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public Document? Document { get; set; }

    public int ChunkIndex { get; set; }
    public string Content { get; set; } = string.Empty;
    public int CharacterCount { get; set; }
    public int TokenCount { get; set; }
    
    // Metadata for filtering
    public string Department { get; set; } = "General";
    public string RequiredSecurityRole { get; set; } = "Public";
    public string SourceTitle { get; set; } = string.Empty;

    // Vector embedding representation (e.g. 768 or 1536 float dimensions)
    public float[] Embedding { get; set; } = Array.Empty<float>();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Caller security context for access control and RBAC filtering during vector retrieval.
/// </summary>
public class UserSecurityContext
{
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public List<string> Roles { get; set; } = new();
    public string Department { get; set; } = string.Empty;
    public bool IsAdmin => Roles.Contains("Admin") || Roles.Contains("ConfidentialAdmin");
}
