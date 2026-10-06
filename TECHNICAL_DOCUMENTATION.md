# Genie RAG AI Assistant – Technical Documentation & Interview Guide

## Executive Overview
**Genie RAG AI Assistant** is an enterprise-grade **Retrieval-Augmented Generation (RAG)** application. It combines deep semantic search using vector embeddings with Google Gemini Large Language Models to answer user queries with grounded citations while preventing false hallucinations.

When relevant documents exist in the vector store, the pipeline extracts and passes verified context chunks with citations. When no relevant documents meet the cosine similarity threshold (0.50), the pipeline routes the user's prompt directly to the LLM without hallucinating facts.

---

## 1. System Architecture & Technology Stack

```
   ┌─────────────────────────────────────────────────────────────┐
   │                        Client Layer                         │
   │   • React 19 + Tailwind CSS + Lucide Icons (Live App)       │
   │   • Angular 19 Standalone Components (Client Library)       │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ HTTPS / REST (JSON)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                       Backend Gateway                       │
   │   • Express / Node.js TypeScript API (Dev & Cloud Run)      │
   │   • ASP.NET Core 9.0 Web API (Enterprise C# Architecture)   │
   └───────┬──────────────────────────────┬──────────────────────┘
           │                              │
           ▼                              ▼
┌────────────────────────┐      ┌────────────────────────────────┐
│   Vector Storage       │      │        AI Foundation           │
│ • PostgreSQL pgvector  │      │ • gemini-embedding-2-preview   │
│ • SQL Server 2025      │      │   (768-dimensional dense vec)  │
│ • In-Memory Normalized │      │ • gemini-3.8-flash             │
│   Cosine Vector DB     │      │   (Sub-second inference & RAG) │
└────────────────────────┘      └────────────────────────────────┘
```

### Components
1. **Frontend**:
   - Modern React SPA with reactive state, Dark/Light mode theme switching, Markdown parser, and real-time processing metrics.
   - Companion enterprise Angular 19 SPA located in `/rag_llm/angular` with TypeScript services.
2. **Backend**:
   - Express server (`server.ts`) providing unified file ingestion, vectorization, similarity search, and Gemini integration.
   - ASP.NET Core 9 Web API in `/rag_llm/dotnet` implementing Clean Architecture, Repository pattern, and Microsoft Semantic Kernel / Google GenAI SDK.
3. **AI Models**:
   - **Embeddings**: `gemini-embedding-2-preview` (768 dimensions, L2-normalized).
   - **Generation**: `gemini-3.8-flash` (low temperature `0.2` for RAG grounding, `0.7` for direct LLM fallback).
4. **Vector Store**:
   - Compatible with PostgreSQL `pgvector` (`vector(768)` with HNSW index) and SQL Server 2025 (`VECTOR(768)` with `VECTOR_DISTANCE('cosine')`).

---

## 2. The 8-Step RAG Processing Lifecycle

### Step 1: Multi-Format Document Ingestion
- Ingests **PDF**, **CSV**, **Plain Text (.txt)**, and **Word DOCX** files.
- DOCX files are parsed in-memory using `JSZip` by reading `word/document.xml` and extracting paragraph nodes.
- CSV files are converted into structured row-attribute representations (`Record #N: Column: Value`).
- PDFs are transcribed into clean text using Gemini multimodal extraction.

### Step 2: Text Preprocessing & Sanitization
- Cleans zero-width characters, excessive whitespace, and control codes.
- Preserves sentence boundaries, headers, and code fences.

### Step 3: Sentence-Aware Sliding Window Chunking
- Documents are partitioned into **350–450 token chunks** using sentence-aware boundary splits.
- An **overlap of 70–80 tokens (~20%)** is maintained between adjacent chunks to guarantee semantic continuity across boundaries.

