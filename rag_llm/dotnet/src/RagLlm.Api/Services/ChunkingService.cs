using RagLlm.Api.Models;

namespace RagLlm.Api.Services;

public interface IChunkingService
{
    /// <summary>
    /// Breaks a cleaned document into overlapping semantic chunks.
    /// </summary>
    IReadOnlyList<DocumentChunk> CreateChunks(Document document, int targetChunkSize = 400, int chunkOverlap = 80);
}

public class ChunkingService : IChunkingService
{
    private readonly ILogger<ChunkingService> _logger;

    public ChunkingService(ILogger<ChunkingService> logger)
    {
        _logger = logger;
    }

    public IReadOnlyList<DocumentChunk> CreateChunks(Document document, int targetChunkSize = 400, int chunkOverlap = 80)
    {
        ArgumentNullException.ThrowIfNull(document);
        var text = document.CleanedContent;

        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<DocumentChunk>();
        }

        // Validate chunk parameters
        targetChunkSize = Math.Max(100, targetChunkSize);
        chunkOverlap = Math.Clamp(chunkOverlap, 0, targetChunkSize / 2);

        var chunks = new List<DocumentChunk>();
        var paragraphs = text.Split(new[] { "\n\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);

        var currentChunkBuilder = new System.Text.StringBuilder();
        int chunkIndex = 0;

        foreach (var paragraph in paragraphs)
        {
            var p = paragraph.Trim();
            if (string.IsNullOrEmpty(p)) continue;

            // If a single paragraph is larger than targetChunkSize, split by sentence or sliding window
            if (p.Length > targetChunkSize)
            {
                var sentenceChunks = SplitLongParagraph(p, targetChunkSize, chunkOverlap);
                foreach (var sChunk in sentenceChunks)
                {
                    if (currentChunkBuilder.Length > 0)
                    {
                        chunks.Add(BuildChunk(document, currentChunkBuilder.ToString().Trim(), chunkIndex++));
                        currentChunkBuilder.Clear();
                    }
                    chunks.Add(BuildChunk(document, sChunk.Trim(), chunkIndex++));
                }
                continue;
            }

            // If appending exceeds target, emit current chunk and handle overlap
            if (currentChunkBuilder.Length + p.Length + 1 > targetChunkSize && currentChunkBuilder.Length > 0)
            {
                var chunkContent = currentChunkBuilder.ToString().Trim();
                chunks.Add(BuildChunk(document, chunkContent, chunkIndex++));

                // Carry over the overlap from the end of the previous chunk
                var overlapText = ExtractOverlap(chunkContent, chunkOverlap);
                currentChunkBuilder.Clear();
                if (!string.IsNullOrEmpty(overlapText))
                {
                    currentChunkBuilder.Append(overlapText).Append(" ");
                }
            }

            currentChunkBuilder.Append(p).Append(" ");
        }

        // Flush remaining text
        if (currentChunkBuilder.Length > 0)
        {
            var finalContent = currentChunkBuilder.ToString().Trim();
            if (!string.IsNullOrEmpty(finalContent))
            {
                chunks.Add(BuildChunk(document, finalContent, chunkIndex++));
            }
        }

        _logger.LogInformation("Document {DocId} chunked into {Count} chunks (size: {Size}, overlap: {Overlap})",
            document.Id, chunks.Count, targetChunkSize, chunkOverlap);

        return chunks;
    }

    private static DocumentChunk BuildChunk(Document doc, string content, int index)
    {
        return new DocumentChunk
        {
            Id = Guid.NewGuid(),
            DocumentId = doc.Id,
            Document = doc,
            ChunkIndex = index,
            Content = content,
            CharacterCount = content.Length,
            TokenCount = (int)Math.Ceiling(content.Length / 4.0),
            Department = doc.Department,
            RequiredSecurityRole = doc.RequiredSecurityRole,
            SourceTitle = doc.Title,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    private static List<string> SplitLongParagraph(string text, int chunkSize, int overlap)
    {
        var result = new List<string>();
        int start = 0;

        while (start < text.Length)
        {
            int length = Math.Min(chunkSize, text.Length - start);

            // Attempt to break at the last sentence end or space
            if (start + length < text.Length)
            {
                int lastPeriod = text.LastIndexOfAny(new[] { '.', '!', '?', '\n' }, start + length, length);
                if (lastPeriod > start + (chunkSize / 2))
                {
                    length = (lastPeriod - start) + 1;
                }
                else
                {
                    int lastSpace = text.LastIndexOf(' ', start + length, length);
                    if (lastSpace > start + (chunkSize / 2))
                    {
                        length = (lastSpace - start) + 1;
                    }
                }
            }

            var chunk = text.Substring(start, length).Trim();
            if (!string.IsNullOrEmpty(chunk))
            {
                result.Add(chunk);
            }

            start += Math.Max(1, length - overlap);
        }

        return result;
    }

    private static string ExtractOverlap(string text, int overlapLength)
    {
        if (string.IsNullOrEmpty(text) || overlapLength <= 0) return string.Empty;
        if (text.Length <= overlapLength) return text;

        var tail = text[^overlapLength..];
        int firstSpace = tail.IndexOf(' ');
        return firstSpace >= 0 ? tail[firstSpace..].Trim() : tail.Trim();
    }
}
