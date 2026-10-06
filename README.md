# Genie AI – Enterprise Retrieval-Augmented Generation (RAG) Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-9.0-purple.svg)](https://dotnet.microsoft.com/)
[![Angular](https://img.shields.io/badge/Angular-19.0-dd0031.svg)](https://angular.dev/)
[![pgvector](https://img.shields.io/badge/PostgreSQL-pgvector-336791.svg)](https://github.com/pgvector/pgvector)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-3.8%20Flash-4285f4.svg)](https://ai.google.dev/)

An enterprise-grade, production-ready **Retrieval-Augmented Generation (RAG)** platform. Genie allows organizations to ingest enterprise documentation (PDF, CSV, TXT, Word DOCX), generate high-dimensional vector embeddings, perform role-filtered cosine similarity and fuzzy keyword search, and generate grounded answers with verifiable source citations.

When relevant context is retrieved, queries are grounded strictly in the source chunks with bracket citations (`[Doc: <Title> #<Index>]`). In accordance with **Requirement #7**, when no relevant vector context exists, the query is seamlessly routed directly to the Gemini LLM for a comprehensive, unhallucinated answer rather than dead-ending or fabricating enterprise policies.

---

## Architecture Overview

```
                          ┌────────────────────────────────────────────────────────┐
                          │                      Client Layer                      │
                          │   • React 19 + Tailwind CSS (Interactive Applet)       │
                          │   • Angular 19 Standalone Signals (Enterprise SPA)     │
                          └───────────────────────────┬────────────────────────────┘
                                                      │ HTTPS / REST (JSON)
                                                      ▼
                          ┌────────────────────────────────────────────────────────┐
                          │                    Backend Gateway                     │
                          │   • Express / Node.js TypeScript API (server.ts)       │
                          │   • ASP.NET Core 9.0 Web API (rag_llm/dotnet)          │
                          └───────────┬────────────────────────────────┬───────────┘
                                      │                                │
                                      ▼                                ▼
       ┌──────────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
       │             Vector Storage Layer             │  │            AI Foundation Layer          │
       │ • PostgreSQL 16 + pgvector (HNSW Indexing)   │  │ • gemini-embedding-2-preview (768-Dim)  │
       │ • SQL Server 2025 Native Vector Distance     │  │ • gemini-3.8-flash & gemini-3.6-flash   │
       │ • File Store Persistence (vector_store.json) │  │ • Client-Side Browser Gemini Direct API │
       │ • Browser LocalStorage (Static GitHub Pages) │  │                                         │
       └──────────────────────────────────────────────┘  └─────────────────────────────────────────┘
```

---

## 8 Core Architectural Requirements & Technical Explanations

### 1. Multi-Format Document Ingestion
- **Supported Formats**: PDF (`.pdf`), CSV (`.csv`), Plain Text (`.txt`), Word (`.docx`).
- **DOCX Extraction**: Uncompressed and parsed in-memory using `JSZip` by traversing `word/document.xml` to extract structured text nodes while eliminating formatting bloat.
- **CSV Parsing**: Converts raw tabular rows into key-value semantic records (e.g., `Record #1: Employee: Alice, Dept: Engineering, Role: Senior Lead`) to preserve tabular context.
- **PDF Extraction**: Processed multimodal through Gemini text extraction or browser FileReader.

### 2. Text Preprocessing & Sanitization
- Cleans non-printable ASCII control characters (`\x00-\x1F\x7F-\x9F`), zero-width spaces, and normalize unicode whitespace.
- Normalizes escaped newline sequences while preserving code fences and markdown headers.

### 3. Sentence-Aware Sliding Window Chunking (20% Overlap)
- Splits raw text into **350–450 token chunks** along sentence boundaries (`[.?!]`).
- Maintains a **20% sliding window overlap (~70–80 tokens)** between adjacent chunks.
- **Why Overlap Matters**: If an essential policy or definition spans across a split boundary (e.g., *"Reflection allows inspection... but is restricted in AOT environments"*), zero-overlap chunking breaks the semantic meaning. Overlapping chunks guarantee that boundary phrases exist together in at least one chunk.

### 4. 768-Dimensional Vector Embeddings
- Converts text chunks into dense 768-dimensional float vectors via `gemini-embedding-2-preview`.
- Vectors are L2-normalized ($\|\vec{v}\| = 1.0$) so that cosine similarity reduces to an ultra-fast dot product:
  $$\text{CosineSimilarity}(\vec{A}, \vec{B}) = \sum_{i=1}^{768} A_i \cdot B_i$$

### 5. Multi-Tier Vector Storage & Persistence
- **PostgreSQL `pgvector`**: `vector(768)` columns with `hnsw (vector_cosine_ops)` indexing for $<10\text{ms}$ approximate nearest neighbor (ANN) retrieval.
- **Local Disk Mirroring**: Ingested files and embeddings are automatically synced to `./data/vector_store.json` so data persists across server restarts.
- **Client-Side Persistence**: On static hosting (e.g. GitHub Pages), chunks and documents persist automatically in browser `localStorage` (`genie_stored_chunks`, `genie_stored_documents`) with full Export/Import JSON backup support.

### 6. Hybrid & Fuzzy Vector Retrieval (Typo Tolerance)
- Computes cosine similarity between query embeddings and candidate chunks.
- **Typo & Keyword Resilience**: Incorporates token overlap and Levenshtein distance matching (`computeWordSimilarity`). Common typos (e.g., `refleaction` $\leftrightarrow$ `reflection` with 91% similarity) and domain tokens (`c#`, `.net`, `api`, `sql`) match accurately.
- Evaluates **Pre-Retrieval Role-Based Access Control (RBAC)** (`Public`, `InternalEmployee`, `ConfidentialAdmin`) *before* similarity ranking to eliminate unauthorized data leakage.

### 7. Dual-Path LLM Routing & Multi-Chunk Assembly (Requirement #7)
- **Path A: Context Found ($\text{Score} \ge 0.20$):**
  - Gathers **all matching chunks across the document** (up to 6 chunks, ordered logically by `chunkIndex`) so the LLM receives the full context rather than a fragmented snippet.
  - Passes the assembled context to the LLM with instructions to produce an in-depth, structured response with verified citations (`[Doc: <Title> #<Index>]`).
- **Path B: No Context Found ($\text{Score} < 0.20$):**
  - Instead of failing or hallucinating fake enterprise policies, the query is routed **directly to the Gemini LLM** with general knowledge instructions.
  - Produces complete, high-quality technical answers with Markdown headings, bold terms, and code examples.

### 8. Verification, Citations & Guardrails
- Scans LLM output for citation tags (`[Doc: <Title> #<Index>]`).
- Validates citations against the physical chunks in the vector store and exposes source snippets and similarity scores in the response.

---

## Step-by-Step Technical Instructions

### 1. Running the Full-Stack Application (React + Express)

```bash
# 1. Clone repository and install dependencies
npm install

# 2. Configure environment variables (no secrets committed)
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY from Google AI Studio:
# GEMINI_API_KEY="AIzaSy..."

# 3. Start the development server (runs on Port 3000)
npm run dev

# 4. Open in browser:
# http://localhost:3000
```

### 2. Running the ASP.NET Core 9.0 Web API (.NET C#)

The repository includes a complete enterprise C# Web API in `rag_llm/dotnet`:

```bash
cd rag_llm/dotnet/src/RagLlm.Api

# Restore NuGet packages
dotnet restore

# Build project
dotnet build

# Run the API (Swagger available at http://localhost:5000/swagger)
dotnet run
```

Key C# architectural components:
- `Services/RagOrchestrationService.cs`: Orchestrates ingestion, chunking, embedding, and dual-path routing.
- `Services/ChunkingService.cs`: Sentence-aware sliding window chunker with 20% overlap.
- `Repositories/PgVectorRepository.cs`: Native PostgreSQL `pgvector` repository using `Npgsql`.
- `Controllers/RagQueryController.cs`: Exposes `/api/v1/rag/query` with RBAC authorization filters.

### 3. Running the Angular 19 Client SPA

The repository includes an Angular 19 companion client in `rag_llm/angular`:

```bash
cd rag_llm/angular

# Install dependencies
npm install

# Start Angular development server (Port 4200)
npm start

# Open in browser:
# http://localhost:4200
```

### 4. Running PostgreSQL with pgvector (Docker)

To spin up a containerized PostgreSQL instance with `pgvector` enabled:

```bash
# 1. Launch container
docker run -d \
  --name rag-pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ragdb \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 2. Verify pgvector extension
docker exec -it rag-pgvector psql -U postgres -d ragdb -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Apply SQL schema from rag_llm/dotnet/src/RagLlm.Api/Database/schema_pgvector.sql
docker exec -i rag-pgvector psql -U postgres -d ragdb < rag_llm/dotnet/src/RagLlm.Api/Database/schema_pgvector.sql
```

### 5. Running on Static Hosting (GitHub Pages / In-Browser Mode)

If deployed as a client-side static bundle (e.g., `https://dpxtd-ai.github.io/genie_ai/`):
- All uploaded documents are automatically parsed and embedded in-browser.
- Document and chunk data are saved to `localStorage` and will persist across browser refreshes.
- You can export your vector database as a backup file (`genie_vector_store.json`) using the **Export Store** button and restore it on any machine using **Import Store**.
- Enter your Gemini API key via the **AI Key** modal in the top navigation bar to enable live inference.

---

## API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/rag/query` | Executes RAG query: computes embeddings, performs similarity search, and calls Gemini LLM. |
| `POST` | `/api/documents/upload-file` | Ingests PDF, CSV, TXT, or DOCX, chunks text, generates embeddings, and saves to file store. |
| `GET` | `/api/documents` | Lists all ingested documents with token count and chunk count. |
| `DELETE` | `/api/documents/:id` | Removes document and all associated vector embeddings from store. |
| `POST` | `/api/documents/clear-all` | Purges all documents and vector embeddings from storage. |
| `POST` | `/api/rag/search-only` | Performs vector search only without calling LLM (for pipeline debugging). |
| `GET` | `/api/rag/download-zip` | Downloads the complete ASP.NET Core & Angular companion codebase as a ZIP archive. |
| `POST` | `/api/gemini/validate-key` | Validates a user-supplied Gemini API key against model endpoints. |

---

## Testing via cURL

### 1. Ingest a Plain Text Document
```bash
curl -X POST http://localhost:3000/api/documents/upload-file \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "Reflection.txt",
    "rawText": "What is Reflection in C#? Reflection provides objects that encapsulate assemblies, modules, and types. You can use reflection to dynamically create instances, bind types, and invoke methods using the System.Reflection namespace."
  }'
```

### 2. Query with Vector Context Found
```bash
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "what is reflection in c#? include pros and cons too"
  }'
```

### 3. Query Triggering Direct LLM Fallback (Requirement #7)
```bash
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "how does the event loop work in Node.js?"
  }'
```
