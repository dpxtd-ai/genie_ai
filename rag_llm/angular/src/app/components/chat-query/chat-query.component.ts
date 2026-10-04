import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RagApiService } from '../../services/rag-api.service';
import { RagQueryResponse, RetrievedChunk } from '../../models/rag.models';

@Component({
  selector: 'app-chat-query',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Query Control Panel -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div class="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4">
          <div>
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              RAG Query &amp; Retrieval Engine
            </h2>
            <p class="text-xs text-slate-400 mt-1">
              Angular communicates with ASP.NET Core API for Steps 6 (Retrieval), 7 (Context/Direct LLM), and 8 (Validation).
            </p>
          </div>

          <!-- Quick Presets -->
          <div class="flex flex-wrap gap-2 text-xs">
            <button 
              *ngFor="let preset of queryPresets" 
              (click)="applyPreset(preset)"
              class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- Question Input -->
        <div class="relative">
          <textarea
            [(ngModel)]="question"
            rows="3"
            placeholder="Ask a question against your ingested knowledge base (e.g., 'What is the token expiration TTL in the security policy?')"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-none"></textarea>
          
          <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-800">
            <span class="text-xs text-slate-400">
              <span class="text-indigo-400 font-semibold">Requirement #7 Rule:</span> If similarity score &lt; threshold, input text routes directly to LLM without vector context.
            </span>
            <button
              (click)="submitQuery()"
              [disabled]="isLoading() || !question.trim()"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-md">
              <svg *ngIf="isLoading()" class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>{{ isLoading() ? 'Executing RAG Pipeline...' : 'Run Query' }}</span>
            </button>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-800 text-xs">
          <!-- Cosine Threshold Slider -->
          <div>
            <div class="flex justify-between text-slate-300 font-medium mb-1">
              <span>Min Cosine Similarity Threshold:</span>
              <span class="text-indigo-400 font-mono font-bold">{{ minSimilarityScore }}</span>
            </div>
            <input 
              type="range" 
              min="0.30" 
              max="0.85" 
              step="0.05"
              [(ngModel)]="minSimilarityScore" 
              class="w-full accent-indigo-500" />
            <div class="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>0.30 (Broad)</span>
              <span>0.55 (Standard)</span>
              <span>0.85 (Strict)</span>
            </div>
          </div>

          <!-- Security Clearance / RBAC Role -->
          <div>
            <label class="block text-slate-300 font-medium mb-1">User Security Clearance (RBAC Filter):</label>
            <select 
              [(ngModel)]="selectedRole"
              class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500">
              <option value="Public">Public (General Access)</option>
              <option value="InternalEmployee">InternalEmployee (Staff Level)</option>
              <option value="ConfidentialAdmin">ConfidentialAdmin (Restricted / Executive)</option>
            </select>
          </div>

          <!-- Department Filter -->
          <div>
            <label class="block text-slate-300 font-medium mb-1">Department Filter:</label>
            <select 
              [(ngModel)]="selectedDepartment"
              class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500">
              <option value="">Any Department</option>
              <option value="Security">Security</option>
              <option value="Engineering">Engineering</option>
              <option value="HumanResources">Human Resources</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Execution Status & Error -->
      <div *ngIf="errorMessage()" class="bg-rose-950/60 border border-rose-800 rounded-lg p-4 text-rose-200 text-sm">
        {{ errorMessage() }}
      </div>

      <!-- Result Section -->
      <div *ngIf="response()" class="space-y-6">
        <!-- Execution Mode Banner -->
        <div 
          class="rounded-xl p-4 border flex flex-col md:flex-row justify-between items-start md:items-center gap-3"
          [ngClass]="{
            'bg-emerald-950/40 border-emerald-700/60 text-emerald-200': response()?.contextFound,
            'bg-amber-950/40 border-amber-700/60 text-amber-200': !response()?.contextFound
          }">
          <div class="flex items-center gap-3">
            <div 
              class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
              [ngClass]="response()?.contextFound ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'">
              {{ response()?.contextFound ? 'RAG' : 'LLM' }}
            </div>
            <div>
              <div class="font-bold flex items-center gap-2">
                <span>{{ response()?.contextFound ? 'Retrieval-Augmented Execution' : 'Direct LLM Fallback (No Context Found)' }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full border"
                  [ngClass]="response()?.contextFound ? 'bg-emerald-900/80 border-emerald-600 text-emerald-300' : 'bg-amber-900/80 border-amber-600 text-amber-300'">
                  Requirement #7
                </span>
              </div>
              <p class="text-xs opacity-90 mt-0.5">
                {{ response()?.contextFound 
                  ? 'Retrieved ' + response()?.retrievedChunksCount + ' vector chunks meeting similarity threshold (' + minSimilarityScore + ') and role (' + selectedRole + '). Context passed to LLM.'
                  : 'Vector similarity search yielded 0 chunks meeting threshold. Raw user prompt was dispatched directly to LLM without hallucinating false contexts.'
                }}
              </p>
            </div>
          </div>

          <!-- Metrics summary pill -->
          <div class="text-xs font-mono bg-slate-900/80 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-300 whitespace-nowrap">
            Total: {{ response()?.metrics?.totalDurationMs }}ms (Embed: {{ response()?.metrics?.embeddingTimeMs }}ms | LLM: {{ response()?.metrics?.llmInferenceTimeMs }}ms)
          </div>
        </div>

        <!-- Answer & Citations Layout -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main LLM Answer Card -->
          <div class="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col justify-between">
            <div>
              <div class="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Synthesized Answer</span>
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-slate-400">Groundedness:</span>
                  <span 
                    class="font-mono font-bold px-2 py-0.5 rounded"
                    [ngClass]="response()?.validation?.isGroundedInSources ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 text-slate-400'">
                    {{ (response()?.validation?.groundednessConfidence || 0) * 100 }}%
                  </span>
                </div>
              </div>

              <!-- Answer Markdown/Content -->
              <div class="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {{ response()?.answer }}
              </div>
            </div>

            <!-- Validation Warnings -->
            <div *ngIf="response()?.validation?.validationWarnings?.length" class="mt-6 pt-4 border-t border-slate-800">
              <span class="text-[11px] font-semibold uppercase text-amber-400 block mb-1">Requirement #8 Validation Audit:</span>
              <ul class="text-xs text-amber-300/80 space-y-1 list-disc list-inside">
                <li *ngFor="let w of response()?.validation?.validationWarnings">{{ w }}</li>
              </ul>
            </div>
          </div>

          <!-- Retrieved Sources & Citations Sidebar -->
          <div class="space-y-4">
            <!-- Citations Card -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
              <h3 class="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center justify-between">
                <span>Sources &amp; Citations</span>
                <span class="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full text-[10px]">
                  {{ response()?.citations?.length || 0 }} cited
                </span>
              </h3>

              <div *ngIf="!response()?.citations?.length" class="text-xs text-slate-500 py-3 text-center">
                No citations referenced for this response.
              </div>

              <div class="space-y-2.5">
                <div 
                  *ngFor="let cit of response()?.citations"
                  class="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg p-3 text-xs transition-colors">
                  <div class="flex justify-between items-center mb-1">
                    <span class="font-semibold text-indigo-300 font-mono">{{ cit.citationLabel }}</span>
                    <span class="text-[10px] text-emerald-400 font-mono">Similarity: {{ (cit.similarityScore * 100) | number:'1.0-0' }}%</span>
                  </div>
                  <div class="text-slate-300 font-medium text-[11px] mb-1 truncate">{{ cit.documentTitle }}</div>
                  <p class="text-slate-400 text-[11px] italic bg-slate-900/60 p-1.5 rounded border border-slate-800/80">
                    "{{ cit.citedSnippet }}"
                  </p>
                </div>
              </div>
            </div>

            <!-- All Retrieved Vector Chunks Drawer -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Vector Store Chunks (Top-K)</span>
                <span class="text-[10px] text-slate-500">{{ response()?.sources?.length || 0 }} Chunks</span>
              </h3>

              <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                <div 
                  *ngFor="let chunk of response()?.sources"
                  class="bg-slate-950/80 border border-slate-800/80 rounded p-2.5 text-[11px]">
                  <div class="flex justify-between text-slate-400 font-mono text-[10px] mb-1">
                    <span>#{{ chunk.chunkIndex }} | {{ chunk.documentTitle }}</span>
                    <span class="text-indigo-400">{{ (chunk.similarityScore * 100) | number:'1.0-0' }}%</span>
                  </div>
                  <p class="text-slate-300 line-clamp-3">{{ chunk.content }}</p>
                  <div class="flex gap-2 mt-1.5 text-[9px] text-slate-500 font-mono">
                    <span class="px-1 py-0.5 bg-slate-800 rounded">Role: {{ chunk.securityRole }}</span>
                    <span class="px-1 py-0.5 bg-slate-800 rounded">Dept: {{ chunk.department }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ChatQueryComponent {
  private api = inject(RagApiService);

  question = '';
  minSimilarityScore = 0.55;
  selectedRole = 'Public';
  selectedDepartment = '';

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  response = signal<RagQueryResponse | null>(null);

  queryPresets = [
    { label: 'Token Expiry Policy', q: 'What is the maximum time-to-live for access tokens in the security policy?', role: 'Public', dept: 'Security' },
    { label: 'Microservice Chunking', q: 'What chunking strategy is specified in the engineering architecture spec?', role: 'InternalEmployee', dept: 'Engineering' },
    { label: 'Executive Equity (Confidential)', q: 'What is the vesting schedule for executive equity stock options?', role: 'ConfidentialAdmin', dept: 'HumanResources' },
    { label: 'Out of Context Test (Direct LLM)', q: 'Who wrote the play Hamlet and what is the main theme?', role: 'Public', dept: '' }
  ];

  applyPreset(p: { label: string; q: string; role: string; dept: string }) {
    this.question = p.q;
    this.selectedRole = p.role;
    this.selectedDepartment = p.dept;
  }

  submitQuery() {
    if (!this.question.trim() || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.api.queryRag({
      question: this.question,
      minSimilarityScore: this.minSimilarityScore,
      topK: 4,
      departmentFilter: this.selectedDepartment || undefined,
      userRoles: [this.selectedRole]
    }).subscribe({
      next: (res) => {
        this.response.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isLoading.set(false);
      }
    });
  }
}