### Step 4: High-Dimensional Vector Embeddings
- Each text chunk is converted into a 768-dimensional vector embedding using `gemini-embedding-2-preview`.
- Embeddings are L2-normalized ($\sum v_i^2 = 1.0$) to enable blazing-fast dot-product cosine similarity.

### Step 5: Vector Indexing & Role-Based Access Control (RBAC)
- Chunks are stored with metadata: `DocumentId`, `Title`, `Department`, `SecurityRole` (`Public`, `InternalEmployee`, `ConfidentialAdmin`).
- Security role checks are evaluated **before** similarity rankings to prevent data leakage.

### Step 6: Hybrid Cosine Similarity Retrieval
- The incoming user question is embedded on-the-fly.
- Dot product cosine similarity is computed across candidate vectors:
  $$\text{CosineSimilarity}(\vec{A}, \vec{B}) = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$$
- Only chunks exceeding the minimum threshold ($\ge 0.50$) are retained, sorted descending, taking `topK = 4`.

### Step 7: Conditional LLM Routing & Guardrails (The Core Differentiator)
- **Path A: Context Found ($\ge 0.50$ similarity):**
  - Chunks are formatted as:
    ```
    --- [Doc: <Title> #<Index>] ---
    <Chunk Content>
    ```
  - Passed to `gemini-3.8-flash` with strict grounding instructions:
    *"Answer strictly based on retrieved chunks. Cite sources as [Doc: <Title> #<Index>]."*
- **Path B: No Context Found (< 0.50 similarity):**
  - **Does NOT hallucinate or fake an enterprise policy.**
  - Automatically routes the question directly to `gemini-3.8-flash` using general knowledge.
  - Generates comprehensive, structured explanations with markdown headings and code examples.

### Step 8: Citation Verification & Source Attribution
- Evaluates the generated text for bracket tags (`[Doc: ... #...]`).
- Maps citations back to physical chunks in the vector database and provides highlighted source badges.

---

## 3. How to Run Locally

### Option A: Running the Live Full-Stack Applet (React + Express)
```bash
# 1. Install dependencies
npm install

# 2. Configure environment (API key)
echo 'GEMINI_API_KEY="your-gemini-api-key"' > .env

# 3. Start development server (Port 3000)
npm run dev

# 4. Open in browser
# http://localhost:3000
```

### Option B: Running the ASP.NET Core 9.0 API
```bash
cd rag_llm/dotnet/src/RagLlm.Api

# Restore and build
dotnet restore
dotnet build

# Run the API server (Swagger UI on http://localhost:5000/swagger)
dotnet run
```

### Option C: Running the Angular 19 Client
```bash
cd rag_llm/angular

# Install dependencies
npm install

# Start Angular development server
npm start
# http://localhost:4200
```

