import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RagApiService } from '../../services/rag-api.service';
import { DocumentEntity, RetrievedChunk } from '../../models/rag.models';

@Component({
  selector: 'app-vector-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex justify-between items-center">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-purple-500"></span>
            Vector Store Inspector (PostgreSQL pgvector / SQL Server)
          </h2>
          <p class="text-xs text-slate-400 mt-1">
            Requirement #5: Explore stored high-dimensional vectors, metadata columns, and RBAC classifications.
          </p>
        </div>

        <button 
          (click)="loadDocuments()"
          class="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors">
          Refresh Documents
        </button>
      </div>

      <!-- Vector Search Playground -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
        <h3 class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3">
          Step 6 Test: Live Vector Cosine Similarity Probe
        </h3>
        <div class="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            [(ngModel)]="probeText" 
            placeholder="Type a test phrase to calculate cosine distance against all chunks..."
            class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:ring-2 focus:ring-indigo-500" />
          
          <button 
            (click)="testVectorDistance()"
            [disabled]="!probeText.trim() || isSearching()"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap">
            {{ isSearching() ? 'Searching Vectors...' : 'Calculate Cosine Similarity' }}
          </button>
        </div>

        <!-- Probe Results -->
        <div *ngIf="probeResults()?.length" class="mt-4 pt-3 border-t border-slate-800 space-y-2">
          <div class="text-[11px] font-semibold text-slate-400">Closest Neighbor Vectors:</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div 
              *ngFor="let match of probeResults()"
              class="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-200 truncate">{{ match.documentTitle }}</span>
                <span class="font-mono text-emerald-400 font-bold">{{ (match.similarityScore * 100) | number:'1.1-1' }}%</span>
              </div>
              <p class="text-slate-400 text-[11px] line-clamp-2 mb-2">{{ match.content }}</p>
              <div class="flex gap-2 text-[9px] font-mono text-slate-500">
                <span class="px-1.5 py-0.5 bg-slate-800 rounded">Role: {{ match.securityRole }}</span>
                <span class="px-1.5 py-0.5 bg-slate-800 rounded">Dept: {{ match.department }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ingested Documents Table -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
        <div class="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
            Stored Knowledge Base Documents ({{ documents().length }})
          </h3>
        </div>

        <div *ngIf="isLoadingDocs()" class="p-8 text-center text-xs text-slate-400">
          Loading vector catalog from ASP.NET Core API...
        </div>

        <div *ngIf="!isLoadingDocs() && documents().length === 0" class="p-8 text-center text-xs text-slate-500">
          No documents found in the vector store. Head over to the Document Ingestion tab or click "Seed Enterprise Sample Docs".
        </div>

        <table *ngIf="!isLoadingDocs() && documents().length > 0" class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
              <th class="p-3">Title / File</th>
              <th class="p-3">Department</th>
              <th class="p-3">Security Role</th>
              <th class="p-3">Tokens</th>
              <th class="p-3">Created</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 text-slate-300">
            <tr *ngFor="let doc of documents()" class="hover:bg-slate-800/30 transition-colors">
              <td class="p-3">
                <div class="font-medium text-white">{{ doc.title }}</div>
                <div class="text-[10px] text-slate-500 font-mono">{{ doc.fileName }}</div>
              </td>
              <td class="p-3">
                <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                  {{ doc.department }}
                </span>
              </td>
              <td class="p-3">
                <span 
                  class="px-2 py-0.5 rounded font-mono text-[10px] border"
                  [ngClass]="{
                    'bg-emerald-950 text-emerald-300 border-emerald-800': doc.requiredSecurityRole === 'Public',
                    'bg-blue-950 text-blue-300 border-blue-800': doc.requiredSecurityRole === 'InternalEmployee',
                    'bg-rose-950 text-rose-300 border-rose-800': doc.requiredSecurityRole === 'ConfidentialAdmin'
                  }">
                  {{ doc.requiredSecurityRole }}
                </span>
              </td>
              <td class="p-3 font-mono text-slate-400">~{{ doc.estimatedTokens }}</td>
              <td class="p-3 text-slate-500 text-[10px]">{{ doc.createdAtUtc | date:'short' }}</td>
              <td class="p-3 text-right">
                <button 
                  (click)="deleteDoc(doc.id)"
                  class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/40 transition-colors">
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class VectorExplorerComponent implements OnInit {
  private api = inject(RagApiService);

  documents = signal<DocumentEntity[]>([]);
  isLoadingDocs = signal(false);

  probeText = '';
  isSearching = signal(false);
  probeResults = signal<RetrievedChunk[] | null>(null);

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    this.isLoadingDocs.set(true);
    this.api.getDocuments().subscribe({
      next: (docs) => {
        this.documents.set(docs);
        this.isLoadingDocs.set(false);
      },
      error: () => this.isLoadingDocs.set(false)
    });
  }

  testVectorDistance() {
    if (!this.probeText.trim()) return;
    this.isSearching.set(true);

    this.api.searchVectorsOnly({
      question: this.probeText,
      minSimilarityScore: 0.30,
      topK: 4,
      userRoles: ['Public', 'InternalEmployee', 'ConfidentialAdmin']
    }).subscribe({
      next: (chunks) => {
        this.probeResults.set(chunks);
        this.isSearching.set(false);
      },
      error: (err) => {
        alert(err.message);
        this.isSearching.set(false);
      }
    });
  }

  deleteDoc(id: string) {
    if (!confirm('Are you sure you want to delete this document and its vectors?')) return;
    this.api.deleteDocument(id).subscribe({
      next: () => this.loadDocuments(),
      error: (err) => alert(err.message)
    });
  }
}
