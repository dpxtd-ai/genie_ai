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
