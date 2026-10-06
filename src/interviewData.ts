export interface InterviewQuestionItem {
  id: string;
  number: number;
  category: 'architecture' | 'chunking' | 'retrieval' | 'scaling' | 'production';
  categoryLabel: string;
  question: string;
  tags: string[];
  summary: string;
  answerBullets: { title: string; text: string }[];
}

export const INTERVIEW_QUESTIONS: InterviewQuestionItem[] = [
  {
    id: 'q1',
    number: 1,
    category: 'architecture',
    categoryLabel: 'Architecture & Guardrails',
    question: 'How do you prevent hallucinations in your RAG pipeline?',
    tags: ['Grounding', 'Citations', 'Temperature', 'Guardrails'],
    summary: 'By combining strict prompt grounding, low temperature, deterministic cosine thresholding, and transparent dual-path routing.',
    answerBullets: [
      {
        title: 'Strict Context Grounding',
        text: 'When vector context matches, the system prompt commands the LLM to adhere strictly to the provided chunks and append bracket citations [Doc: Title #Idx]. Outside assumptions are forbidden.'
      },
      {
        title: 'Deterministic Similarity Thresholding',
        text: 'Chunks failing the similarity cutoff (e.g. < 0.50 in backend, < 0.20 in fuzzy engine) are pruned out so irrelevant noise is never injected into the context window.'
      },
      {
        title: 'Low Temperature (0.2)',
        text: 'RAG generation queries run with temperature 0.2 to minimize stochastic randomness and prioritize factual adherence.'
      },
      {
        title: 'Dual-Path Fallback (Req #7)',
        text: 'If no documents match, the system openly routes directly to the LLM with general knowledge instructions rather than pretending to quote a non-existent document.'
      }
    ]
  },
  {
    id: 'q2',
    number: 2,
    category: 'chunking',
    categoryLabel: 'Chunking & Ingestion',
    question: 'Why use a 20% chunk overlap? What failure does it prevent?',
    tags: ['Sliding Window', 'Semantic Continuity', 'Boundary Preservation'],
    summary: 'A 20% sliding window guarantees that critical definitions split across chunk boundaries remain semantically coherent.',
    answerBullets: [
      {
        title: 'Boundary Semantic Coherence',
        text: 'If a critical sentence (e.g. "Reflection allows runtime inspection... but is restricted in Native AOT") is cut across a hard chunk boundary, both chunks lose semantic completeness.'
      },
      {
        title: 'Embedding Degradation Prevention',
        text: 'Partial sentences produce degraded, misleading vector embeddings. An overlap of 70–80 tokens (~20%) guarantees that transition phrases exist together in at least one chunk.'
      },
      {
        title: 'Sentence-Aware Slicing',
        text: 'Text is partitioned along natural punctuation marks ([.?!]) within a 350–450 token target window, rather than arbitrary character cuts.'
      }
    ]
  },
  {
    id: 'q3',
    number: 3,
    category: 'scaling',
    categoryLabel: 'Scale & Performance',
    question: 'How would you scale this vector database to 10 million documents in production?',
    tags: ['HNSW', 'Partitioning', 'Quantization', 'Caching'],
    summary: 'By deploying HNSW indexing in pgvector, multi-tenant table partitioning, scalar quantization, and Redis query caching.',
    answerBullets: [
      {
        title: 'HNSW Indexing in pgvector',
        text: 'Replace flat linear scans with Hierarchical Navigable Small World graphs (m=16, ef_construction=64) to achieve sub-10ms Approximate Nearest Neighbor (ANN) search.'
      },
      {
        title: 'Tenant / Department Partitioning',
        text: 'Partition vector tables by TenantId or Department. Vector similarity search executes only within authorized partitions, reducing search candidates by orders of magnitude.'
      },
      {
        title: 'Scalar (int8) Quantization',
        text: 'Compress 768-dimension float32 vectors to 8-bit integers, reducing memory footprint by ~75% while preserving >98% retrieval recall.'
      },
      {
        title: 'Redis Vector & Query Caching',
        text: 'Cache precomputed query embeddings and answers for high-frequency questions to eliminate redundant model inferences.'
      }
    ]
  },
  {
    id: 'q4',
    number: 4,
    category: 'architecture',
    categoryLabel: 'Security & Governance',
    question: 'How does Role-Based Access Control (RBAC) work in vector search, and why is pre-filtering critical?',
    tags: ['RBAC', 'Data Isolation', 'Pre-Filtering', 'Security'],
    summary: 'Security filters are evaluated pre-retrieval to ensure confidential vectors are never exposed or computed in unauthorized queries.',
    answerBullets: [
      {
        title: 'Pre-Retrieval vs Post-Retrieval',
        text: 'In post-retrieval, top-k chunks are retrieved first and then filtered. If all top-k chunks are confidential, the user gets 0 results even if authorized chunks existed at rank k+1. Pre-filtering avoids this completely.'
      },
      {
        title: 'Zero Data Leakage',
        text: 'Unauthorized chunks are pruned from candidate sets before distance calculations, preventing unauthorized metadata or snippets from ever entering the LLM prompt context.'
      },
      {
        title: 'Multi-Role Classifications',
        text: 'Every chunk inherits a requiredSecurityRole (Public, InternalEmployee, ConfidentialAdmin) validated against caller claims.'
      }
    ]
  },
  {
    id: 'q5',
    number: 5,
    category: 'architecture',
    categoryLabel: 'Architecture & Guardrails',
    question: "What is Requirement #7 (Dual-Path Fallback), and why is it superior to returning 'I don't know'?",
    tags: ['Dual Routing', 'Requirement 7', 'Enterprise UX', 'Fallback'],
    summary: 'Instead of dead-ending when documents are absent, the pipeline transparently routes queries to general LLM intelligence.',
    answerBullets: [
      {
        title: 'Eliminating the Naive RAG Dead-End',
        text: 'Standard RAG systems fail when asked broad questions not in the knowledge base, returning an unhelpful "I do not have enough information."'
      },
      {
        title: 'Dynamic Dual-Path Routing',
        text: 'If relevant vector documents match, the engine grounds the response strictly in document chunks with citations. If no vector documents match, the query routes directly to Gemini LLM with senior engineer instructions.'
      },
      {
        title: 'Full Audit Transparency',
        text: 'The UI clearly displays badge indicators: "Context Found (Vector Search Matched)" vs "No Context Found (Sent Direct Prompt to LLM)", keeping the user fully informed.'
      }
    ]
  },
  {
    id: 'q6',
    number: 6,
    category: 'retrieval',
    categoryLabel: 'Retrieval & Search',
    question: 'How do you handle typos (e.g. "refleaction" vs "reflection") and keyword mismatches in vector search?',
    tags: ['Fuzzy Matching', 'Levenshtein', 'Typo Tolerance', 'Hybrid Search'],
    summary: 'By combining dense semantic embeddings with Levenshtein edit-distance token similarity and title boost weighting.',
    answerBullets: [
      {
        title: 'Typo Vulnerability in Keyword RAG',
        text: 'Exact substring checks fail on common typos (such as "refleaction" instead of "reflection"), causing false-negative zero-score drops.'
      },
      {
        title: 'Levenshtein & Trigram Similarity',
        text: 'Our fuzzy relevance engine computes normalized edit distance (computeWordSimilarity), matching "refleaction" to "reflection" with >90% confidence.'
      },
      {
        title: 'Stop-Word Elimination & Title Boost',
        text: 'Noise words ("what", "is", "how", "tell") are stripped out, and content words matching document titles receive weighted bonuses to prioritize the intended document.'
      }
    ]
  },
  {
    id: 'q7',
    number: 7,
    category: 'chunking',
    categoryLabel: 'Chunking & Ingestion',
    question: 'Why did retrieving only a single chunk cause incomplete answers (like truncated Pros and Cons), and how does multi-chunk assembly fix it?',
    tags: ['Multi-Chunk', 'Context Assembly', 'Deep Answers', 'Chunk Fragmentation'],
    summary: 'Single-chunk retrieval isolates a 25% fragment; multi-chunk assembly gathers all relevant slices in sequential order.',
    answerBullets: [
      {
        title: 'Single-Chunk Fragmentation',
        text: 'When a document is split into 4 chunks (Definitions in #0, Classes in #1, Advantages in #2, Disadvantages in #3), retrieving only top-1 (#2) starves the LLM of definitions and disadvantages.'
      },
      {
        title: 'Multi-Chunk Assembly',
        text: 'When a document passes the relevance threshold, the engine retrieves all top-matching chunks across the document (up to 6 chunks, ordered sequentially by chunkIndex).'
      },
      {
        title: 'Exhaustive Depth',
        text: 'The LLM receives the complete coherent context, allowing it to provide full definitions, exhaustive pros, complete cons, and clean C# code examples without truncation.'
      }
    ]
  },
  {
    id: 'q8',
    number: 8,
    category: 'scaling',
    categoryLabel: 'Scale & Performance',
    question: 'PostgreSQL pgvector vs Specialized Vector Databases (Pinecone, Weaviate, Milvus, Qdrant): How do you decide?',
    tags: ['pgvector', 'Pinecone', 'Milvus', 'Architectural Tradeoffs'],
    summary: 'Choose pgvector for operational simplicity and ACID relational joins; choose dedicated vector DBs for 50M+ vectors or massive QPS.',
    answerBullets: [
      {
        title: 'Why pgvector for Enterprise',
        text: 'No extra database cluster to operate, unified ACID transactions across documents and embeddings, and native SQL joins with existing user/permission tables.'
      },
      {
        title: 'When to Choose Dedicated Vector DBs',
        text: 'When vector collections scale beyond 50–100 million items requiring distributed sharding, or when query throughput exceeds thousands of vector searches per second.'
      },
      {
        title: 'Migration Path',
        text: 'Clean Architecture with repository interfaces (IVectorRepository) allows seamless swapping between PgVectorRepository and dedicated cloud vector stores.'
      }
    ]
  },
  {
    id: 'q9',
    number: 9,
    category: 'retrieval',
    categoryLabel: 'Retrieval & Search',
    question: 'What is the difference between Dense Retrieval and Sparse Retrieval, and what is Hybrid Search?',
    tags: ['Dense Vectors', 'BM25', 'RRF', 'Hybrid Retrieval'],
    summary: 'Dense vectors understand conceptual semantics; sparse BM25 matches exact keywords. Hybrid search fuses both using Reciprocal Rank Fusion.',
    answerBullets: [
      {
        title: 'Dense Retrieval (Embeddings)',
        text: '768-D continuous vectors excel at semantic intent, synonyms, and cross-lingual queries, but may miss rare exact identifiers.'
      },
      {
        title: 'Sparse Retrieval (BM25)',
        text: 'Inverted indexes excel at exact keywords, function names, error codes, and part numbers, but cannot generalize to synonyms.'
      },
      {
        title: 'Reciprocal Rank Fusion (RRF)',
        text: 'Executes dense and sparse searches in parallel and computes RRF(d) = sum(1 / (60 + rank(d))) to deliver both high conceptual recall and keyword precision.'
      }
    ]
  },
  {
    id: 'q10',
    number: 10,
    category: 'production',
    categoryLabel: 'Production & DevOps',
    question: 'How does the system maintain offline availability and persist data across browser refreshes?',
    tags: ['Persistence', 'localStorage', 'Backup', 'Offline Mode'],
    summary: 'By mirroring data to ./data/vector_store.json on the server and synchronizing to browser localStorage in static deployments.',
    answerBullets: [
      {
        title: 'Server-Side File Mirroring',
        text: 'Every ingested document and vector embedding is written to ./data/vector_store.json so state survives server restarts.'
      },
      {
        title: 'In-Browser LocalStorage Persistence',
        text: 'On static hosting (e.g. GitHub Pages), all uploaded documents and chunks are serialized to browser localStorage (genie_stored_chunks), persisting across tab refreshes.'
      },
      {
        title: 'Portable Backup & Restore',
        text: 'Includes Export Store (JSON) and Import Store utilities, allowing users to back up their vector database to a portable JSON file and restore it on any device.'
      }
    ]
  },
  {
    id: 'q11',
    number: 11,
    category: 'production',
    categoryLabel: 'Production & DevOps',
    question: 'How do you evaluate and monitor RAG pipeline quality in production (The RAG Triad)?',
    tags: ['RAG Triad', 'Ragas', 'Evaluation', 'Faithfulness'],
    summary: 'Using the RAG Triad framework to measure Context Relevance, Groundedness (Faithfulness), and Answer Relevance.',
    answerBullets: [
      {
        title: 'Context Relevance',
        text: 'Measures what percentage of retrieved chunk sentences are relevant to answering the question (identifies noisy retrieval).'
      },
      {
        title: 'Groundedness / Faithfulness',
        text: 'Measures what percentage of claims in the generated response can be directly inferred from the retrieved chunks (detects hallucinations).'
      },
      {
        title: 'Answer Relevance',
        text: 'Measures how directly the response addresses the user prompt without deviating into tangential information.'
      }
    ]
  },
  {
    id: 'q12',
    number: 12,
    category: 'production',
    categoryLabel: 'Production & DevOps',
    question: 'What techniques do you apply to minimize latency in a production enterprise RAG pipeline?',
    tags: ['Latency', 'Streaming', 'Caching', 'TTFT'],
    summary: 'Through Server-Sent Events token streaming, HNSW index parameter tuning, Redis query caching, and pre-retrieval filtering.',
    answerBullets: [
      {
        title: 'Token Streaming (SSE)',
        text: 'Streams generated tokens to the UI using Server-Sent Events, achieving Time-to-First-Token (TTFT) under 400ms.'
      },
      {
        title: 'HNSW Index Parameter Tuning',
        text: 'Configures ef_search=40 at query time to keep nearest-neighbor vector retrieval strictly under 10ms.'
      },
      {
        title: 'Embedding Caching',
        text: 'Caches query embeddings in Redis for recurring questions to bypass model embedding latency.'
      },
      {
        title: 'Pre-Filtering',
        text: 'Evaluates RBAC and department filters before vector distance calculation, drastically reducing the search space.'
      }
    ]
  }
];
