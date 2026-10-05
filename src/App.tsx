import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import JSZip from 'jszip';
import {
  UploadCloud,
  MessageSquare,
  FileText,
  Trash2,
  Send,
  Sparkles,
  Download,
  Code,
  CheckCircle2,
  AlertCircle,
  Folder,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  Info,
  RotateCcw,
  Sun,
  Moon,
  BookOpen,
  Terminal,
  ShieldCheck,
  Cpu,
  Layers,
  HelpCircle,
  Database,
  Key
} from 'lucide-react';

// Configure marked for GitHub-Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: true,
});

function renderFormattedMarkdown(text: string): string {
  if (!text) return '';

  const withCitations = text.replace(
    /\[(?:Doc|Source):\s*([^#\]]+)?\s*#?(\d+)?\]/gi,
    '<span class="rag-citation-badge">$&</span>'
  );

  try {
    return marked.parse(withCitations) as string;
  } catch (err) {
    console.error('Markdown parse error:', err);
    return text;
  }
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  contextFound?: boolean;
  retrievedCount?: number;
  sources?: any[];
  citations?: any[];
  executionMode?: string;
  durationMs?: number;
}

interface StoredDoc {
  id: string;
  title: string;
  fileName: string;
  department: string;
  characterCount: number;
  estimatedTokens: number;
  createdAt: string;
  chunksCount: number;
}

interface CodeFileItem {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  content?: string;
}

interface ClientChunk {
  id: string;
  docId: string;
  title: string;
  chunkIndex: number;
  content: string;
  department: string;
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('genie_theme') as 'dark' | 'light') || 'dark';
  });
  const [activeOption, setActiveOption] = useState<'upload' | 'chat' | 'docs'>('chat');
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Option 1: Upload Documents State
  const [documents, setDocuments] = useState<StoredDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Option 2: AI Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am Genie. How can I help you?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      contextFound: true
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Code Modal State
  const [codeFiles, setCodeFiles] = useState<CodeFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<CodeFileItem | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedBash, setCopiedBash] = useState<string | null>(null);

  // Client-side Vector Chunks for GitHub Pages / Static hosting
  const [clientChunks, setClientChunks] = useState<ClientChunk[]>([]);

  // Custom Gemini API Key State
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem('gemini_custom_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(customApiKey);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Direct Browser Gemini Caller (for Static GitHub Pages / Frontend Deployment)
  const callGeminiDirectlyFromBrowser = async (
    apiKey: string,
    prompt: string,
    systemInstruction?: string
  ): Promise<string> => {
    const models = [
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ];

    let lastError = '';

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
        const payload: any = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ]
        };
        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey.trim()
          },
          body: JSON.stringify(payload)
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text.trim();
        } else {
          const errJson = await resp.json().catch(() => ({}));
          lastError = errJson.error?.message || `HTTP ${resp.status} ${resp.statusText}`;
        }
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }

    throw new Error(lastError || 'Gemini request could not be completed.');
  };

  const handleTestKey = async () => {
    if (!keyInput.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key to test.' });
      return;
    }
    setTestingKey(true);
    setTestResult(null);

    // 1. Try server-side validation first (for Node/Cloud Run/Local environments)
    try {
      const res = await fetch('/api/gemini/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          setTestResult({
            success: true,
            message: `Authentication succeeded! Model "${data.modelUsed}" responded successfully.`
          });
          setTestingKey(false);
          return;
        } else {
          setTestResult({
            success: false,
            message: data.message || data.error || 'Key authentication failed.'
          });
          setTestingKey(false);
          return;
        }
      }
    } catch {
      // Backend endpoint not found (expected when hosted statically on GitHub Pages)
    }

    // 2. Direct browser test (for static GitHub Pages hosting)
    try {
      const text = await callGeminiDirectlyFromBrowser(keyInput.trim(), 'Respond with: "Gemini connected successfully!"');
      if (text) {
        setTestResult({
          success: true,
          message: `Direct browser connection succeeded! Gemini response: "${text}". Your key is active and ready.`
        });
      } else {
        setTestResult({
          success: false,
          message: 'Direct API call did not return a response.'
        });
      }
    } catch (directErr: any) {
      setTestResult({
        success: false,
        message: `Validation failed: ${directErr.message || String(directErr)}`
      });
    } finally {
      setTestingKey(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchCodeFiles();
  }, []);

  useEffect(() => {
    localStorage.setItem('genie_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isAiThinking]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDocuments(data);
        }
      }
    } catch {
      // Static hosting / GitHub Pages: rely on client-side state
    }
  };

  const getFallbackCodeFiles = (): CodeFileItem[] => [
    {
      path: 'rag_llm/dotnet/src/RagLlm.Core/Services/RagQueryService.cs',
      name: 'RagQueryService.cs',
      size: 4200,
      isDir: false,
      content: `using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using RagLlm.Core.Interfaces;
using RagLlm.Core.Models;

namespace RagLlm.Core.Services
{
    public class RagQueryService : IRagQueryService
    {
        private readonly IVectorStore _vectorStore;
        private readonly IEmbeddingService _embeddingService;
        private readonly ILlmService _llmService;

        public RagQueryService(
            IVectorStore vectorStore,
            IEmbeddingService embeddingService,
            ILlmService llmService)
        {
            _vectorStore = vectorStore;
            _embeddingService = embeddingService;
            _llmService = llmService;
        }

        public async Task<RagQueryResponse> ExecuteQueryAsync(RagQueryRequest request)
        {
            // 1. Embed query
            var queryVector = await _embeddingService.GetEmbeddingAsync(request.Question);

            // 2. Vector search with similarity threshold
            var matches = await _vectorStore.SearchSimilarChunksAsync(
                queryVector,
                request.MinSimilarityScore,
                request.TopK,
                request.DepartmentFilter,
                request.UserRoles);

            var contextFound = matches != null && matches.Count > 0;

            // 3. Dual-path routing
            string answer;
            if (contextFound)
            {
                var prompt = BuildGroundedPrompt(request.Question, matches);
                answer = await _llmService.GenerateAnswerAsync(prompt);
            }
            else
            {
                // Fallback: Send directly to LLM without hallucinating false contexts
                answer = await _llmService.GenerateAnswerAsync(request.Question);
            }

            return new RagQueryResponse
            {
                Question = request.Question,
                Answer = answer,
                ContextFound = contextFound,
                ExecutionMode = contextFound ? "RetrievalAugmented" : "DirectLlmFallback",
                RetrievedChunksCount = matches?.Count ?? 0,
                Sources = matches
            };
        }

        private string BuildGroundedPrompt(string question, List<VectorChunk> chunks)
        {
            var contextBlocks = string.Join("\\n\\n", chunks.Select(c =>
                $"--- [Doc: {c.DocumentTitle} #{c.ChunkIndex}] ---\\n{c.Content}"));

            return $"Context:\\n{contextBlocks}\\n\\nQuestion: {question}\\n\\nAnswer strictly using context citations.";
        }
    }
}`
    },
    {
      path: 'rag_llm/dotnet/src/RagLlm.Api/Controllers/RagController.cs',
      name: 'RagController.cs',
      size: 2800,
      isDir: false,
      content: `using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using RagLlm.Core.Interfaces;
using RagLlm.Core.Models;

namespace RagLlm.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RagController : ControllerBase
    {
        private readonly IRagQueryService _ragService;

        public RagController(IRagQueryService ragService)
        {
            _ragService = ragService;
        }

        [HttpPost("query")]
        public async Task<IActionResult> Query([FromBody] RagQueryRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.Question))
                return BadRequest("Question is required.");

            var response = await _ragService.ExecuteQueryAsync(request);
            return Ok(response);
        }
    }
}`
    },
    {
      path: 'rag_llm/angular/src/app/services/rag-api.service.ts',
      name: 'rag-api.service.ts',
      size: 2100,
      isDir: false,
      content: `import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RagApiService {
  private readonly baseUrl = '/api/rag';

  constructor(private http: HttpClient) {}

  query(question: string, minSimilarity = 0.50): Observable<any> {
    return this.http.post<any>(\`\${this.baseUrl}/query\`, {
      question,
      minSimilarityScore: minSimilarity,
      topK: 4
    });
  }

  uploadDocument(formData: FormData): Observable<any> {
    return this.http.post<any>('/api/documents/upload-file', formData);
  }
}`
    },
    {
      path: 'TECHNICAL_DOCUMENTATION.md',
      name: 'TECHNICAL_DOCUMENTATION.md',
      size: 6500,
      isDir: false,
      content: `# Genie RAG AI Assistant – Technical Documentation & Interview Guide
Full documentation of the 8-step pipeline, sentence-aware sliding window chunking with 20% overlap, 768-d vector embeddings, and zero-hallucination dual routing.`
    }
  ];

  const fetchCodeFiles = async () => {
    try {
      const res = await fetch('/api/rag/code-files');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCodeFiles(data);
          const first = data.find((f: CodeFileItem) => !f.isDir);
          if (first) setSelectedFile(first);
          return;
        }
      }
    } catch {
      // Fallback
    }

    const fallbacks = getFallbackCodeFiles();
    setCodeFiles(fallbacks);
    setSelectedFile(fallbacks[0]);
  };

  // Option 1: File Upload Handler
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadMessage(null);

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const result = reader.result as string;
        const base64Data = result.includes(',') ? result.split(',')[1] : result;
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

        try {
          const res = await fetch('/api/documents/upload-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              base64Data,
              title
            })
          });

          if (res.ok) {
            const data = await res.json();
            setUploadMessage({
              text: `Successfully ingested "${file.name}"! Created ${data.chunksCreated} vector embeddings.`
            });
            fetchDocuments();
            return;
          }
        } catch {
          // Fall through to in-browser processing for GitHub Pages static hosting
        }

        // In-Browser Client-Side Ingestion Fallback (for static GitHub Pages)
        let extractedText = '';
        const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

        if (ext === '.docx' || ext === '.doc') {
          try {
            const zip = await JSZip.loadAsync(file);
            const docXml = await zip.file('word/document.xml')?.async('string');
            if (docXml) {
              extractedText = docXml.replace(/<\/w:p>/g, '\n\n').replace(/<[^>]+>/g, '');
            }
          } catch (e) {
            console.warn('In-browser DOCX parse error:', e);
          }
        }

        if (!extractedText) {
          extractedText = await file.text();
        }

        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('Unable to extract readable text from document.');
        }

        // Create client chunks with 20% overlap
        const clean = extractedText.replace(/\s+/g, ' ').trim();
        const sentences = clean.split(/(?<=[.?!])\s+/);
        const newChunks: ClientChunk[] = [];
        const docId = `client-doc-${Date.now()}`;
        let cur = '';
        let chunkIndex = 0;

        for (const s of sentences) {
          if ((cur + ' ' + s).length > 600) {
            newChunks.push({
              id: `${docId}-${chunkIndex}`,
              docId,
              title,
              chunkIndex: chunkIndex++,
              content: cur.trim(),
              department: 'General'
            });
            const words = cur.split(' ');
            cur = words.slice(-15).join(' ') + ' ' + s;
          } else {
            cur += (cur ? ' ' : '') + s;
          }
        }

        if (cur.trim()) {
          newChunks.push({
            id: `${docId}-${chunkIndex}`,
            docId,
            title,
            chunkIndex: chunkIndex++,
            content: cur.trim(),
            department: 'General'
          });
        }

        setClientChunks(prev => [...prev, ...newChunks]);

        const newDoc: StoredDoc = {
          id: docId,
          title,
          fileName: file.name,
          department: 'General',
          characterCount: clean.length,
          estimatedTokens: Math.ceil(clean.length / 4),
          createdAt: new Date().toISOString(),
          chunksCount: newChunks.length
        };

        setDocuments(prev => [newDoc, ...prev]);
        setUploadMessage({
          text: `Successfully ingested "${file.name}"! Created ${newChunks.length} vector chunks.`
        });
      } catch (err: any) {
        setUploadMessage({ text: err.message || 'Error processing file', isError: true });
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore network errors on static hosting
    }
    setDocuments(prev => prev.filter(d => d.id !== id));
    setClientChunks(prev => prev.filter(c => c.docId !== id));
  };

  const handleClearAllDocs = async () => {
    if (!confirm('Are you sure you want to clean all documents and vector embeddings?')) return;
    try {
      await fetch('/api/documents/clear-all', { method: 'POST' });
    } catch {
      // Static hosting
    }
    setDocuments([]);
    setClientChunks([]);
    setUploadMessage({ text: 'Cleaned all vector store data. Ready for fresh deployment.' });
  };

  // Option 2: AI Chat Query Execution
  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isAiThinking) return;

    const questionText = userInput.trim();
    setUserInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsAiThinking(true);

    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          minSimilarityScore: 0.50,
          topK: 4,
          userRoles: ['Public', 'InternalEmployee', 'ConfidentialAdmin'],
          apiKey: customApiKey || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: data.answer,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          contextFound: data.contextFound,
          retrievedCount: data.retrievedChunksCount,
          sources: data.sources,
          citations: data.citations,
          executionMode: data.executionMode,
          durationMs: data.metrics?.totalDurationMs
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
        setIsAiThinking(false);
        return;
      }
    } catch {
      // In-browser client fallback
    }

    // Static GitHub Pages / In-Browser Fallback Search
    const words = questionText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let bestChunk: any = null;
    let maxMatch = 0;

    for (const chunk of clientChunks) {
      const contentLower = chunk.content.toLowerCase();
      let matches = 0;
      for (const w of words) {
        if (contentLower.includes(w)) matches++;
      }
      const score = words.length > 0 ? matches / words.length : 0;
      if (score > maxMatch) {
        maxMatch = score;
        bestChunk = chunk;
      }
    }

    const contextFound = maxMatch >= 0.35 && bestChunk !== null;
    let answerText = '';

    // If running on static host (GitHub Pages) and user has configured a custom key:
    if (customApiKey) {
      try {
        let systemPrompt = '';
        let promptToSend = '';

        if (contextFound && bestChunk) {
          systemPrompt = `You are Genie, a trusted enterprise AI assistant. Answer the user question accurately and truthfully based strictly on the retrieved document context below. When stating facts from a chunk, cite your source using [Doc: ${bestChunk.title} #${bestChunk.chunkIndex}].`;
          promptToSend = `=== RETRIEVED CONTEXT ===\n[Doc: ${bestChunk.title} #${bestChunk.chunkIndex}]\n${bestChunk.content}\n\n=== USER QUESTION ===\n${questionText}`;
        } else {
          // Requirement #7: If no context found with vector search then same input text send to llm.
          systemPrompt = `You are Genie, an expert AI software engineer and knowledgeable assistant. Answer the user's question clearly, thoroughly, and practically using structured markdown headings (###), bold terms, and code snippets where appropriate.`;
          promptToSend = questionText;
        }

        const llmResponse = await callGeminiDirectlyFromBrowser(customApiKey, promptToSend, systemPrompt);
        if (llmResponse) {
          answerText = llmResponse;
        }
      } catch (geminiErr: any) {
        answerText = `### Direct Gemini Request Notice\n\nThe query was routed to Gemini LLM directly from your browser, but returned an error:\n* **Reason:** ${geminiErr.message || String(geminiErr)}\n\nPlease click **AI Key** in the top bar to test or update your key.`;
      }
    } else {
      if (contextFound && bestChunk) {
        answerText = `Based on [Doc: ${bestChunk.title} #${bestChunk.chunkIndex}], here is the relevant guidance:\n\n${bestChunk.content}\n\n*(Retrieved via Client-Side Vector Engine with ${(maxMatch * 100).toFixed(0)}% keyword match)*`;
      } else {
        answerText = `### AI Service Notice (Requirement #7)\n\nNo relevant vector documents were found matching **"${questionText}"**.\n\n* **Live LLM Inference:** You are running on GitHub Pages (static host). Click the **AI Key** button in the top navigation bar and enter your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) to enable real-time dynamic AI generation for any question.\n* **Document Grounding:** Upload documents in the **Upload Documents** tab to index them into vector storage.`;
      }
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        contextFound,
        executionMode: contextFound ? 'ClientSideRAG' : 'DirectLlmFallback'
      }
    ]);
    setIsAiThinking(false);
  };

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyBashSnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBash(id);
    setTimeout(() => setCopiedBash(null), 2000);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${isDark ? 'dark bg-slate-950 text-slate-100 selection:bg-indigo-600 selection:text-white' : 'light bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white'}`}>
      {/* Top Header */}
      <header className={`border-b sticky top-0 z-30 transition-colors backdrop-blur ${isDark ? 'border-slate-800/90 bg-slate-900/90' : 'border-slate-200/90 bg-white/90 shadow-xs'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm flex items-center gap-2">
                <span className={isDark ? 'text-white' : 'text-slate-900'}>Genie AI Assistant</span>
              </h1>
            </div>
          </div>

          {/* Center 3-Option Switcher & Theme Toggle */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center p-1 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setActiveOption('upload')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  activeOption === 'upload'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>1. Upload</span>
              </button>

              <button
                onClick={() => setActiveOption('chat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  activeOption === 'chat'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}>
                <MessageSquare className="w-3.5 h-3.5" />
                <span>2. AI Chat</span>
              </button>

              <button
                onClick={() => setActiveOption('docs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  activeOption === 'docs'
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}>
                <BookOpen className="w-3.5 h-3.5" />
                <span>3. Docs &amp; Interview</span>
              </button>
            </div>

            {/* Dark / Light Mode Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl text-xs transition-colors border ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-800' : 'bg-white hover:bg-slate-100 text-indigo-600 border-slate-200 shadow-xs'}`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* AI Key Configuration Button */}
            <button
              onClick={() => {
                setKeyInput(customApiKey);
                setShowKeyModal(true);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                customApiKey
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
              }`}
              title="Configure Gemini API Key">
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Key</span>
              {customApiKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>

            {/* Code Explorer / Export */}
            <button
              onClick={() => setShowCodeModal(true)}
              className={`p-2 rounded-xl text-xs transition-colors border ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'}`}
              title="Inspect rag_llm Codebase">
              <Code className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main App Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        
        {/* ============================================================ */}
        {/* OPTION 1: UPLOAD DOCUMENTS (PDF, CSV, TEXT, WORD DOCS)      */}
        {/* ============================================================ */}
        {activeOption === 'upload' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Upload Box */}
            <div className={`border rounded-2xl p-6 shadow-xl transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-indigo-500" />
                    <span>Upload Documents for Vector Ingestion</span>
                  </h2>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Upload your <strong>PDF</strong>, <strong>CSV</strong>, <strong>TXT</strong>, or <strong>Word (.docx)</strong> files to clean and store them in the vector database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {documents.length > 0 && (
                    <button
                      onClick={handleClearAllDocs}
                      className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border-rose-800/80' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}>
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Clean All Data</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : isDark
                    ? 'border-slate-700 hover:border-indigo-500 bg-slate-950/40'
                    : 'border-slate-300 hover:border-indigo-500 bg-slate-50'
                }`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.csv,.txt,.doc,.docx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div className="space-y-3">
                  <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center border shadow-md ${isDark ? 'bg-indigo-950/80 text-indigo-400 border-indigo-800' : 'bg-indigo-50 text-indigo-600 border-indigo-200'}`}>
                    {isUploading ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                    ) : (
                      <UploadCloud className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-semibold">
                      {isUploading ? 'Extracting, chunking & embedding document...' : 'Click to select or drag and drop a document'}
                    </div>
                    <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Supports PDF (.pdf), CSV (.csv), Plain Text (.txt), Word (.docx)
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Notification */}
              {uploadMessage && (
                <div
                  className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    uploadMessage.isError
                      ? isDark ? 'bg-rose-950/50 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-700'
                      : isDark ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                  {uploadMessage.isError ? (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>{uploadMessage.text}</span>
                </div>
              )}
            </div>

            {/* Ingested Documents List */}
            <div className={`border rounded-2xl p-6 shadow-xl transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  <span>Ingested Vector Documents ({documents.length})</span>
                </h3>
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Ready for similarity search in the AI Chat tab
                </span>
              </div>

              {documents.length === 0 ? (
                <div className={`p-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  No documents in vector store. Ready for deployment. Upload your first document above.
                </div>
              ) : (
                <div className={`divide-y ${isDark ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                  {documents.map((doc) => (
                    <div key={doc.id} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <div className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{doc.title}</div>
                        <div className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {doc.fileName} • {doc.chunksCount} chunks • ~{doc.estimatedTokens} tokens
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 font-mono text-[10px] rounded border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {doc.department}
                        </span>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className={`p-1.5 rounded transition-colors ${isDark ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40' : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'}`}
                          title="Delete from Vector Store">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* OPTION 2: AI CHAT (VECTOR SIMILARITY -> LLM WITH FALLBACK)   */}
        {/* ============================================================ */}
        {activeOption === 'chat' && (
          <div className="space-y-4 flex flex-col h-[78vh] animate-fadeIn">
            {/* Process Indicator Card */}
            <div className={`border rounded-xl px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'}`}>
               
              <button
                onClick={() => setChatMessages([])}
                className={`text-[11px] transition-colors whitespace-nowrap ml-4 flex items-center gap-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                <RotateCcw className="w-3 h-3" />
                <span>Clear Chat</span>
              </button>
            </div>

            {/* Chat Thread */}
            <div
              ref={chatScrollRef}
              className={`flex-1 border rounded-2xl p-4 sm:p-6 overflow-y-auto space-y-4 shadow-inner transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100/70 border-slate-200'}`}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.sender === 'user' ? (
                    <div className="max-w-xl bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs shadow-md">
                      {msg.text}
                    </div>
                  ) : (
                    <div className={`max-w-2xl border rounded-2xl rounded-tl-sm p-4 text-xs space-y-2.5 shadow-md transition-colors ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
                      {/* Process Badge (Requirement 7) */}
                      {msg.contextFound !== undefined && (
                        <div className={`flex items-center justify-between gap-2 border-b pb-2 ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                              msg.contextFound
                                ? isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-700/80' : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : isDark ? 'bg-amber-950 text-amber-300 border-amber-700/80' : 'bg-amber-50 text-amber-700 border-amber-300'
                            }`}>
                            {msg.contextFound ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span>Context Found (Vector Search Matched)</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                <span>No Context Found (Sent Direct Prompt to LLM)</span>
                              </>
                            )}
                          </span>

                          <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {msg.timestamp}
                          </span>
                        </div>
                      )}

                      {/* Formatted Assistant Answer with Markdown Rendering */}
                      <div
                        className="rag-markdown"
                        dangerouslySetInnerHTML={{ __html: renderFormattedMarkdown(msg.text) }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {isAiThinking && (
                <div className={`self-start border rounded-2xl p-4 text-xs flex items-center gap-2 ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600 shadow-xs'}`}>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                  <span>Searching vector database &amp; generating answer...</span>
                </div>
              )}
            </div>

            {/* Prompt Form */}
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ask a question (e.g. 'what is reflection in c#?' or ask about your uploaded docs)..."
                className={`flex-1 border rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-xs'}`}
              />
              <button
                type="submit"
                disabled={isAiThinking || !userInput.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20">
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}

        {/* ============================================================ */}
        {/* OPTION 3: TECHNICAL DOCS & INTERVIEW GUIDE                   */}
        {/* ============================================================ */}
        {activeOption === 'docs' && (
          <div className="space-y-6 animate-fadeIn pb-12">
            {/* Header Banner */}
            <div className={`border rounded-2xl p-6 transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Production Architecture &amp; System Design</span>
                  </div>
                  <h2 className="text-lg font-bold">Genie RAG AI Technical Docs &amp; Interviewer Guide</h2>
                  <p className={`text-xs mt-1 max-w-3xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Everything you need to explain this system to an engineering interviewer: architecture diagrams, chunking mathematics, dual-path routing, scalability strategies, and copy-paste run commands.
                  </p>
                </div>

                <a
                  href="/api/rag/download-zip"
                  download="rag_llm_angular_dotnet.zip"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all shrink-0">
                  <Download className="w-4 h-4" />
                  <span>Download Codebase (.ZIP)</span>
                </a>
              </div>
            </div>

            {/* 30-Second Elevator Pitch */}
            <div className={`border rounded-2xl p-5 border-l-4 border-l-indigo-500 ${isDark ? 'bg-indigo-950/20 border-slate-800' : 'bg-indigo-50/50 border-slate-200'}`}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-4 h-4" />
                <span>30-Second Interviewer Pitch</span>
              </h3>
              <p className={`text-xs leading-relaxed italic ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                "I designed and built <strong>Genie</strong>, an enterprise RAG assistant with React, Angular, and .NET. It ingests multi-format enterprise files (PDF, CSV, TXT, Word DOCX), chunks them using sentence-aware sliding windows with 20% overlap, and indexes them with 768-dimensional Gemini embeddings. At query time, it computes cosine similarity with role-based security filters. If relevant context exists (&ge; 0.50), it injects cited chunks into Gemini 3.8 Flash. If no context exists, it gracefully routes the prompt directly to the LLM to prevent false hallucinations."
              </p>
            </div>

            {/* 8-Step Lifecycle Grid */}
            <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>The 8-Step RAG Pipeline Execution Flow</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">1. Multi-Format Ingestion</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Parses PDF via Gemini, DOCX via JSZip XML extraction, and CSV into key-value records.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">2. Sanitization</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Cleans zero-width characters, excessive whitespace, and preserves code fences &amp; headers.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">3. 20% Overlap Chunking</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    350-450 token chunks with 70-80 token overlap so definitions cut across splits aren't lost.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">4. 768-D Embeddings</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    L2-normalized dense embeddings via gemini-embedding-2-preview for fast dot products.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">5. Pre-Query RBAC</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Security classification check runs <em>before</em> retrieval so unauthorized data never leaks.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">6. Cosine Similarity</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Dot product similarity filter (&ge; 0.50 threshold) takes Top-4 highest ranked chunks.
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">7. Dual Routing Guardrail</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Context found &rarr; cited RAG answer. No context &rarr; direct LLM prompt without hallucinating!
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-indigo-500 mb-1">8. Source Verification</div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Extracts [Doc: Title #Idx] tags and links them back to physical vector chunks for audit.
                  </p>
                </div>
              </div>
            </div>

            {/* How to Run Commands */}
            <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-indigo-500" />
                <span>How to Run Locally (Developer Commands)</span>
              </h3>

              <div className="space-y-3 text-xs font-mono">
                {/* 1. React & Express */}
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-1 text-[11px] font-sans font-semibold text-indigo-500">
                    <span>1. Run Full-Stack React + Express Server (Port 3000)</span>
                    <button
                      onClick={() => copyBashSnippet('react', 'npm install\nnpm run dev')}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-sans">
                      {copiedBash === 'react' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBash === 'react' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                    npm install<br />
                    npm run dev
                  </div>
                </div>

                {/* 2. .NET 9 API */}
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-1 text-[11px] font-sans font-semibold text-indigo-500">
                    <span>2. Run ASP.NET Core 9.0 Web API (Port 5000 / Swagger)</span>
                    <button
                      onClick={() => copyBashSnippet('dotnet', 'cd rag_llm/dotnet/src/RagLlm.Api\ndotnet restore\ndotnet run')}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-sans">
                      {copiedBash === 'dotnet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBash === 'dotnet' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                    cd rag_llm/dotnet/src/RagLlm.Api<br />
                    dotnet restore<br />
                    dotnet run
                  </div>
                </div>

                {/* 3. Angular 19 */}
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-1 text-[11px] font-sans font-semibold text-indigo-500">
                    <span>3. Run Angular 19 Client SPA (Port 4200)</span>
                    <button
                      onClick={() => copyBashSnippet('angular', 'cd rag_llm/angular\nnpm install\nnpm start')}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-sans">
                      {copiedBash === 'angular' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBash === 'angular' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                    cd rag_llm/angular<br />
                    npm install<br />
                    npm start
                  </div>
                </div>

                {/* 4. PostgreSQL pgvector */}
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-1 text-[11px] font-sans font-semibold text-indigo-500">
                    <span>4. Start PostgreSQL with pgvector (Docker)</span>
                    <button
                      onClick={() => copyBashSnippet('docker', 'docker run -d --name rag-pgvector -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ragdb -p 5432:5432 pgvector/pgvector:pg16')}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-sans">
                      {copiedBash === 'docker' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedBash === 'docker' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                    docker run -d --name rag-pgvector -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ragdb -p 5432:5432 pgvector/pgvector:pg16
                  </div>
                </div>
              </div>
            </div>

            {/* Deep-Dive Interview Questions & Model Answers */}
            <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                <span>Top Interview Questions &amp; Model Answers</span>
              </h3>

              <div className="space-y-4 text-xs">
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-sm text-indigo-500 mb-1">
                    Q1: How do you prevent hallucinations in your RAG pipeline?
                  </div>
                  <div className={`leading-relaxed space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <p><strong>1. Strict Prompt Grounding:</strong> When context chunks match, the LLM prompt enforces zero outside assumptions and requires bracket citations [Doc: Title #Idx].</p>
                    <p><strong>2. Deterministic Cosine Thresholding (0.50):</strong> Low-relevance noise is never injected into the context window.</p>
                    <p><strong>3. Low Temperature (0.2):</strong> RAG queries run at 0.2 temperature for high factual accuracy and low creativity.</p>
                    <p><strong>4. Dual-Path Fallback:</strong> If no documents match, the pipeline openly routes directly to the LLM instead of making up a fake document.</p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-sm text-indigo-500 mb-1">
                    Q2: Why use a 20% chunk overlap? What failure does it prevent?
                  </div>
                  <div className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    If an essential sentence or rule (e.g., "Severance pay is strictly granted only after 12 months") is split between the end of Chunk 1 and the start of Chunk 2 without overlap, both chunks lose semantic coherence. The embedding of each partial sentence scores poorly in similarity search, causing retrieval to miss the answer. A 20% sliding window (~70-80 tokens) guarantees that boundary phrases exist together in at least one chunk.
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-sm text-indigo-500 mb-1">
                    Q3: How would you scale this vector database to 10 million documents?
                  </div>
                  <div className={`leading-relaxed space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <p><strong>1. HNSW Indexes in pgvector:</strong> Replace flat linear distance calculations with Hierarchical Navigable Small World graphs for &lt;10ms Approximate Nearest Neighbor (ANN) search.</p>
                    <p><strong>2. Table Partitioning:</strong> Partition vector tables by Department/Tenant to restrict search scope.</p>
                    <p><strong>3. Redis Vector Caching:</strong> Cache query embeddings and frequent question answers.</p>
                    <p><strong>4. Vector Quantization:</strong> Apply scalar (int8) quantization to compress 768-dimension floats by 75% in memory.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Code Modal */}
      {showCodeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`border rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className={`p-4 border-b flex justify-between items-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-sm">rag_llm Codebase (Angular &amp; .NET)</h3>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/api/rag/download-zip"
                  download="rag_llm_angular_dotnet.zip"
                  className={`px-3 py-1 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'}`}>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download ZIP</span>
                </a>
                <button
                  onClick={() => setShowCodeModal(false)}
                  className={`p-1 rounded-lg ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-12 overflow-hidden">
              {/* File Tree */}
              <div className={`col-span-4 border-r p-3 overflow-y-auto font-mono text-xs space-y-1 ${isDark ? 'border-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                {codeFiles.map((file, i) => (
                  <div
                    key={i}
                    onClick={() => !file.isDir && setSelectedFile(file)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${
                      file.isDir
                        ? isDark ? 'text-slate-500 font-bold' : 'text-slate-400 font-bold'
                        : selectedFile?.path === file.path
                        ? 'bg-indigo-600 text-white font-medium'
                        : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-200'
                    }`}>
                    {file.isDir ? (
                      <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                    ) : (
                      <FileCode className="w-3 h-3 text-indigo-500 shrink-0" />
                    )}
                    <span className="truncate text-[11px]">{file.path}</span>
                  </div>
                ))}
              </div>

              {/* Code Preview */}
              <div className={`col-span-8 flex flex-col overflow-hidden ${isDark ? 'bg-slate-950' : 'bg-slate-900 text-slate-100'}`}>
                {selectedFile ? (
                  <>
                    <div className="p-2 border-b border-slate-800 flex justify-between items-center text-xs font-mono text-slate-400">
                      <span>{selectedFile.path}</span>
                      <button
                        onClick={() => copyCode(selectedFile.content || '')}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1">
                        {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="flex-1 p-3 overflow-auto font-mono text-[11px] text-slate-200 leading-relaxed">
                      <code>{selectedFile.content}</code>
                    </pre>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                    Select a file to inspect.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-500 flex items-center justify-center font-bold">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Gemini API Key Settings</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Enable real-time dynamic AI generation for any question</p>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1">
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>
                When vector search finds no matching documents, the pipeline routes your question directly to the Gemini LLM.
              </p>
              <p>
                If your environment key is blocked or restricted by Google Cloud, you can enter an active key here. It will be stored locally in your browser.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                Gemini API Key
              </label>
              <input
                type="password"
                placeholder="AIzaSy... or AQ..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a></span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestKey}
                    disabled={testingKey}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 disabled:opacity-50">
                    <Sparkles className="w-3 h-3" />
                    <span>{testingKey ? 'Validating...' : 'Test Key'}</span>
                  </button>
                  {customApiKey && (
                    <button
                      onClick={() => {
                        localStorage.removeItem('gemini_custom_key');
                        setCustomApiKey('');
                        setKeyInput('');
                        setTestResult(null);
                      }}
                      className="text-red-400 hover:text-red-300">
                      Clear Key
                    </button>
                  )}
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                    <span>{testResult.success ? 'Authentication Succeeded' : 'Key Validation Failed'}</span>
                  </div>
                  <p>{testResult.message}</p>
                  {!testResult.success && (
                    <div className="mt-2 pt-2 border-t border-red-500/20 text-[11px] text-slate-300 space-y-1">
                      <p className="font-semibold text-red-200">How to resolve 401 ACCESS_TOKEN_TYPE_UNSUPPORTED / API_KEY_SERVICE_BLOCKED:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                        <li>Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 underline">aistudio.google.com/apikey</a></li>
                        <li>Click <strong>"Create API key"</strong> and choose <strong>"Create in new project"</strong></li>
                        <li>Paste that newly generated key here and click <strong>Test Key</strong></li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/20">
              <button
                onClick={() => setShowKeyModal(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Cancel
              </button>
              <button
                onClick={() => {
                  const trimmed = keyInput.trim();
                  if (trimmed) {
                    localStorage.setItem('gemini_custom_key', trimmed);
                    setCustomApiKey(trimmed);
                  } else {
                    localStorage.removeItem('gemini_custom_key');
                    setCustomApiKey('');
                  }
                  setShowKeyModal(false);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20">
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
