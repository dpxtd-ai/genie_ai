import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RagApiService } from './services/rag-api.service';
import { RagQueryResponse, DocumentEntity } from './models/rag.models';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  contextFound?: boolean;
  retrievedCount?: number;
  sources?: any[];
  citations?: any[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <!-- Simple Header -->
      <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
              AI
            </div>
            <div>
              <h1 class="font-bold text-base text-white">RAG Application</h1>
              <p class="text-xs text-slate-400">Angular &amp; ASP.NET Core API</p>
            </div>
          </div>

          <!-- Two Main Options Switcher -->
          <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              (click)="selectedOption = 'upload'"
              [ngClass]="selectedOption === 'upload' ? 'bg-indigo-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'"
              class="px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-2">
              <span>📤 1. Upload Documents</span>
            </button>

            <button
              (click)="selectedOption = 'chat'"
              [ngClass]="selectedOption === 'chat' ? 'bg-indigo-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'"
              class="px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-2">
              <span>💬 2. AI Chat</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Main Container -->
      <main class="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        
        <!-- OPTION 1: UPLOAD DOCUMENTS (PDF, CSV, TEXT, WORD DOCS) -->
        <div *ngIf="selectedOption === 'upload'" class="space-y-6">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 class="text-lg font-bold text-white mb-1">Option 1: Upload Documents for Vector Ingestion</h2>
            <p class="text-xs text-slate-400 mb-6">
              Upload PDF, CSV, TXT, or Word DOCX files. The system extracts text, cleans it, splits it into semantic chunks, generates vector embeddings, and stores them in PostgreSQL pgvector / SQL Server.
            </p>

            <!-- Drag and Drop / File Input Box -->
            <div
              (dragover)="$event.preventDefault()"
              (drop)="onFileDrop($event)"
              class="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-8 text-center bg-slate-950/60 transition-colors cursor-pointer relative">
              <input
                type="file"
                (change)="onFileInputChange($event)"
                accept=".pdf,.csv,.txt,.doc,.docx"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              
              <div class="space-y-3">
                <div class="w-12 h-12 rounded-full bg-indigo-950/80 text-indigo-400 mx-auto flex items-center justify-center text-xl font-bold border border-indigo-800">
                  📁
                </div>
                <div>
                  <div class="text-sm font-semibold text-white">Click or drag &amp; drop your file here</div>
                  <div class="text-xs text-slate-400 mt-1">Supports PDF (.pdf), CSV (.csv), Plain Text (.txt), Word (.docx)</div>
                </div>
              </div>
            </div>

            <!-- Selected File Preview -->
            <div *ngIf="selectedFile" class="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold text-white">{{ selectedFile.name }}</div>
                <div class="text-xs text-slate-400 font-mono">{{ (selectedFile.size / 1024).toFixed(1) }} KB</div>
              </div>
              <button
                (click)="uploadSelectedFile()"
                [disabled]="isUploading()"
                class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2">
                <span>{{ isUploading() ? 'Ingesting Vector Data...' : 'Start Ingestion' }}</span>
              </button>
            </div>

            <!-- Upload Status Alert -->
            <div *ngIf="uploadStatus()" class="mt-4 p-4 bg-emerald-950/50 border border-emerald-700 rounded-xl text-xs text-emerald-200">
              {{ uploadStatus() }}
            </div>

            <!-- Or Quick Sample Seed & Clean Buttons -->
            <div class="mt-6 pt-6 border-t border-slate-800 flex justify-between items-center text-xs">
              <span class="text-slate-400">Manage vector knowledge base:</span>
              <div class="flex items-center gap-2">
                <button
                  *ngIf="documents().length > 0"
                  (click)="clearAllData()"
                  class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 rounded-lg transition-colors">
                  Clean All Vector Data
                </button>
                <button
                  (click)="seedSamples()"
                  class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors">
                  ⚡ Seed Sample Policies
                </button>
              </div>
            </div>
          </div>

          <!-- Ingested Documents List -->
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 class="text-sm font-bold text-white mb-3">Stored Vector Documents ({{ documents().length }})</h3>
            <div *ngIf="documents().length === 0" class="text-xs text-slate-500 py-6 text-center">
              No documents ingested yet. Upload a file above or click "Seed Sample".
            </div>
            <div class="space-y-2">
              <div
                *ngFor="let doc of documents()"
                class="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                <div>
                  <div class="font-medium text-white">{{ doc.title }}</div>
                  <div class="text-[11px] text-slate-500 font-mono">{{ doc.fileName }} • ~{{ doc.estimatedTokens }} tokens</div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-[10px] border border-indigo-800">
                    {{ doc.department }}
                  </span>
                  <button (click)="deleteDoc(doc.id)" class="text-rose-400 hover:text-rose-300 text-xs">Delete</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- OPTION 2: AI CHAT WITH PROCESS FLOW -->
        <div *ngIf="selectedOption === 'chat'" class="space-y-4 flex flex-col h-[75vh]">
          <!-- Process Flow Indicator Card -->
          <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs flex items-center justify-between text-slate-300">
            <div class="flex items-center gap-2">
              <span class="font-bold text-indigo-400">RAG Chat Process:</span>
              <span>1. User query &rarr; 2. Vector search &rarr; 3. If found: send context to LLM; if not found: send user prompt to LLM.</span>
            </div>
            <button (click)="messages = []" class="text-slate-400 hover:text-slate-200 text-[11px]">Clear Chat</button>
          </div>

          <!-- Chat Messages Area -->
          <div class="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-y-auto space-y-4 shadow-inner">
            <div *ngIf="messages.length === 0" class="text-center py-16 text-slate-500 text-xs">
              <div class="text-2xl mb-2">💬</div>
              Ask any question! The system will perform a vector similarity search across your uploaded documents.
              If matching context is found, it sends relevant chunks to the LLM. If no context is found, it sends your query directly to the LLM.
            </div>

            <div *ngFor="let msg of messages" class="flex flex-col gap-1.5">
              <!-- User Message -->
              <div *ngIf="msg.sender === 'user'" class="self-end max-w-xl bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs shadow-md">
                {{ msg.text }}
              </div>

              <!-- Assistant Message -->
              <div *ngIf="msg.sender === 'assistant'" class="self-start max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl rounded-tl-sm p-4 text-xs space-y-2 shadow-md">
                <!-- Similarity Badge (Requirement 7 & Process) -->
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                    [ngClass]="msg.contextFound ? 'bg-emerald-950 text-emerald-300 border-emerald-700' : 'bg-amber-950 text-amber-300 border-amber-700'">
                    {{ msg.contextFound ? '✓ Vector Match Found (Context Sent to LLM)' : '⚡ No Context Found (Prompt Sent Directly to LLM)' }}
                  </span>
                  <span class="text-[10px] text-slate-500">{{ msg.timestamp | date:'shortTime' }}</span>
                </div>

                <!-- Answer Content with Formatted HTML -->
                <div class="text-slate-200 leading-relaxed text-xs font-sans" [innerHTML]="formatMarkdown(msg.text)">
                </div>

                <!-- Citations if found -->
                <div *ngIf="msg.citations?.length" class="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
                  <div class="text-[10px] font-bold uppercase text-indigo-400">Sources:</div>
                  <div *ngFor="let cit of msg.citations" class="text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                    <span class="font-bold text-slate-300">{{ cit.citationLabel }}</span> ({{ cit.documentTitle }}):
                    <span class="italic">"{{ cit.citedSnippet }}"</span>
                  </div>
                </div>
              </div>
            </div>

            <div *ngIf="isWaitingAnswer" class="self-start bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              <span>Searching vector database &amp; invoking LLM...</span>
            </div>
          </div>

          <!-- Chat Input Form -->
          <form (submit)="sendQuery()" class="flex gap-2">
            <input
              type="text"
              [(ngModel)]="chatInput"
              name="chatInput"
              placeholder="Type your question (e.g. 'What is the token expiration policy?')..."
              class="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button
              type="submit"
              [disabled]="isWaitingAnswer || !chatInput.trim()"
              class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md">
              Send
            </button>
          </form>
        </div>

      </main>
    </div>
  `
})
export class AppComponent implements OnInit {
  private api = inject(RagApiService);

  selectedOption: 'upload' | 'chat' = 'chat';

  // Option 1 State
  selectedFile: File | null = null;
  isUploading = signal(false);
  uploadStatus = signal<string | null>(null);
  documents = signal<DocumentEntity[]>([]);

  // Option 2 State
  chatInput = '';
  isWaitingAnswer = false;
  messages: ChatMessage[] = [];

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    this.api.getDocuments().subscribe({
      next: (docs) => this.documents.set(docs),
      error: () => {}
    });
  }

  onFileInputChange(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.selectedFile = event.target.files[0];
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.selectedFile = event.dataTransfer.files[0];
    }
  }

  uploadSelectedFile() {
    if (!this.selectedFile || this.isUploading()) return;
    this.isUploading.set(true);
    this.uploadStatus.set(null);

    const file = this.selectedFile;
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.includes(',') ? result.split(',')[1] : result;

      this.api.uploadFile({
        fileName: file.name,
        base64Data,
        title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      }).subscribe({
        next: (res) => {
          this.uploadStatus.set(`Successfully ingested ${file.name} (${res.chunksCreated} vector chunks created).`);
          this.selectedFile = null;
          this.isUploading.set(false);
          this.loadDocuments();
        },
        error: (err) => {
          this.uploadStatus.set(`Upload error: ${err.message}`);
          this.isUploading.set(false);
        }
      });
    };

    reader.readAsDataURL(file);
  }

  seedSamples() {
    this.api.seedSampleDocuments().subscribe({
      next: (res) => {
        this.uploadStatus.set(`Seeded ${res.documentsCount} documents into vector store.`);
        this.loadDocuments();
      }
    });
  }

  deleteDoc(id: string) {
    this.api.deleteDocument(id).subscribe({
      next: () => this.loadDocuments()
    });
  }

  sendQuery() {
    if (!this.chatInput.trim() || this.isWaitingAnswer) return;

    const q = this.chatInput.trim();
    this.chatInput = '';

    // Add user message
    this.messages.push({
      id: Date.now().toString(),
      sender: 'user',
      text: q,
      timestamp: new Date()
    });

    this.isWaitingAnswer = true;

    // Call API with Process:
    // 1. Vector similarity search
    // 2. If found, send context to LLM
    // 3. If not found, send user prompt to LLM
    this.api.queryRag({
      question: q,
      minSimilarityScore: 0.50,
      topK: 4
    }).subscribe({
      next: (res: RagQueryResponse) => {
        this.messages.push({
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: res.answer,
          timestamp: new Date(),
          contextFound: res.contextFound,
          retrievedCount: res.retrievedChunksCount,
          sources: res.sources,
          citations: res.citations
        });
        this.isWaitingAnswer = false;
      },
      error: (err) => {
        this.messages.push({
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: `Error calling backend: ${err.message}`,
          timestamp: new Date(),
          contextFound: false
        });
        this.isWaitingAnswer = false;
      }
    });
  }

  clearAllData() {
    if (!confirm('Are you sure you want to clean all vector documents?')) return;
    this.api.clearAllDocuments().subscribe({
      next: () => {
        this.uploadStatus.set('All vector store documents cleared.');
        this.loadDocuments();
      }
    });
  }

  formatMarkdown(raw: string): string {
    if (!raw) return '';
    let text = raw;

    // Convert headings like ### **Heading** or ### Heading
    text = text.replace(/^###\s*\*{0,2}(.*?)\*{0,2}$/gm, '<h3 class="text-indigo-300 font-bold text-sm mt-3 mb-1">$1</h3>');
    text = text.replace(/^##\s*\*{0,2}(.*?)\*{0,2}$/gm, '<h2 class="text-white font-bold text-base mt-3 mb-1">$1</h2>');
    text = text.replace(/^#\s*\*{0,2}(.*?)\*{0,2}$/gm, '<h1 class="text-white font-bold text-lg mt-3 mb-1">$1</h1>');

    // Convert bullet lists with bold: * **Bold:** text
    text = text.replace(/^\s*[\*\-]\s+\*\*(.*?)\*\*(.*)$/gm, '<div class="flex items-start gap-1.5 my-1 ml-2"><span class="text-indigo-400 font-bold">•</span><div><strong class="text-white font-bold">$1</strong>$2</div></div>');
    text = text.replace(/^\s*[\*\-]\s+(.*)$/gm, '<div class="flex items-start gap-1.5 my-1 ml-2"><span class="text-indigo-400 font-bold">•</span><div>$1</div></div>');

    // Convert bold **text** to <strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');

    // Convert citations [Doc: Title #Idx] to styled badge
    text = text.replace(/\[(?:Doc|Source):\s*([^#\]]+)?\s*#?(\d+)?\]/gi, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 mx-0.5">$&</span>');

    // Paragraph breaks
    text = text.replace(/\n\n/g, '<div class="my-2"></div>');

    return text;
  }
}
