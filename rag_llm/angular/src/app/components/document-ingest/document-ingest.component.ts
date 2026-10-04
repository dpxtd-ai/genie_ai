import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RagApiService } from '../../services/rag-api.service';
import { IngestDocumentResponse } from '../../models/rag.models';

@Component({
  selector: 'app-document-ingest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Ingestion Header -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500"></span>
            Document Ingestion &amp; Chunking Pipeline
          </h2>
          <p class="text-xs text-slate-400 mt-1">
            Requirements 2 to 5: Clean raw text, split into overlapping chunks, compute vector embeddings, and store in PostgreSQL pgvector / SQL Server.
          </p>
        </div>

        <button 
          (click)="seedSampleData()"
          [disabled]="isSeeding()"
          class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors">
          <svg *ngIf="isSeeding()" class="animate-spin h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>{{ isSeeding() ? 'Seeding Samples...' : '⚡ Seed Enterprise Sample Docs' }}</span>
        </button>
      </div>

      <!-- Seed Status Alert -->
      <div *ngIf="seedMessage()" class="bg-emerald-950/60 border border-emerald-700 rounded-lg p-3 text-emerald-200 text-xs flex justify-between items-center">
        <span>{{ seedMessage() }}</span>
        <button (click)="seedMessage.set(null)" class="text-emerald-400 hover:text-white">✕</button>
      </div>

      <!-- Main Ingestion Form -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-300 mb-1">Document Title</label>
              <input 
                type="text" 
                [(ngModel)]="title" 
                placeholder="e.g. SOC2 Type II Compliance Framework"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-300 mb-1">File Name</label>
              <input 
                type="text" 
                [(ngModel)]="fileName" 
                placeholder="soc2-compliance-report.md"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-300 mb-1">Department Tag</label>
              <select 
                [(ngModel)]="department" 
                class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm">
                <option value="General">General</option>
                <option value="Security">Security</option>
                <option value="Engineering">Engineering</option>
                <option value="HumanResources">Human Resources</option>
                <option value="Legal">Legal</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-300 mb-1">Required Security Clearance (RBAC)</label>
              <select 
                [(ngModel)]="securityRole" 
                class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm">
                <option value="Public">Public (Anyone can retrieve)</option>
                <option value="InternalEmployee">InternalEmployee (Staff only)</option>
                <option value="ConfidentialAdmin">ConfidentialAdmin (Restricted / Executive)</option>
              </select>
            </div>
          </div>

          <!-- Document Raw Content -->
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-xs font-medium text-slate-300">Raw Document Content (Markdown, TXT, or pasted text)</label>
              <span class="text-[11px] text-slate-400 font-mono">{{ rawContent.length }} characters</span>
            </div>
            <textarea
              [(ngModel)]="rawContent"
              rows="8"
              placeholder="Paste document text here. The ASP.NET Core ingestion service will strip non-printable characters, normalize unicode quotes, collapse whitespace, and prepare chunks..."
              class="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 placeholder-slate-500 text-xs font-mono resize-y focus:ring-2 focus:ring-indigo-500"></textarea>
          </div>

          <!-- Chunking Parameters Slider -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
            <div>
              <div class="flex justify-between text-xs text-slate-300 mb-1">
                <span>Target Chunk Size:</span>
                <span class="font-mono font-bold text-indigo-400">{{ chunkSize }} chars (~{{ (chunkSize / 4) | number:'1.0-0' }} tokens)</span>
              </div>
              <input 
                type="range" 
                min="150" 
                max="1000" 
                step="50" 
                [(ngModel)]="chunkSize" 
                class="w-full accent-indigo-500" />
            </div>

            <div>
              <div class="flex justify-between text-xs text-slate-300 mb-1">
                <span>Chunk Overlap:</span>
                <span class="font-mono font-bold text-indigo-400">{{ chunkOverlap }} chars</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="200" 
                step="10" 
                [(ngModel)]="chunkOverlap" 
                class="w-full accent-indigo-500" />
            </div>
          </div>

          <button
            (click)="submitIngestion()"
            [disabled]="isIngesting() || !rawContent.trim() || !title.trim()"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-md">
            <svg *ngIf="isIngesting()" class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>{{ isIngesting() ? 'Ingesting, Chunking &amp; Generating Embeddings...' : 'Ingest Document into Vector Store' }}</span>
          </button>
        </div>

        <!-- Ingestion Result & Cleaning Inspector -->
        <div class="space-y-4">
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
              Ingestion Status
            </h3>

            <div *ngIf="!ingestionResult()" class="text-xs text-slate-500 py-8 text-center">
              Submit a document to trigger Steps 2-5 in the .NET API and inspect the resulting vector chunks.
            </div>

            <div *ngIf="ingestionResult()" class="space-y-3">
              <div class="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-xs space-y-1">
                <div class="font-bold text-emerald-300">Successfully Ingested!</div>
                <div class="text-slate-300">Document ID: <span class="font-mono text-[10px] text-slate-400">{{ ingestionResult()?.documentId }}</span></div>
                <div class="text-slate-300">Chunks Stored: <span class="font-bold text-white">{{ ingestionResult()?.chunksCreated }}</span></div>
                <div class="text-slate-300">Total Tokens: <span class="font-bold text-white">{{ ingestionResult()?.totalTokens }}</span></div>
                <div class="text-slate-300">Duration: <span class="font-bold text-white">{{ ingestionResult()?.processingDuration }}</span></div>
              </div>

              <div class="text-xs font-semibold text-slate-400 mt-2">Sample Generated Chunks:</div>
              <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                <div 
                  *ngFor="let chunk of ingestionResult()?.sampleChunks"
                  class="bg-slate-950 border border-slate-800 rounded p-2.5 text-[11px] font-mono">
                  <div class="flex justify-between text-indigo-400 text-[10px] mb-1">
                    <span>Chunk #{{ chunk.index }}</span>
                    <span>{{ chunk.embeddingDimensions }}-dim Vector</span>
                  </div>
                  <p class="text-slate-300 font-sans text-[11px] line-clamp-3">{{ chunk.preview }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DocumentIngestComponent {
  private api = inject(RagApiService);

  title = '';
  fileName = '';
  department = 'Engineering';
  securityRole = 'Public';
  rawContent = '';
  chunkSize = 400;
  chunkOverlap = 80;

  isIngesting = signal(false);
  isSeeding = signal(false);
  seedMessage = signal<string | null>(null);
  ingestionResult = signal<IngestDocumentResponse | null>(null);

  submitIngestion() {
    if (!this.title.trim() || !this.rawContent.trim() || this.isIngesting()) return;

    this.isIngesting.set(true);

    this.api.ingestDocument({
      title: this.title,
      fileName: this.fileName || `${this.title.toLowerCase().replace(/\s+/g, '-')}.txt`,
      department: this.department,
      requiredSecurityRole: this.securityRole,
      content: this.rawContent,
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap
    }).subscribe({
      next: (res) => {
        this.ingestionResult.set(res);
        this.isIngesting.set(false);
        this.rawContent = '';
      },
      error: (err) => {
        alert(`Ingestion failed: ${err.message}`);
        this.isIngesting.set(false);
      }
    });
  }

  seedSampleData() {
    this.isSeeding.set(true);
    this.api.seedSampleDocuments().subscribe({
      next: (res) => {
        this.seedMessage.set(`Success: Seeded ${res.documentsCount} documents (${res.totalChunks} total vector chunks in pgvector/SQL Server store).`);
        this.isSeeding.set(false);
      },
      error: (err) => {
        this.seedMessage.set(`Seed error: ${err.message}`);
        this.isSeeding.set(false);
      }
    });
  }
}
