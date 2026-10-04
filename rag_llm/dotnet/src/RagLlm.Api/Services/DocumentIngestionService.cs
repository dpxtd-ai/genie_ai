using System.Text.RegularExpressions;
using RagLlm.Api.Models;

namespace RagLlm.Api.Services;

public interface IDocumentIngestionService
{
    /// <summary>
    /// Extracts, normalizes, and cleans document text to prepare for chunking and embedding.
    /// </summary>
    Task<Document> IngestAndCleanAsync(IngestDocumentRequest request, CancellationToken cancellationToken = default);
}

public class DocumentIngestionService : IDocumentIngestionService
{
    private readonly ILogger<DocumentIngestionService> _logger;

    public DocumentIngestionService(ILogger<DocumentIngestionService> logger)
    {
        _logger = logger;
    }

    public Task<Document> IngestAndCleanAsync(IngestDocumentRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Ingesting and cleaning document: {Title} ({FileName})", request.Title, request.FileName);

        var raw = request.Content ?? string.Empty;
        var cleaned = CleanDocumentText(raw);

        var doc = new Document
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            FileName = request.FileName.Trim(),
            Department = string.IsNullOrWhiteSpace(request.Department) ? "General" : request.Department.Trim(),
            RequiredSecurityRole = string.IsNullOrWhiteSpace(request.RequiredSecurityRole) ? "Public" : request.RequiredSecurityRole.Trim(),
            RawContent = raw,
            CleanedContent = cleaned,
            CharacterCount = cleaned.Length,
            EstimatedTokens = EstimateTokens(cleaned),
            CreatedAtUtc = DateTime.UtcNow
        };

        return Task.FromResult(doc);
    }

    /// <summary>
    /// Requirement #2: Document Cleaning Pipeline:
    /// - Strips invisible non-printable/control characters (ASCII 0-31 except tab and newline)
    /// - Normalizes line endings to \n
    /// - Normalizes Unicode non-breaking spaces and smart quotes
    /// - Strips zero-width characters and surrogate artifacts
    /// - Compresses consecutive empty lines (> 2 into 2)
    /// - Trims leading/trailing whitespace
    /// </summary>
    public static string CleanDocumentText(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return string.Empty;

        // 1. Normalize line endings
        string cleaned = raw.Replace("\r\n", "\n").Replace('\r', '\n');

        // 2. Remove null bytes and non-printable control characters (keep \n and \t)
        cleaned = Regex.Replace(cleaned, @"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", string.Empty);

        // 3. Remove zero-width spaces, soft hyphens, byte order marks
        cleaned = Regex.Replace(cleaned, @"[\u200B-\u200D\uFEFF\u00AD]", string.Empty);

        // 4. Normalize quotes and unicode spaces
        cleaned = cleaned.Replace('\u00A0', ' ') // non-breaking space
                         .Replace('\u2018', '\'')
                         .Replace('\u2019', '\'')
                         .Replace('\u201C', '"')
                         .Replace('\u201D', '"')
                         .Replace('\u2013', '-')
                         .Replace('\u2014', '-');

        // 5. Remove excessive horizontal whitespaces within a line
        cleaned = Regex.Replace(cleaned, @"[ \t]{2,}", " ");

        // 6. Collapse more than two consecutive newlines
        cleaned = Regex.Replace(cleaned, @"\n{3,}", "\n\n");

        return cleaned.Trim();
    }

    private static int EstimateTokens(string text)
    {
        if (string.IsNullOrEmpty(text)) return 0;
        // Conservative heuristic: ~4 characters per token in English
        return (int)Math.Ceiling(text.Length / 4.0);
    }
}
