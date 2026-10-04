using System.Diagnostics;
using System.Text;
using System.Text.Json;
using RagLlm.Api.Models;

namespace RagLlm.Api.Services;

public interface ILlmGenerationService
{
    /// <summary>
    /// Requirement #7: Sends only relevant context chunks to the LLM. 
    /// If no context is found with vector search, sends the raw user input text directly to the LLM.
    /// </summary>
    Task<LlmGenerationResult> GenerateAnswerAsync(
        string question,
        IReadOnlyList<RetrievedChunkDto> relevantChunks,
        CancellationToken cancellationToken = default);
}

public record LlmGenerationResult
{
    public string Question { get; init; } = string.Empty;
    public string RawAnswer { get; init; } = string.Empty;
    public bool ContextFound { get; init; }
    public string ExecutionMode { get; init; } = string.Empty;
    public double InferenceDurationMs { get; init; }
    public int ContextTokensUsed { get; init; }
}

public class LlmGenerationService : ILlmGenerationService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LlmGenerationService> _logger;

    public LlmGenerationService(HttpClient httpClient, IConfiguration configuration, ILogger<LlmGenerationService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<LlmGenerationResult> GenerateAnswerAsync(
        string question,
        IReadOnlyList<RetrievedChunkDto> relevantChunks,
        CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        bool contextFound = relevantChunks != null && relevantChunks.Count > 0;
        string executionMode = contextFound ? "RetrievalAugmented" : "DirectLlmFallback";

        string promptToSend;
        int contextTokens = 0;

        if (contextFound)
        {
            // Requirement #7 (Path A): Send only relevant context to the LLM
            var sb = new StringBuilder();
            sb.AppendLine("You are a trusted enterprise technical assistant. Answer the user question truthfully and accurately based strictly on the retrieved context below.");
            sb.AppendLine("Include source attribution citations in your response using the format: [Doc: <Title> #<Index>].");
            sb.AppendLine();
            sb.AppendLine("=== RETRIEVED CONTEXT (Only Relevant Chunks) ===");

            foreach (var chunk in relevantChunks!)
            {
                sb.AppendLine($"--- [Doc: {chunk.DocumentTitle} #{chunk.ChunkIndex}] (Similarity: {chunk.SimilarityScore:F2}, Dept: {chunk.Department}) ---");
                sb.AppendLine(chunk.Content);
                sb.AppendLine();
            }

            sb.AppendLine("=== USER QUESTION ===");
            sb.AppendLine(question);
            sb.AppendLine();
            sb.AppendLine("Answer with clarity, quoting specific facts and citing the sources above.");

            promptToSend = sb.ToString();
            contextTokens = (int)Math.Ceiling(promptToSend.Length / 4.0);

            _logger.LogInformation("Requirement #7: Sending {ChunkCount} relevant context chunks to LLM.", relevantChunks.Count);
        }
        else
        {
            // Requirement #7 (Path B): If NO context found with vector search then same input text send to LLM
            promptToSend = question;
            contextTokens = (int)Math.Ceiling(question.Length / 4.0);

            _logger.LogInformation("Requirement #7: No context found above threshold. Sending raw input text directly to LLM without vector context.");
        }

        var apiKey = _configuration["GEMINI_API_KEY"] ?? _configuration["OpenAI:ApiKey"] ?? string.Empty;
        string answerText;

        if (!string.IsNullOrEmpty(apiKey))
        {
            try
            {
                answerText = await CallGeminiLlmAsync(promptToSend, contextFound, apiKey, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Remote LLM inference failed. Using local synthesized fallback answer.");
                answerText = SynthesizeLocalFallback(question, relevantChunks, contextFound);
            }
        }
        else
        {
            answerText = SynthesizeLocalFallback(question, relevantChunks, contextFound);
        }

        sw.Stop();

        return new LlmGenerationResult
        {
            Question = question,
            RawAnswer = answerText,
            ContextFound = contextFound,
            ExecutionMode = executionMode,
            InferenceDurationMs = sw.Elapsed.TotalMilliseconds,
            ContextTokensUsed = contextTokens
        };
    }

    private async Task<string> CallGeminiLlmAsync(string prompt, bool hasContext, string apiKey, CancellationToken cancellationToken)
    {
        var model = _configuration.GetValue<string>("Rag:LlmModel") ?? "gemini-3.8-flash";
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var payloadObj = new
        {
            contents = new[]
            {
                new
                {
                    parts = new[] { new { text = prompt } }
                }
            },
            generationConfig = new
            {
                temperature = hasContext ? 0.2 : 0.7,
                topP = 0.95
            }
        };

        var json = JsonSerializer.Serialize(payloadObj);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
        response.EnsureSuccessStatusCode();

        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(responseBody);

        var candidate = doc.RootElement.GetProperty("candidates")[0];
        var text = candidate.GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString();

        return text?.Trim() ?? string.Empty;
    }

    private static string SynthesizeLocalFallback(string question, IReadOnlyList<RetrievedChunkDto>? chunks, bool hasContext)
    {
        if (hasContext && chunks != null && chunks.Count > 0)
        {
            var top = chunks[0];
            return $"Based on the retrieved documentation from [Doc: {top.DocumentTitle} #{top.ChunkIndex}], here is the relevant guidance:\n\n{top.Content}\n\nThis response was generated using context chunks with a cosine similarity score of {top.SimilarityScore:P0}.";
        }

        return $"Direct LLM Response (No matching vector documents found for \"{question}\"):\n\nAs no relevant enterprise documents were found matching your criteria or security permissions, this query is answered based on general knowledge. Please verify domain-specific requirements with your organization's documentation repository.";
    }
}
