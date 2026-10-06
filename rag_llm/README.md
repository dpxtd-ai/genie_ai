# Enterprise RAG Pipeline (ASP.NET Core 9.0 & Angular 19)

Production-grade Retrieval-Augmented Generation (RAG) platform with full ASP.NET Core API and Angular client codebase, PostgreSQL pgvector and SQL Server vector integration, interactive pipeline execution, embeddings, and citation validation.

```
rag_llm/
├── angular/          # Angular 19 Client (Standalone components, Signals, Tailwind)
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── models/
│   │   │   └── services/
│   │   ├── environments/
│   │   └── ...
│   └── package.json
└── dotnet/           # ASP.NET Core 9 Web API (.NET C#)
    ├── src/RagLlm.Api/
    │   ├── Controllers/   # RagQueryController, DocumentsController
    │   ├── Database/      # schema_pgvector.sql, schema_sqlserver.sql
    │   ├── Models/        # Entities, DTOs
    │   ├── Repositories/  # PgVectorRepository, SqlServerVectorRepository, InMemory
    │   ├── Services/      # Ingestion, Chunking, Embedding, Retrieval, LLM, Validation
    │   └── Program.cs
    ├── docker-compose.yml # PostgreSQL with pgvector container
    └── README.md
```

## 8 Core Architectural Requirements

1. **ASP.NET Core API**: Angular client calls `.NET` REST API (`/api/v1/rag/query`, `/api/v1/documents/ingest`).
2. **Document Ingestion**: Extracts and cleans documents (strips non-printable control chars, normalizes unicode whitespace).
3. **Chunking**: Splits documents into sentence-aware sliding window chunks with configurable overlap (20%).
4. **Embeddings**: Converts chunks into high-dimensional 768-D vector representations using Google Gemini embeddings.
5. **Vector Store**: Native storage in PostgreSQL with `pgvector` (`vector(768)` with HNSW index) or SQL Server 2025 native `VECTOR` search.
6. **Retrieval**: Vectorizes user queries and executes cosine distance search with metadata & RBAC security filters.
7. **LLM Orchestration**: Sends assembled relevant context chunks to the LLM. **If no context is found above the similarity threshold, the same raw input text is sent directly to the LLM.**
8. **Validation**: Validates groundedness, flags hallucinations, and returns verified source citations (`[Doc: <Title> #<Index>]`).

---

## Technical Setup & Execution Steps

### 1. Database Setup (PostgreSQL with pgvector)
```bash
# Start PostgreSQL with pgvector using Docker Compose
docker compose up -d

# Verify pgvector extension is active:
docker exec -it rag-postgres psql -U postgres -d ragdb -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run the provided database schema:
docker exec -i rag-postgres psql -U postgres -d ragdb < dotnet/src/RagLlm.Api/Database/schema_pgvector.sql
```

### 2. ASP.NET Core 9.0 Web API (.NET C#)
```bash
cd dotnet/src/RagLlm.Api

# Configure your Gemini API Key in appsettings.json or via environment variable
export Gemini__ApiKey="YOUR_GEMINI_API_KEY"

# Restore NuGet dependencies and build
dotnet restore
dotnet build

# Launch API server (Swagger UI on http://localhost:5000/swagger)
dotnet run
```

### 3. Angular 19 Client SPA
```bash
cd angular

# Install dependencies
npm install

# Start development server (runs on http://localhost:4200)
npm start
```
