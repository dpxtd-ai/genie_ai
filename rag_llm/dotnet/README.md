# ASP.NET Core RAG API (.NET 8)

High-performance Enterprise Retrieval-Augmented Generation (RAG) backend engineered in ASP.NET Core 8/9.

## Architecture Highlights

1. **ASP.NET Core API**: REST endpoints consumed by Angular client with OpenAPI/Swagger and CORS.
2. **Document Ingestion**: Text extraction, control character sanitization, whitespace normalization, and metadata tagging.
3. **Chunking**: Sentence-boundary-aware sliding window chunking with configurable overlap.
4. **Embeddings**: 768-dimensional normalized embeddings via Gemini API (`gemini-embedding-2-preview`) or local semantic hashing.
5. **Vector Store**: Native PostgreSQL `pgvector` with HNSW cosine distance indexing or SQL Server 2025 native `VECTOR` search.
6. **Retrieval**: User question vectorization and similarity search combined with Role-Based Access Control (RBAC) security claims.
7. **LLM Orchestration**: Only relevant context chunks are sent to the LLM. **If no context is found above the similarity threshold, the raw input text is sent directly to the LLM without hallucinating false contexts.**
8. **Validation & Citations**: N-gram groundedness validation, citation extraction `[Doc: <Title> #<Index>]`, and confidence reporting.

## Getting Started

### Prerequisites
- .NET 8 SDK or .NET 9 SDK
- Optional: Docker (for PostgreSQL pgvector)

### Running Locally
```bash
cd src/RagLlm.Api
dotnet restore
dotnet run
```
Access Swagger UI at `http://localhost:5000` (or `https://localhost:5001`).

### Running with PostgreSQL pgvector in Docker
```bash
docker compose up -d postgres-pgvector
cd src/RagLlm.Api
# In appsettings.json, set "Rag:VectorStoreProvider": "PgVector"
dotnet run
```

### Configuration (`appsettings.json`)
```json
{
  "Rag": {
    "VectorStoreProvider": "InMemory", // Options: "InMemory", "PgVector", "SqlServer"
    "EmbeddingProvider": "Gemini",
    "EmbeddingModel": "gemini-embedding-2-preview",
    "EmbeddingDimensions": 768,
    "LlmModel": "gemini-3.8-flash",
    "DefaultMinSimilarityScore": 0.55,
    "DefaultTopK": 4
  }
}
```
