import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RagQueryRequest,
  RagQueryResponse,
  IngestDocumentRequest,
  IngestDocumentResponse,
  RetrievedChunk,
  DocumentEntity
} from '../models/rag.models';

/**
 * Requirement #1: Angular calls ASP.NET Core Web API.
 * Encapsulates HTTP communication with ASP.NET Core RAG controllers.
 */
@Injectable({
  providedIn: 'root'
})
export class RagApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Requirement #6, #7, #8:
   * Executes the full RAG query pipeline in ASP.NET Core API.
   * If vector search finds no chunks above threshold, the .NET backend sends the raw input text directly to LLM.
   */
  queryRag(request: RagQueryRequest): Observable<RagQueryResponse> {
    return this.http.post<RagQueryResponse>(`${this.baseUrl}/rag/query`, request).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Preview vector similarity retrieval and security filtering without triggering LLM.
   */
  searchVectorsOnly(request: RagQueryRequest): Observable<RetrievedChunk[]> {
    return this.http.post<RetrievedChunk[]>(`${this.baseUrl}/rag/search-only`, request).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Upload file (PDF, CSV, TXT, Word DOCX) for ingestion vector data
   */
  uploadFile(payload: { fileName: string; base64Data?: string; rawText?: string; title?: string; department?: string; requiredSecurityRole?: string }): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/documents/upload-file`, payload).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Requirement #2, #3, #4, #5:
   * Ingests, cleans, chunks, embeds, and stores documents in PostgreSQL (pgvector) or SQL Server vector table.
   */
  ingestDocument(request: IngestDocumentRequest): Observable<IngestDocumentResponse> {
    return this.http.post<IngestDocumentResponse>(`${this.baseUrl}/documents/ingest`, request).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Gets all ingested documents and vector metadata.
   */
  getDocuments(): Observable<DocumentEntity[]> {
    return this.http.get<DocumentEntity[]>(`${this.baseUrl}/documents`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Clears all documents and vector embeddings from the vector store.
   */
  clearAllDocuments(): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/documents/clear-all`, {}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Deletes a document and its cascading vector chunks.
   */
  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/documents/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Seeds enterprise demo documents with various RBAC clearance levels.
   */
  seedSampleDocuments(): Observable<{ message: string; documentsCount: number; totalChunks: number }> {
    return this.http.post<{ message: string; documentsCount: number; totalChunks: number }>(
      `${this.baseUrl}/documents/seed-sample`, 
      {}
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Validates ASP.NET Core backend connectivity and vector provider.
   */
  checkHealth(): Observable<{ status: string; timestamp: string; provider: string; version: string }> {
    const healthUrl = environment.apiUrl.replace('/api/v1', '/health');
    return this.http.get<{ status: string; timestamp: string; provider: string; version: string }>(healthUrl).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    let errorMsg = 'An error occurred while contacting the ASP.NET Core API.';
    if (error.error instanceof ErrorEvent) {
      errorMsg = `Client error: ${error.error.message}`;
    } else {
      errorMsg = `API Error [${error.status}]: ${error.error?.error || error.message || error.statusText}`;
    }
    console.error('RagApiService Error:', error);
    return throwError(() => new Error(errorMsg));
  }
}
