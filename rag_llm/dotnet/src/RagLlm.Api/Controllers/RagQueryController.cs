using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using RagLlm.Api.Models;
using RagLlm.Api.Services;

namespace RagLlm.Api.Controllers;

[ApiController]
[Route("api/v1/rag")]
[Produces("application/json")]
public class RagQueryController : ControllerBase
{
    private readonly IRetrievalService _retrievalService;
    private readonly ILlmGenerationService _llmService;
    private readonly IResponseValidationService _validationService;
    private readonly ILogger<RagQueryController> _logger;

    public RagQueryController(
        IRetrievalService retrievalService,
        ILlmGenerationService llmService,
        IResponseValidationService validationService,
        ILogger<RagQueryController> logger)
    {
        _retrievalService = retrievalService;
        _llmService = llmService;
        _validationService = validationService;
        _logger = logger;
    }

    /// <summary>
    /// Core RAG Pipeline Endpoint:
    /// Executes Steps 6 (Retrieval with Vector Search), 7 (Context-based LLM with Fallback), and 8 (Validation & Citations).
    /// </summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(RagQueryResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RagQueryResponse>> ExecuteRagQuery(
        [FromBody] RagQueryRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
        {
            return BadRequest(new { error = "Question cannot be empty." });
        }

        var totalStopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Incoming RAG Query: '{Question}' | MinSimilarity: {Score} | Dept: {Dept} | Roles: [{Roles}]",
            request.Question, request.MinSimilarityScore, request.DepartmentFilter ?? "Any", string.Join(",", request.UserRoles));

        // Step 6: Retrieval – Convert question to embedding and query vector store with security/metadata filters
        var retrievalResult = await _retrievalService.RetrieveRelevantChunksAsync(
            request.Question,
            request.MinSimilarityScore,
            request.TopK,
            request.DepartmentFilter,
            request.UserRoles,
            cancellationToken);

        // Step 7: LLM – Send only relevant context to the LLM. 
        // CRITICAL REQUIREMENT: If no context found with vector search, send the same raw input text directly to LLM.
        var llmResult = await _llmService.GenerateAnswerAsync(
            request.Question,
            retrievalResult.RelevantChunks,
            cancellationToken);

        // Step 8: Validation – Validate response groundedness and return sources/citations
        var validation = _validationService.ValidateAndExtractCitations(
            llmResult.RawAnswer,
            retrievalResult.RelevantChunks,
            llmResult.ContextFound);

        totalStopwatch.Stop();

        var response = new RagQueryResponse
        {
            Question = request.Question,
            Answer = validation.SanitizedAnswer,
            ContextFound = llmResult.ContextFound,
            ExecutionMode = llmResult.ExecutionMode,
            RetrievedChunksCount = retrievalResult.RelevantChunks.Count,
            Sources = retrievalResult.RelevantChunks.ToList(),
            Citations = validation.Citations,
            Validation = validation.Report,
            Metrics = new QueryMetricsDto
            {
                EmbeddingTimeMs = Math.Round(retrievalResult.EmbeddingDurationMs, 2),
                VectorSearchTimeMs = Math.Round(retrievalResult.SearchDurationMs, 2),
                LlmInferenceTimeMs = Math.Round(llmResult.InferenceDurationMs, 2),
                ValidationTimeMs = Math.Round(validation.ValidationDurationMs, 2),
                TotalDurationMs = Math.Round(totalStopwatch.Elapsed.TotalMilliseconds, 2),
                ContextTokenCount = llmResult.ContextTokensUsed
            }
        };

        return Ok(response);
    }

    /// <summary>
    /// Step 6 Inspector: Preview vector similarity retrieval and security filtering without triggering LLM inference.
    /// </summary>
    [HttpPost("search-only")]
    [ProducesResponseType(typeof(IReadOnlyList<RetrievedChunkDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<RetrievedChunkDto>>> SearchVectorsOnly(
        [FromBody] RagQueryRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _retrievalService.RetrieveRelevantChunksAsync(
            request.Question,
            request.MinSimilarityScore,
            request.TopK,
            request.DepartmentFilter,
            request.UserRoles,
            cancellationToken);

        return Ok(result.RelevantChunks);
    }
}
