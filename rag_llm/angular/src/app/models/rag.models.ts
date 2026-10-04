export interface IngestDocumentRequest {
  title: string;
  content: string;
  fileName?: string;
  department?: string;
  requiredSecurityRole?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestDocumentResponse {
  documentId: string;
  title: string;
  chunksCreated: number;
  totalTokens: number;
  cleanedLength: number;
  processingDuration: string;
  sampleChunks: ChunkSummary[];
}

export interface ChunkSummary {
  chunkId: string;
  index: number;
  preview: string;
  tokenCount: number;
  embeddingDimensions: number;
}

export interface RagQueryRequest {
  question: string;
  minSimilarityScore?: number;
  topK?: number;
  departmentFilter?: string;
  userRoles?: string[];
  includeDebugTraces?: boolean;
}

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarityScore: number;
  securityRole: string;
  department: string;
}

export interface Citation {
  citationLabel: string;
  chunkId: string;
  documentTitle: string;
  citedSnippet: string;
  similarityScore: number;
}

export interface ValidationReport {
  isGroundedInSources: boolean;
  groundednessConfidence: number;
  citedSourceCount: number;
  validationWarnings: string[];
  fallbackModeTriggered: boolean;
}

export interface QueryMetrics {
  embeddingTimeMs: number;
  vectorSearchTimeMs: number;
  llmInferenceTimeMs: number;
  validationTimeMs: number;
  totalDurationMs: number;
  contextTokenCount: number;
}

export interface RagQueryResponse {
  question: string;
  answer: string;
  contextFound: boolean;
  executionMode: 'RetrievalAugmented' | 'DirectLlmFallback' | string;
  retrievedChunksCount: number;
  sources: RetrievedChunk[];
  citations: Citation[];
  validation: ValidationReport;
  metrics: QueryMetrics;
}

export interface DocumentEntity {
  id: string;
  title: string;
  fileName: string;
  department: string;
  requiredSecurityRole: string;
  characterCount: number;
  estimatedTokens: number;
  createdAtUtc: string;
}
