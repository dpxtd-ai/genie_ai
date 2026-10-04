using System.Diagnostics;
using System.Text.RegularExpressions;
using RagLlm.Api.Models;

namespace RagLlm.Api.Services;

public interface IResponseValidationService
{
    /// <summary>
    /// Requirement #8: Validates the LLM response against retrieved context chunks and compiles citations/sources.
    /// </summary>
    ValidationResult ValidateAndExtractCitations(
        string rawAnswer,
        IReadOnlyList<RetrievedChunkDto> retrievedChunks,
        bool contextFound);
}

public record ValidationResult
{
    public string SanitizedAnswer { get; init; } = string.Empty;
    public List<CitationDto> Citations { get; init; } = new();
    public ValidationReportDto Report { get; init; } = new();
    public double ValidationDurationMs { get; init; }
}

public class ResponseValidationService : IResponseValidationService
{
    private readonly ILogger<ResponseValidationService> _logger;

    public ResponseValidationService(ILogger<ResponseValidationService> logger)
    {
        _logger = logger;
    }

    public ValidationResult ValidateAndExtractCitations(
        string rawAnswer,
        IReadOnlyList<RetrievedChunkDto> retrievedChunks,
        bool contextFound)
    {
        var sw = Stopwatch.StartNew();
        var citations = new List<CitationDto>();
        var warnings = new List<string>();

        if (!contextFound || retrievedChunks.Count == 0)
        {
            // Requirement #7 & #8 Fallback validation:
            warnings.Add("Direct LLM Fallback: No matching vector chunks were found above similarity threshold; no source citations apply.");
            sw.Stop();

            return new ValidationResult
            {
                SanitizedAnswer = rawAnswer,
                Citations = citations,
                Report = new ValidationReportDto
                {
                    IsGroundedInSources = false,
                    GroundednessConfidence = 0.0,
                    CitedSourceCount = 0,
                    ValidationWarnings = warnings,
                    FallbackModeTriggered = true
                },
                ValidationDurationMs = sw.Elapsed.TotalMilliseconds
            };
        }

        // 1. Regex parse citation markers like [Doc: <Title> #<Index>] or [Doc #1]
        var citationPattern = new Regex(@"\[(?:Doc|Source):\s*(?<title>[^#\]]+)?\s*#?(?<index>\d+)?\]", RegexOptions.IgnoreCase);
        var matches = citationPattern.Matches(rawAnswer);

        var citedChunkIndexes = new HashSet<int>();

        foreach (Match match in matches)
        {
            int? chunkIdx = null;
            if (match.Groups["index"].Success && int.TryParse(match.Groups["index"].Value, out int parsedIdx))
            {
                chunkIdx = parsedIdx;
            }

            var titleFilter = match.Groups["title"].Value.Trim();

            // Find matching retrieved chunk
            var matchedChunk = retrievedChunks.FirstOrDefault(c => 
                (chunkIdx.HasValue && c.ChunkIndex == chunkIdx.Value) ||
                (!string.IsNullOrEmpty(titleFilter) && c.DocumentTitle.Contains(titleFilter, StringComparison.OrdinalIgnoreCase))
            );

            if (matchedChunk != null)
            {
                citedChunkIndexes.Add(matchedChunk.ChunkIndex);
                if (!citations.Any(c => c.ChunkId == matchedChunk.ChunkId))
                {
                    citations.Add(new CitationDto
                    {
                        CitationLabel = match.Value,
                        ChunkId = matchedChunk.ChunkId,
                        DocumentTitle = matchedChunk.DocumentTitle,
                        CitedSnippet = matchedChunk.Content.Length > 160 
                            ? matchedChunk.Content[..160] + "..." 
                            : matchedChunk.Content,
                        SimilarityScore = matchedChunk.SimilarityScore
                    });
                }
            }
        }

        // 2. If no explicit inline citation tags were found, associate top matching chunks as sources
        if (citations.Count == 0 && retrievedChunks.Count > 0)
        {
            var top = retrievedChunks[0];
            citations.Add(new CitationDto
            {
                CitationLabel = $"[Doc: {top.DocumentTitle} #{top.ChunkIndex}]",
                ChunkId = top.ChunkId,
                DocumentTitle = top.DocumentTitle,
                CitedSnippet = top.Content.Length > 160 ? top.Content[..160] + "..." : top.Content,
                SimilarityScore = top.SimilarityScore
            });
            warnings.Add("Model generated answer without explicit inline bracket citations. Inferred source from highest ranked chunk.");
        }

        // 3. Compute lexical groundedness score between answer and retrieved chunks
        double groundedness = CalculateGroundednessScore(rawAnswer, retrievedChunks);
        bool isGrounded = groundedness >= 0.40;

        if (!isGrounded)
        {
            warnings.Add($"Low lexical overlap detected ({groundedness:P1}). Possible hallucination or out-of-context reasoning.");
        }

        sw.Stop();

        _logger.LogInformation("Validation completed: Grounded={IsGrounded} ({Score:P1}) | Citations: {Count}",
            isGrounded, groundedness, citations.Count);

        return new ValidationResult
        {
            SanitizedAnswer = rawAnswer,
            Citations = citations,
            Report = new ValidationReportDto
            {
                IsGroundedInSources = isGrounded,
                GroundednessConfidence = Math.Round(groundedness, 2),
                CitedSourceCount = citations.Count,
                ValidationWarnings = warnings,
                FallbackModeTriggered = false
            },
            ValidationDurationMs = sw.Elapsed.TotalMilliseconds
        };
    }

    private static double CalculateGroundednessScore(string answer, IReadOnlyList<RetrievedChunkDto> chunks)
    {
        if (string.IsNullOrWhiteSpace(answer) || chunks == null || chunks.Count == 0)
            return 0.0;

        var answerWords = ExtractKeywords(answer);
        if (answerWords.Count == 0) return 0.0;

        var chunkWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var chunk in chunks)
        {
            foreach (var word in ExtractKeywords(chunk.Content))
            {
                chunkWords.Add(word);
            }
        }

        int overlapCount = answerWords.Count(w => chunkWords.Contains(w));
        return Math.Clamp((double)overlapCount / answerWords.Count, 0.0, 1.0);
    }

    private static List<string> ExtractKeywords(string text)
    {
        var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by", 
            "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
            "this", "that", "these", "those", "it", "its", "of", "as", "from", "into"
        };

        var words = Regex.Split(text.ToLowerInvariant(), @"\W+")
            .Where(w => w.Length > 2 && !stopWords.Contains(w))
            .ToList();

        return words;
    }
}
