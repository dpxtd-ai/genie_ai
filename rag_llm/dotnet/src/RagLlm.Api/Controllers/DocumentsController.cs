using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using RagLlm.Api.Models;
using RagLlm.Api.Repositories;
using RagLlm.Api.Services;

namespace RagLlm.Api.Controllers;

[ApiController]
[Route("api/v1/documents")]
[Produces("application/json")]
public class DocumentsController : ControllerBase
{
    private readonly IDocumentIngestionService _ingestionService;
    private readonly IChunkingService _chunkingService;
    private readonly IEmbeddingService _embeddingService;
    private readonly IVectorRepository _vectorRepository;
    private readonly ILogger<DocumentsController> _logger;

    public DocumentsController(
        IDocumentIngestionService ingestionService,
        IChunkingService chunkingService,
        IEmbeddingService embeddingService,
        IVectorRepository vectorRepository,
        ILogger<DocumentsController> logger)
    {
        _ingestionService = ingestionService;
        _chunkingService = chunkingService;
        _embeddingService = embeddingService;
        _vectorRepository = vectorRepository;
        _logger = logger;
    }

    /// <summary>
    /// Upload file (PDF, CSV, TXT, Word DOCX) for text extraction, chunking, and vector ingestion.
    /// </summary>
    [HttpPost("upload-file")]
    [ProducesResponseType(typeof(IngestDocumentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IngestDocumentResponse>> UploadFile(
        [FromBody] UploadFileDocumentRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FileName) || 
            (string.IsNullOrWhiteSpace(request.Base64Data) && string.IsNullOrWhiteSpace(request.RawText)))
        {
            return BadRequest(new { error = "FileName and file content (Base64Data or RawText) are required." });
        }

        string extractedText = request.RawText ?? string.Empty;
        var ext = Path.GetExtension(request.FileName).ToLowerInvariant();

        if (!string.IsNullOrEmpty(request.Base64Data))
        {
            var bytes = Convert.FromBase64String(request.Base64Data);
            if (ext == ".txt" || ext == ".csv" || ext == ".json" || ext == ".md")
            {
                extractedText = System.Text.Encoding.UTF8.GetString(bytes);
            }
            else if (ext == ".docx")
            {
                // Word document text extraction from XML
                using var ms = new MemoryStream(bytes);
                using var archive = new System.IO.Compression.ZipArchive(ms);
                var entry = archive.GetEntry("word/document.xml");
                if (entry != null)
                {
                    using var sr = new StreamReader(entry.Open());
                    var xml = sr.ReadToEnd();
                    extractedText = System.Text.RegularExpressions.Regex.Replace(xml, "<[^>]+>", " ");
                }
            }
            else
            {
                // PDF / other binaries
                extractedText = System.Text.Encoding.UTF8.GetString(bytes);
            }
        }

        var ingestReq = new IngestDocumentRequest
        {
            Title = request.Title ?? Path.GetFileNameWithoutExtension(request.FileName).Replace("-", " "),
            FileName = request.FileName,
            Department = request.Department,
            RequiredSecurityRole = request.RequiredSecurityRole,
            Content = extractedText
        };

        return await IngestDocument(ingestReq, cancellationToken);
    }

    /// <summary>
    /// Executes Steps 2 (Ingestion/Cleaning), 3 (Chunking), 4 (Embeddings), and 5 (Vector Store Storage).
    /// </summary>
    [HttpPost("ingest")]
    [ProducesResponseType(typeof(IngestDocumentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IngestDocumentResponse>> IngestDocument(
        [FromBody] IngestDocumentRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Content) || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { error = "Title and Content are required." });
        }

        var sw = Stopwatch.StartNew();

        // Step 2: Document Ingestion & Cleaning
        var document = await _ingestionService.IngestAndCleanAsync(request, cancellationToken);

        // Step 3: Chunking into meaningful overlapping chunks
        var chunks = _chunkingService.CreateChunks(document, request.ChunkSize, request.ChunkOverlap);
        if (chunks.Count == 0)
        {
            return BadRequest(new { error = "Document content produced 0 valid chunks after cleaning." });
        }

        // Step 4: Embeddings – Convert chunks into vectors
        var chunkTexts = chunks.Select(c => c.Content).ToList();
        var embeddings = await _embeddingService.GenerateBatchEmbeddingsAsync(chunkTexts, cancellationToken);

        for (int i = 0; i < chunks.Count; i++)
        {
            chunks[i].Embedding = embeddings[i];
        }

        // Step 5: Vector Store – Store vectors in PostgreSQL with pgvector or SQL Server vector search
        await _vectorRepository.StoreDocumentWithChunksAsync(document, chunks, cancellationToken);

        sw.Stop();

        var response = new IngestDocumentResponse
        {
            DocumentId = document.Id,
            Title = document.Title,
            ChunksCreated = chunks.Count,
            TotalTokens = chunks.Sum(c => c.TokenCount),
            CleanedLength = document.CharacterCount,
            ProcessingDuration = sw.Elapsed,
            SampleChunks = chunks.Take(3).Select(c => new ChunkSummaryDto
            {
                ChunkId = c.Id,
                Index = c.ChunkIndex,
                Preview = c.Content.Length > 120 ? c.Content[..120] + "..." : c.Content,
                TokenCount = c.TokenCount,
                EmbeddingDimensions = c.Embedding.Length
            }).ToList()
        };

        return Ok(response);
    }

    /// <summary>
    /// Returns all stored documents with metadata and security classifications.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Document>>> GetAllDocuments(CancellationToken cancellationToken)
    {
        var docs = await _vectorRepository.GetAllDocumentsAsync(cancellationToken);
        return Ok(docs);
    }

    /// <summary>
    /// Gets document details by ID.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Document>> GetDocument(Guid id, CancellationToken cancellationToken)
    {
        var doc = await _vectorRepository.GetDocumentByIdAsync(id, cancellationToken);
        if (doc == null) return NotFound(new { error = $"Document with ID {id} not found." });
        return Ok(doc);
    }

    /// <summary>
    /// Cleans all stored documents and vector chunks for a fresh deployment.
    /// </summary>
    [HttpPost("clear-all")]
    public async Task<IActionResult> ClearAllDocuments(CancellationToken cancellationToken)
    {
        var docs = await _vectorRepository.GetAllDocumentsAsync(cancellationToken);
        foreach (var doc in docs)
        {
            await _vectorRepository.DeleteDocumentAsync(doc.Id, cancellationToken);
        }
        return Ok(new { message = "All documents and vector embeddings have been cleared." });
    }

    /// <summary>
    /// Deletes a document and all its corresponding chunks/vectors.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteDocument(Guid id, CancellationToken cancellationToken)
    {
        var success = await _vectorRepository.DeleteDocumentAsync(id, cancellationToken);
        if (!success) return NotFound(new { error = $"Document with ID {id} not found." });
        return NoContent();
    }

    /// <summary>
    /// Seeds enterprise sample documents covering Engineering, HR, and Security with RBAC levels.
    /// </summary>
    [HttpPost("seed-sample")]
    public async Task<ActionResult<object>> SeedSampleDocuments(CancellationToken cancellationToken)
    {
        var sampleDocs = GetSampleSeedDocuments();
        int totalChunks = 0;

        foreach (var req in sampleDocs)
        {
            var doc = await _ingestionService.IngestAndCleanAsync(req, cancellationToken);
            var chunks = _chunkingService.CreateChunks(doc, req.ChunkSize, req.ChunkOverlap);
            var embeddings = await _embeddingService.GenerateBatchEmbeddingsAsync(chunks.Select(c => c.Content).ToList(), cancellationToken);

            for (int i = 0; i < chunks.Count; i++)
            {
                chunks[i].Embedding = embeddings[i];
            }

            await _vectorRepository.StoreDocumentWithChunksAsync(doc, chunks, cancellationToken);
            totalChunks += chunks.Count;
        }

        return Ok(new
        {
            message = "Successfully seeded enterprise sample documents into vector store.",
            documentsCount = sampleDocs.Count,
            totalChunks
        });
    }

    private static List<IngestDocumentRequest> GetSampleSeedDocuments()
    {
        return new List<IngestDocumentRequest>
        {
            new()
            {
                Title = "Cloud Security & Token Expiry Policy",
                FileName = "security-policy-2026.md",
                Department = "Security",
                RequiredSecurityRole = "Public",
                Content = @"
# Cloud Security & API Token Governance

## 1. Authentication & Bearer Tokens
All microservice communication across internal and external APIs must use OAuth 2.0 with JSON Web Tokens (JWT).
- Access tokens have a maximum time-to-live (TTL) of 15 minutes.
- Refresh tokens must be rotated upon each refresh cycle and expire after 7 days of inactivity.
- API keys are strictly prohibited in browser clients. All third-party secrets must reside in Azure Key Vault or AWS Secrets Manager.

## 2. Encryption Standards
- All data in transit must enforce TLS 1.3 minimum. Legacy TLS 1.0/1.1 is blocked at the edge ingress gateway.
- Data at rest in PostgreSQL and SQL Server must use AES-256 transparent database encryption (TDE) with customer-managed keys (CMK).
- Vector embeddings in pgvector and SQL Server vector storage inherit storage-level encryption automatically.

## 3. Incident Response
Any suspected secret leak requires an immediate credential revocation within 30 minutes, followed by an automated root cause audit log review.
",
                ChunkSize = 380,
                ChunkOverlap = 60
            },
            new()
            {
                Title = "Engineering Microservices Architecture Spec",
                FileName = "arch-spec-v3.md",
                Department = "Engineering",
                RequiredSecurityRole = "InternalEmployee",
                Content = @"
# Enterprise Microservice & RAG System Architecture

## Core Components
The architecture consists of an Angular single-page frontend communicating over HTTPS to an ASP.NET Core Web API gateway.
- Vector Storage: High-dimensional vector embeddings are stored in PostgreSQL using the pgvector extension with HNSW indexes for sub-millisecond approximate nearest neighbor (ANN) retrieval. Alternatively, SQL Server 2025 native VECTOR(768) type with VECTOR_DISTANCE cosine metric is supported.
- Chunking Strategy: Documents are split into 300 to 500 token chunks using sentence-aware sliding windows with 20% overlap to preserve semantic continuity across chunk boundaries.
- Context Augmentation & Guardrails: When vector cosine similarity exceeds 0.55, relevant context chunks are formatted with bracket citations [Doc: <Title> #<Index>] and passed into Gemini 3.8 Flash. If no chunks exceed the threshold, the pipeline automatically routes the raw question directly to the LLM to prevent false hallucinations.
- Resilience: All database calls implement circuit breakers and exponential backoff retry policies via Polly.
",
                ChunkSize = 420,
                ChunkOverlap = 70
            },
            new()
            {
                Title = "Executive Compensation & Equity Vesting Guidelines",
                FileName = "exec-compensation-confidential.txt",
                Department = "HumanResources",
                RequiredSecurityRole = "ConfidentialAdmin",
                Content = @"
# Confidential: Executive Compensation & Stock Plan

## Eligibility & Vesting Schedules
Equity grants awarded to Vice Presidents and C-suite executives follow a 4-year vesting schedule with a 1-year cliff (25% vesting after 12 months) and quarterly vesting thereafter.
Performance-based restricted stock units (PRSUs) are calculated based on EBITDA milestones and customer retention metrics.
Severance terms for executive level employees mandate 6 months base salary continuation and acceleration of 50% unvested options in the event of a change in corporate control.

Note: This information is strictly classified for HR Leadership and Board members.
",
                ChunkSize = 350,
                ChunkOverlap = 50
            }
        };
    }
}