### Option D: Running PostgreSQL with pgvector (Docker)
```bash
docker run -d --name rag-pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ragdb \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Verify extension is ready:
psql -h localhost -U postgres -d ragdb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 4. Interview Talking Points & Deep Dives

### 1. The 30-Second Elevator Pitch
> *"I built Genie, an enterprise RAG assistant with React, Angular, and .NET. It ingests enterprise documents (PDF, CSV, TXT, Word DOCX), chunks them using sentence-aware sliding windows with 20% overlap, and indexes them using 768-dimensional Gemini embeddings. At query time, it computes cosine similarity with role-based security filters. If relevant context exists ($\ge 0.50$), it injects cited chunks into Gemini 3.8 Flash. If no context exists, it gracefully routes the prompt directly to the LLM to prevent false hallucinations."*

---

### 2. Key Technical Questions an Interviewer Will Ask

#### Q1: "How do you prevent hallucinations in your RAG pipeline?"
* **Answer**:
  1. **Strict Context Injection**: When context is found, the system prompt instructs the model to adhere *strictly* to provided chunks and append bracket citations (`[Doc: Title #Idx]`).
  2. **Deterministic Thresholding**: Any similarity score below 0.50 triggers direct LLM fallback. We never feed low-relevance noise into the context window.
  3. **Low Temperature**: RAG answers use `temperature: 0.2` to minimize stochastic creativity and emphasize factual fidelity.

#### Q2: "Why 20% chunk overlap? What happens if you don't overlap?"
* **Answer**:
  Without overlap, if an important sentence or definition is split between the end of Chunk A and the start of Chunk B, both chunks lose semantic coherence. The embedding of each partial chunk degrades, and retrieval misses the answer. A 20% sliding window (~70-80 tokens) preserves semantic context across chunk boundaries.

#### Q3: "How would you scale this vector store to 10 million documents in production?"
* **Answer**:
  1. **HNSW Indexing in pgvector**: Replace flat linear scan with Hierarchical Navigable Small World (`m = 16, ef_construction = 64`) for sub-10ms approximate nearest neighbor (ANN) retrieval.
  2. **Metadata Partitioning**: Partition the database tables by `Department` or `TenantId` so vector distance is calculated only across the caller's authorized partitions.
  3. **Embedding Caching**: Cache vector embeddings for common queries in Redis to bypass embedding API calls.
  4. **Quantization**: Use scalar or binary quantization to compress 768-dimension float vectors into int8 or bit representations, reducing RAM footprint by 75%.

#### Q4: "How does the security/RBAC filtering work?"
* **Answer**:
  Security filtering happens *pre-retrieval*, not post-retrieval. If a confidential executive document matches with 0.90 similarity, but the user only has `Public` role, the chunk is filtered out before LLM prompt construction, preventing data leakage.

#### Q5: "Why did you build both React and Angular/.NET versions?"
* **Answer**:
  Enterprise environments frequently use ASP.NET Core and Angular for internal portals. Providing clean implementations in both frameworks demonstrates full-stack versatility, dependency injection patterns in C#, and reactive component state management in modern web architectures.

#### Q6: "How do you handle typos (e.g. 'refleaction' vs 'reflection') and keyword mismatches in vector search?"
* **Answer**:
  1. **Dense Vector Semantics**: Pretrained embedding models map minor variations and synonyms into nearby vector space.
  2. **Hybrid Fuzzy Relevance Engine**: In addition to vector cosine distance, our engine implements token extraction, stop-word elimination, and **Levenshtein edit-distance similarity** (`computeWordSimilarity`). A query word like `refleaction` matches `reflection` with $>90\%$ confidence.
  3. **Title Boost**: When any extracted content term fuzzy-matches a document's title or metadata, the candidate chunk receives a weighted score bonus, preventing accidental zero-score fallbacks when the user's intent is clearly focused on an ingested document.

#### Q7: "Why did retrieving only a single chunk cause incomplete answers (like truncated Pros and Cons), and how did multi-chunk assembly fix it?"
* **Answer**:
  1. **Chunk Boundary Fragmentation**: When a document (e.g., `Reflection.txt`) is chunked into 4 slices, Chunk #0 contains the definition, Chunk #1 contains class APIs, Chunk #2 contains advantages, and Chunk #3 contains disadvantages and performance caveats.
  2. **Single-Chunk Limitation**: If the retriever only returns the single top-1 chunk (`bestChunk`), the LLM receives only 25% of the document. When asked to "include pros and cons", it finds advantages in Chunk #2 but runs out of context before disadvantages, leading to empty headings or truncated output.
  3. **Multi-Chunk Document Assembly**: When a document scores above the relevance threshold, the engine retrieves **all top-matching chunks across the document** (up to 6 chunks, ordered sequentially by `chunkIndex`). The LLM receives the coherent, full context, allowing it to provide an exhaustive, production-grade answer with complete advantages, disadvantages, and code examples.

#### Q8: "PostgreSQL pgvector vs Specialized Vector Databases (Pinecone, Weaviate, Milvus, Qdrant): How do you decide?"
* **Answer**:
  * **When to choose PostgreSQL `pgvector`**:
    1. **Operational Simplicity**: You already run Postgres for relational data. No extra operational cluster, billing, or security perimeter required.
    2. **ACID Transactions**: Vector embeddings can be inserted, updated, or deleted within the exact same database transaction as the document metadata and user permissions.
    3. **Relational Joins**: Allows native SQL joins (`JOIN users ON ... JOIN permissions ON ...`) to filter vectors by user roles or tenant IDs in a single query execution plan.
  * **When to choose a dedicated Vector DB (Pinecone/Milvus/Qdrant)**:
    1. **Scale**: Datasets exceeding 50–100 million vectors where dedicated distributed vector clustering and memory-mapped HNSW graphs are needed.
    2. **High QPS**: Workloads requiring thousands of vector queries per second across massive multi-tenant spaces.

#### Q9: "What is the difference between Dense Retrieval and Sparse Retrieval, and what is Hybrid Search?"
* **Answer**:
  * **Dense Retrieval (Embeddings)**: Represents text as continuous, high-dimensional floating-point vectors (e.g. 768 dimensions). Excels at semantic meaning, paraphrasing, and cross-lingual understanding, but can struggle with exact serial numbers, product codes, or rare acronyms.
  * **Sparse Retrieval (BM25 / TF-IDF)**: Matches exact keywords based on inverted indexes and term frequency. Excels at exact keywords, code identifiers, and rare terms, but fails on synonyms or conceptual paraphrasing.
  * **Hybrid Search with Reciprocal Rank Fusion (RRF)**: Executes both dense vector search and sparse BM25 search in parallel, then combines their ranks using RRF:
    $$\text{RRF Score}(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$
    This provides the best of both worlds: conceptual comprehension plus exact keyword precision.

#### Q10: "How does the system maintain offline availability and persist data across browser refreshes?"
* **Answer**:
  1. **Dual Storage Tier**: When deployed on full-stack infrastructure, files and embeddings are mirrored to `./data/vector_store.json` so state survives container restarts.
  2. **In-Browser Client Storage**: For static deployments (such as GitHub Pages where no persistent backend server exists), all ingested documents and chunks are serialized to `localStorage` (`genie_stored_chunks` and `genie_stored_documents`).
  3. **Portable Backup/Restore**: The UI provides **Export Store (JSON)** and **Import Store** utilities, enabling users to export their vector knowledge base as a backup file and restore it across any browser or environment.

#### Q11: "How do you evaluate and monitor RAG pipeline quality in production (The RAG Triad)?"
* **Answer**:
  We evaluate RAG pipelines using the **RAG Triad** framework (standardized by Ragas and TruLens):
  1. **Context Relevance**: Measures whether retrieved chunks are relevant to the user query (detects retriever noise).
  2. **Groundedness / Faithfulness**: Measures whether every factual claim in the generated response can be traced back to the retrieved context (detects hallucinations).
  3. **Answer Relevance**: Measures whether the generated answer directly addresses the user's question without wandering off-topic.
  In production, we track citation density, user feedback (thumbs up/down), and fallback trigger rates.

#### Q12: "What techniques do you apply to minimize latency in a production enterprise RAG pipeline?"
* **Answer**:
  1. **Token Streaming**: Stream LLM response tokens directly to the UI via Server-Sent Events (SSE) so Time-to-First-Token (TTFT) is $<400\text{ms}$.
  2. **Vector Index Optimization**: Use HNSW index with tuned `ef_search` to keep nearest-neighbor retrieval under $10\text{ms}$.
  3. **Embedding Caching**: Cache query embeddings in Redis for recurring questions to bypass embedding API calls.
  4. **Pre-Filtering**: Execute RBAC and department filters *before* computing vector distances, drastically reducing the candidate search space.
  5. **Model Tiering**: Use fast, cost-effective models like `gemini-3.8-flash` for the generation step rather than high-latency heavy models.

