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
  Key,
  HardDrive,
  Search,
  Tag,
  ChevronDown,
  ChevronUp,
  Globe,
  Cloud,
  AlertTriangle
} from 'lucide-react';
import { INTERVIEW_QUESTIONS } from './interviewData';
import {
  GithubSyncConfig,
  loadGithubSyncConfig,
  saveGithubSyncConfig,
  fetchGlobalStoreFromGithubOrStatic,
  mergeDocumentsIntoGithub,
  forceDeleteFromGithub,
  testGithubConnection,
  normalizeDoc,
  normalizeChunk,
  normalizeBackendUrl,
  buildApiUrl,
  synthesizeReadableAnswerFromChunks
} from './githubStore';

// Configure marked for GitHub-Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: true,
});

function sanitizeRenderedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

function renderFormattedMarkdown(text: string): string {
  if (!text) return '';

  const withCitations = text.replace(
    /\[(?:Doc|Source):\s*([^#\]]+)?\s*#?(\d+)?\]/gi,
    '<span class="rag-citation-badge">$&</span>'
  );

  try {
    return sanitizeRenderedHtml(marked.parse(withCitations) as string);
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
  syncedToGithub?: boolean;
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

// Levenshtein distance for fuzzy matching typos (e.g. "refleaction" vs "reflection")
function levenshteinDist(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;
  const v0 = new Int32Array(s2.length + 1);
  const v1 = new Int32Array(s2.length + 1);
  for (let i = 0; i <= s2.length; i++) v0[i] = i;
  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= s2.length; j++) v0[j] = v1[j];
  }
  return v1[s2.length];
}

function splitCamelAndWords(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\w\s#+.]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1);
}

function computeWordSimilarity(w1: string, w2: string): number {
  if (w1 === w2) return 1.0;
  if (w1.length < 3 || w2.length < 3) return w1 === w2 ? 1.0 : 0;

  const minLen = Math.min(w1.length, w2.length);
  const maxLen = Math.max(w1.length, w2.length);
  const lenRatio = minLen / maxLen;

  // Prefix/substring similarity only when the shorter token represents most of the longer word
  if (minLen >= 4 && lenRatio >= 0.60 && (w1.startsWith(w2) || w2.startsWith(w1))) {
    return 0.92;
  }
  if (minLen >= 5 && lenRatio >= 0.70 && (w1.includes(w2) || w2.includes(w1))) {
    return 0.88;
  }

  const dist = levenshteinDist(w1, w2);
  if (dist <= 2 && maxLen >= 5 && lenRatio >= 0.70) return 1 - (dist / maxLen);
  if (dist === 1 && minLen >= 4) return 0.85;
  return 0;
}

const STOP_WORDS = new Set([
  'what', 'who', 'whom', 'whose', 'which', 'is', 'are', 'was', 'were', 'am',
  'be', 'been', 'being', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'to', 'from', 'up', 'down', 'of', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'tell', 'me', 'my',
  'mine', 'you', 'your', 'yours', 'yourself', 'we', 'our', 'ours', 'us', 'they',
  'their', 'theirs', 'them', 'he', 'him', 'his', 'she', 'her', 'hers', 'it',
  'its', 'itself', 'this', 'that', 'these', 'those', 'do', 'does', 'did',
  'done', 'have', 'has', 'had', 'give', 'explain', 'describe', 'define', 'please'
]);

function scoreChunkRelevance(
  query: string,
  chunk: { title?: string; content: string }
): { score: number; matchedWords: string[] } {
  const rawWords = splitCamelAndWords(query);
  const contentWords = rawWords.filter(w => !STOP_WORDS.has(w));
  const queryTerms = contentWords.length > 0 ? contentWords : rawWords;

  if (queryTerms.length === 0) return { score: 0, matchedWords: [] };

  const titleTokens = splitCamelAndWords(chunk.title || '');
  const titleTokenSet = new Set(titleTokens);
  const contentTokens = splitCamelAndWords(chunk.content);
  const contentTokenSet = new Set(contentTokens);
  const allTokens = Array.from(new Set([...titleTokens, ...contentTokens]));

  const matchedWords: string[] = [];
  let totalTermScore = 0;

  for (const qTerm of queryTerms) {
    let bestTermScore = 0;

    if (contentTokenSet.has(qTerm)) {
      bestTermScore = Math.max(bestTermScore, 1.0);
    }
    if (titleTokenSet.has(qTerm)) {
      bestTermScore = Math.max(bestTermScore, 1.2);
    }

    if (bestTermScore < 1.0) {
      for (const cWord of allTokens) {
        const sim = computeWordSimilarity(qTerm, cWord);
        if (sim >= 0.72) {
          bestTermScore = Math.max(bestTermScore, sim);
          if (titleTokenSet.has(cWord)) {
            bestTermScore += 0.25;
          }
          if (bestTermScore >= 1.0) break;
        }
      }
    }

    if (bestTermScore >= 0.72) {
      matchedWords.push(qTerm);
      totalTermScore += bestTermScore;
    }
  }

  const coverage = totalTermScore / queryTerms.length;
  let titleBonus = 0;
  for (const qTerm of queryTerms) {
    for (const tWord of titleTokens) {
      const titleSim = computeWordSimilarity(qTerm, tWord);
      if (titleSim >= 0.78) {
        titleBonus = Math.max(titleBonus, 0.40);
      }
    }
  }

  const finalScore = Math.min(coverage + titleBonus, 1.0);
  return { score: finalScore, matchedWords };
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('genie_theme') as 'dark' | 'light') || 'dark';
  });
  const [activeOption, setActiveOption] = useState<'upload' | 'chat' | 'docs'>('chat');
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Option 1: Upload Documents State (persisted to localStorage for offline/GitHub Pages/DB disconnects)
  const [documents, setDocuments] = useState<StoredDoc[]>(() => {
    try {
      const saved = localStorage.getItem('genie_stored_documents');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    text: string;
    variant?: 'success' | 'warning' | 'error';
    needsGithubSync?: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const lastSyncAtRef = useRef<number>(0);

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

  // Interview Guide State
  const [interviewSearch, setInterviewSearch] = useState('');
  const [interviewCategory, setInterviewCategory] = useState<string>('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Client-side Vector Chunks for GitHub Pages / Static hosting (persisted to localStorage)
  const [clientChunks, setClientChunks] = useState<ClientChunk[]>(() => {
    try {
      const saved = localStorage.getItem('genie_stored_chunks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('genie_stored_documents', JSON.stringify(documents));
    } catch (e) {
      console.warn('Could not persist documents to localStorage:', e);
    }
  }, [documents]);

  useEffect(() => {
    try {
      localStorage.setItem('genie_stored_chunks', JSON.stringify(clientChunks));
    } catch (e) {
      console.warn('Could not persist chunks to localStorage:', e);
    }
  }, [clientChunks]);

  // Custom Gemini API Key State
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem('gemini_custom_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(customApiKey);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Global GitHub Sync & Force-Delete State
  const [githubConfig, setGithubConfig] = useState<GithubSyncConfig>(() => loadGithubSyncConfig());
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [ghDraft, setGhDraft] = useState<GithubSyncConfig>(() => loadGithubSyncConfig());
  const [testingGithub, setTestingGithub] = useState(false);
  const [githubTestResult, setGithubTestResult] = useState<{ ok: boolean; canPush: boolean; message: string } | null>(null);
  const [isSyncingGithub, setIsSyncingGithub] = useState(false);
  const [serverGithubConfigured, setServerGithubConfigured] = useState(false);
  const [globalSourceLabel, setGlobalSourceLabel] = useState<'github-live' | 'static-bundle' | 'server' | 'local'>('local');
  const [forceDeleteModal, setForceDeleteModal] = useState<{ mode: 'single'; doc: StoredDoc } | { mode: 'all' } | null>(null);
  const [forceDeleteConfirmText, setForceDeleteConfirmText] = useState('');
  const [isForceDeleting, setIsForceDeleting] = useState(false);

  // Direct Browser Gemini Caller (for Static GitHub Pages / Frontend Deployment)
  const callGeminiDirectlyFromBrowser = async (
    apiKey: string,
    prompt: string,
    systemInstruction?: string,
    temperature = 0.15
  ): Promise<string> => {
    const models = [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.8-flash',
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
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: 4096
          }
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
      const res = await fetch(buildApiUrl('/api/gemini/validate-key', githubConfig), {
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
    const maybeAutoRefresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncAtRef.current >= 30_000) {
        fetchDocuments();
      }
    };
    window.addEventListener('focus', maybeAutoRefresh);
    document.addEventListener('visibilitychange', maybeAutoRefresh);
    return () => {
      window.removeEventListener('focus', maybeAutoRefresh);
      document.removeEventListener('visibilitychange', maybeAutoRefresh);
    };
  }, [githubConfig]);

  useEffect(() => {
    if ((activeOption === 'upload' || activeOption === 'chat') && Date.now() - lastSyncAtRef.current >= 30_000) {
      fetchDocuments();
    }
  }, [activeOption]);

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

  const fetchDocuments = async (overrideConfig?: GithubSyncConfig): Promise<{
    serverGithubConfigured: boolean;
    docs: StoredDoc[];
    chunks: ClientChunk[];
  }> => {
    const activeGhConfig = overrideConfig || githubConfig;
    let remoteDocs: StoredDoc[] = [];
    let remoteChunks: ClientChunk[] = [];
    let fetchedRemote = false;
    let detectedServerGithub = serverGithubConfigured;

    // 1. Try full-stack backend global store first (when Node server or Backend URL is configured)
    try {
      const res = await fetch(buildApiUrl(`/api/global-store?t=${Date.now()}`, activeGhConfig), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.githubConfigured === 'boolean') {
          detectedServerGithub = data.githubConfigured;
          setServerGithubConfigured(data.githubConfigured);
        }
        if (!overrideConfig && data.githubOwner && data.githubRepoName) {
          const syncedCfg: GithubSyncConfig = {
            owner: data.githubOwner,
            repo: data.githubRepoName,
            branch: data.githubBranch || 'main',
            filePath: data.githubStorePath || 'public/global_vector_store.json',
            token: activeGhConfig.token,
            backendUrl: activeGhConfig.backendUrl
          };
          setGithubConfig(syncedCfg);
          saveGithubSyncConfig(syncedCfg);
        }
        if (Array.isArray(data.documents) && Array.isArray(data.chunks)) {
          remoteDocs = data.documents.map((d: any) => normalizeDoc(d, true));
          remoteChunks = data.chunks.map(normalizeChunk);
          fetchedRemote = true;
          setGlobalSourceLabel(data.githubLiveReachable ? 'github-live' : 'server');
        }
      }
    } catch {
      // Static hosting / GitHub Pages
    }

    // 2. Fetch live global store from GitHub (raw/API) or static bundled ./global_vector_store.json
    if (!fetchedRemote || remoteDocs.length === 0) {
      const ghRes = await fetchGlobalStoreFromGithubOrStatic(activeGhConfig);
      if (ghRes) {
        const remoteDocIds = new Set(remoteDocs.map(d => d.id));
        for (const d of ghRes.store.documents) {
          if (!remoteDocIds.has(d.id)) remoteDocs.push(normalizeDoc(d, true));
        }
        const remoteChunkIds = new Set(remoteChunks.map(c => c.id));
        for (const c of ghRes.store.chunks) {
          if (!remoteChunkIds.has(c.id)) remoteChunks.push(normalizeChunk(c));
        }
        fetchedRemote = true;
        setGlobalSourceLabel(ghRes.source);
      }
    }

    // 3. Preserve local unsynced documents from localStorage (never drop pending local uploads!)
    let localDocs: StoredDoc[] = [];
    let localChunks: ClientChunk[] = [];
    try {
      const savedDocs = localStorage.getItem('genie_stored_documents');
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed)) localDocs = parsed;
      }
      const savedChunks = localStorage.getItem('genie_stored_chunks');
      if (savedChunks) {
        const parsed = JSON.parse(savedChunks);
        if (Array.isArray(parsed)) localChunks = parsed;
      }
    } catch (err) {
      console.warn('Error reading from localStorage:', err);
    }

    // Merge remote global store + local pending docs (if remote fetch failed, keep ALL local docs!)
    const mergedDocsMap = new Map<string, StoredDoc>();
    for (const d of remoteDocs) {
      mergedDocsMap.set(d.id, { ...d, syncedToGithub: true });
    }
    for (const d of localDocs) {
      if (!fetchedRemote || d.syncedToGithub === false) {
        if (!mergedDocsMap.has(d.id)) {
          mergedDocsMap.set(d.id, d);
        }
      }
    }

    const activeDocIds = new Set(mergedDocsMap.keys());
    const mergedChunksMap = new Map<string, ClientChunk>();
    for (const c of remoteChunks) {
      if (activeDocIds.has(c.docId)) mergedChunksMap.set(c.id, c);
    }
    for (const c of localChunks) {
      const cDocId = c.docId || (c as any).documentId;
      if (activeDocIds.has(cDocId) && !mergedChunksMap.has(c.id)) {
        mergedChunksMap.set(c.id, normalizeChunk(c));
      }
    }

    const finalDocs = Array.from(mergedDocsMap.values());
    const finalChunks = Array.from(mergedChunksMap.values());

    setDocuments(finalDocs);
    setClientChunks(finalChunks);
    lastSyncAtRef.current = Date.now();

    try {
      localStorage.setItem('genie_stored_documents', JSON.stringify(finalDocs));
      localStorage.setItem('genie_stored_chunks', JSON.stringify(finalChunks));
    } catch (err) {
      console.warn('LocalStorage update error:', err);
    }

    return {
      serverGithubConfigured: detectedServerGithub,
      docs: finalDocs,
      chunks: finalChunks
    };
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
      const res = await fetch(buildApiUrl('/api/rag/code-files', githubConfig));
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
          const res = await fetch(buildApiUrl('/api/documents/upload-file', githubConfig), {
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
            let syncedGlobally = Boolean(data.githubSync?.synced);
            let syncMsg = '';
            let syncWarn = false;
            if (syncedGlobally) {
              syncMsg = ' Synced globally to GitHub repository for all users & browsers.';
            } else if (githubConfig.token) {
              try {
                const gsRes = await fetch(buildApiUrl('/api/global-store', githubConfig));
                if (gsRes.ok) {
                  const gsData = await gsRes.json();
                  const docOnly = (gsData.documents || []).filter((d: any) => d.id === data.documentId).map((d: any) => normalizeDoc(d, true));
                  const chunksOnly = (gsData.chunks || []).filter((c: any) => (c.docId || c.documentId) === data.documentId).map(normalizeChunk);
                  await mergeDocumentsIntoGithub(githubConfig, docOnly, chunksOnly, `chore(vector-store): upload chunks for ${file.name}`);
                  syncedGlobally = true;
                  syncMsg = ' Synced globally to GitHub repository for all users & browsers.';
                }
              } catch (ghErr: any) {
                syncWarn = true;
                syncMsg = ` Saved on server, but GitHub global sync failed: ${ghErr.message}`;
              }
            } else {
              syncWarn = true;
              syncMsg = ' Saved on server only. Configure GitHub Sync to share across all browsers.';
            }
            setUploadMessage({
              text: `Ingested "${file.name}" (${data.chunksCreated} vector chunks).${syncMsg}`,
              variant: syncWarn ? 'warning' : 'success',
              needsGithubSync: syncWarn
            });
            await fetchDocuments();
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

        const newDoc: StoredDoc = {
          id: docId,
          title,
          fileName: file.name,
          department: 'General',
          characterCount: clean.length,
          estimatedTokens: Math.ceil(clean.length / 4),
          createdAt: new Date().toISOString(),
          chunksCount: newChunks.length,
          syncedToGithub: false
        };

        // Push globally to GitHub repository if token is configured
        let syncedGlobal = false;
        let syncNote = '';
        if (githubConfig.token) {
          try {
            const mergedRemote = await mergeDocumentsIntoGithub(
              githubConfig,
              [{ ...newDoc, syncedToGithub: true }],
              newChunks.map(normalizeChunk),
              `chore(vector-store): upload chunks for ${file.name}`
            );
            syncedGlobal = true;
            setGlobalSourceLabel('github-live');
            const remoteDocs = mergedRemote.documents.map(d => normalizeDoc(d, true));
            const remoteChunks = mergedRemote.chunks.map(normalizeChunk);
            setDocuments(remoteDocs);
            setClientChunks(remoteChunks);
            localStorage.setItem('genie_stored_documents', JSON.stringify(remoteDocs));
            localStorage.setItem('genie_stored_chunks', JSON.stringify(remoteChunks));
          } catch (ghErr: any) {
            syncNote = ` GitHub global sync failed (${ghErr.message}). Saved locally—click "Push to GitHub" to retry.`;
          }
        }

        if (!syncedGlobal) {
          const updatedChunks = [...newChunks, ...clientChunks];
          const updatedDocs = [newDoc, ...documents];
          setClientChunks(updatedChunks);
          setDocuments(updatedDocs);
          try {
            localStorage.setItem('genie_stored_chunks', JSON.stringify(updatedChunks));
            localStorage.setItem('genie_stored_documents', JSON.stringify(updatedDocs));
          } catch (e) {
            console.warn('LocalStorage save error:', e);
          }
        }

        setUploadMessage({
          text: syncedGlobal
            ? `Uploaded "${file.name}" (${newChunks.length} chunks) and committed permanently to GitHub (${githubConfig.owner}/${githubConfig.repo}/${githubConfig.filePath}). Accessible globally on all browsers & devices until force-deleted!`
            : syncNote
            ? `Saved "${file.name}" (${newChunks.length} chunks) in this browser only.${syncNote}`
            : `Saved "${file.name}" (${newChunks.length} chunks) in this browser ONLY (Local Pending Sync). Other browsers will NOT see it until you configure a GitHub Write Token or Backend Server URL in "GitHub Sync".`,
          variant: syncedGlobal ? 'success' : 'warning',
          needsGithubSync: !syncedGlobal
        });
      } catch (err: any) {
        setUploadMessage({ text: err.message || 'Error processing file', variant: 'error' });
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handlePushAllToGithub = async (
    overrideCfg?: GithubSyncConfig,
    overrideServerConfigured?: boolean,
    overrideDocs?: StoredDoc[],
    overrideChunks?: ClientChunk[]
  ) => {
    const cfg = overrideCfg || githubConfig;
    const activeDocs = overrideDocs || documents;
    const activeChunks = overrideChunks || clientChunks;
    const canUseServer = Boolean(
      overrideServerConfigured !== undefined
        ? overrideServerConfigured
        : serverGithubConfigured || cfg.backendUrl
    );
    if (!cfg.token && !canUseServer) {
      setGhDraft(cfg);
      setShowGithubModal(true);
      return;
    }
    setIsSyncingGithub(true);
    setUploadMessage(null);
    try {
      // 1. Try server-side GitHub sync first (uses server GITHUB_TOKEN / GITHUB_REPO / GITHUB_BRANCH / GITHUB_STORE_PATH)
      if (!cfg.token && canUseServer) {
        const serverResp = await fetch(buildApiUrl('/api/github/sync', cfg), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: cfg.owner,
            repo: cfg.repo,
            branch: cfg.branch,
            filePath: cfg.filePath,
            documents: activeDocs,
            chunks: activeChunks
          })
        });
        const serverData = await serverResp.json();
        if (!serverResp.ok || !serverData.synced) {
          throw new Error(serverData.message || 'Server GitHub sync failed.');
        }
        await fetchDocuments(cfg);
        setUploadMessage({
          text: `Synced ${serverData.documentsCount ?? activeDocs.length} document(s) & ${serverData.chunksCount ?? activeChunks.length} chunks to GitHub (${cfg.owner}/${cfg.repo} on branch "${cfg.branch}"). Globally accessible across all browsers & devices!`,
          variant: 'success'
        });
        return;
      }

      // 2. Direct browser GitHub sync (for GitHub Pages static hosting or custom browser token)
      const merged = await mergeDocumentsIntoGithub(
        cfg,
        activeDocs.map(d => normalizeDoc(d, true)),
        activeChunks.map(normalizeChunk),
        `chore(vector-store): sync ${activeDocs.length} document(s) to global store`
      );
      const syncedDocs = merged.documents.map(d => normalizeDoc(d, true));
      const syncedChunks = merged.chunks.map(normalizeChunk);
      setDocuments(syncedDocs);
      setClientChunks(syncedChunks);
      setGlobalSourceLabel('github-live');
      localStorage.setItem('genie_stored_documents', JSON.stringify(syncedDocs));
      localStorage.setItem('genie_stored_chunks', JSON.stringify(syncedChunks));
      setUploadMessage({
        text: `Synced ${syncedDocs.length} document(s) & ${syncedChunks.length} chunks to GitHub (${cfg.owner}/${cfg.repo}/${cfg.filePath}). Globally accessible across all browsers & devices!`,
        variant: 'success'
      });
    } catch (err: any) {
      setUploadMessage({
        text: `GitHub sync failed: ${err?.message || String(err)}`,
        variant: 'error',
        needsGithubSync: true
      });
    } finally {
      setIsSyncingGithub(false);
    }
  };

  const handlePushSingleDoc = async (doc: StoredDoc) => {
    const canUseServer = Boolean(serverGithubConfigured || githubConfig.backendUrl);
    if (!githubConfig.token && !canUseServer) {
      setGhDraft(githubConfig);
      setGithubTestResult(null);
      setShowGithubModal(true);
      return;
    }

    setIsSyncingGithub(true);
    setUploadMessage(null);
    const docChunks = clientChunks.filter(c => c.docId === doc.id || (c as any).documentId === doc.id);

    try {
      if (!githubConfig.token && canUseServer) {
        const serverResp = await fetch(buildApiUrl('/api/github/sync', githubConfig), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            branch: githubConfig.branch,
            filePath: githubConfig.filePath,
            documents: [normalizeDoc(doc, true)],
            chunks: docChunks.map(normalizeChunk)
          })
        });
        const serverData = await serverResp.json();
        if (!serverResp.ok || !serverData.synced) {
          throw new Error(serverData.message || 'Server GitHub sync failed.');
        }
        await fetchDocuments(githubConfig);
        setUploadMessage({
          text: `Pushed "${doc.fileName}" globally to GitHub (${githubConfig.owner}/${githubConfig.repo}). Other browsers can now see it!`,
          variant: 'success'
        });
        return;
      }

      const merged = await mergeDocumentsIntoGithub(
        githubConfig,
        [normalizeDoc(doc, true)],
        docChunks.map(normalizeChunk),
        `chore(vector-store): upload chunks for ${doc.fileName}`
      );
      const syncedDocs = merged.documents.map(d => normalizeDoc(d, true));
      const syncedChunks = merged.chunks.map(normalizeChunk);
      setDocuments(syncedDocs);
      setClientChunks(syncedChunks);
      setGlobalSourceLabel('github-live');
      localStorage.setItem('genie_stored_documents', JSON.stringify(syncedDocs));
      localStorage.setItem('genie_stored_chunks', JSON.stringify(syncedChunks));
      setUploadMessage({
        text: `Pushed "${doc.fileName}" globally to GitHub (${githubConfig.owner}/${githubConfig.repo}). Other browsers can now see it!`,
        variant: 'success'
      });
    } catch (err: any) {
      setUploadMessage({
        text: `Could not push "${doc.fileName}": ${err?.message || String(err)}`,
        variant: 'error',
        needsGithubSync: true
      });
    } finally {
      setIsSyncingGithub(false);
    }
  };

  const executeForceDelete = async () => {
    if (!forceDeleteModal) return;
    if (forceDeleteModal.mode === 'all' && forceDeleteConfirmText.trim() !== 'FORCE DELETE ALL') {
      return;
    }

    setIsForceDeleting(true);
    try {
      if (forceDeleteModal.mode === 'single') {
        const targetId = forceDeleteModal.doc.id;
        let serverDeletedOnGithub = false;
        try {
          const delRes = await fetch(buildApiUrl(`/api/documents/${encodeURIComponent(targetId)}`, githubConfig), {
            method: 'DELETE'
          });
          if (delRes.ok) {
            const delData = await delRes.json().catch(() => ({}));
            serverDeletedOnGithub = Boolean(delData?.githubSync?.synced);
          }
        } catch {
          // Ignore on static hosting
        }

        let ghNotice = serverDeletedOnGithub ? ' Permanently removed from GitHub global store.' : '';
        if (!serverDeletedOnGithub && githubConfig.token && forceDeleteModal.doc.syncedToGithub !== false) {
          try {
            await forceDeleteFromGithub(
              githubConfig,
              [targetId],
              `chore(vector-store): force delete ${forceDeleteModal.doc.fileName}`
            );
            ghNotice = ' Permanently removed from GitHub global store.';
          } catch (ghErr: any) {
            ghNotice = ` Note: GitHub remote deletion failed (${ghErr.message}).`;
          }
        }

        const updatedDocs = documents.filter(d => d.id !== targetId);
        const updatedChunks = clientChunks.filter(c => c.docId !== targetId);
        setDocuments(updatedDocs);
        setClientChunks(updatedChunks);
        try {
          localStorage.setItem('genie_stored_documents', JSON.stringify(updatedDocs));
          localStorage.setItem('genie_stored_chunks', JSON.stringify(updatedChunks));
        } catch {}

        setUploadMessage({
          text: `Force-deleted "${forceDeleteModal.doc.fileName}".${ghNotice}`,
          variant: 'success'
        });
      } else {
        let serverClearedOnGithub = false;
        try {
          const clearRes = await fetch(buildApiUrl('/api/documents/clear-all', githubConfig), { method: 'POST' });
          if (clearRes.ok) {
            const clearData = await clearRes.json().catch(() => ({}));
            serverClearedOnGithub = Boolean(clearData?.githubSync?.synced);
          }
        } catch {
          // Ignore on static hosting
        }

        let ghNotice = serverClearedOnGithub ? ' Global GitHub chunk store cleared.' : '';
        if (!serverClearedOnGithub && githubConfig.token) {
          try {
            await forceDeleteFromGithub(githubConfig, 'ALL', 'chore(vector-store): force delete all global documents');
            ghNotice = ' Global GitHub chunk store cleared.';
          } catch (ghErr: any) {
            ghNotice = ` Note: GitHub global clear failed (${ghErr.message}).`;
          }
        }

        setDocuments([]);
        setClientChunks([]);
        try {
          localStorage.removeItem('genie_stored_documents');
          localStorage.removeItem('genie_stored_chunks');
        } catch {}
        setUploadMessage({
          text: `Force-deleted all documents and vector chunks.${ghNotice}`,
          variant: 'success'
        });
      }
    } finally {
      setIsForceDeleting(false);
      setForceDeleteModal(null);
      setForceDeleteConfirmText('');
    }
  };

  // Export & Backup Stored Vector Knowledge Base to a JSON file
  const handleExportStore = () => {
    const data = {
      app: 'Genie AI Vector Store',
      exportedAt: new Date().toISOString(),
      documents,
      chunks: clientChunks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genie_vector_store_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import / Restore Stored Vector Knowledge Base from a JSON file
  const handleImportStore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.documents) && Array.isArray(parsed.chunks)) {
          const importedDocs = parsed.documents.map((d: any) => normalizeDoc(d, Boolean(d.syncedToGithub)));
          const importedChunks = parsed.chunks.map(normalizeChunk);
          setDocuments(importedDocs);
          setClientChunks(importedChunks);
          localStorage.setItem('genie_stored_documents', JSON.stringify(importedDocs));
          localStorage.setItem('genie_stored_chunks', JSON.stringify(importedChunks));
          setUploadMessage({
            text: `Loaded ${importedDocs.length} documents and ${importedChunks.length} chunks from backup file! Click "Push to GitHub" if you want to share them globally.`,
            variant: 'warning',
            needsGithubSync: importedDocs.some((d: StoredDoc) => !d.syncedToGithub)
          });
        }
      } catch (err: any) {
        setUploadMessage({ text: 'Invalid vector store JSON file.', variant: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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

    // Step 1: Try full-stack vector DB endpoint first
    try {
      const res = await fetch(buildApiUrl('/api/rag/query', githubConfig), {
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
      // Backend / Vector DB connection not available (e.g. GitHub Pages or DB down)
    }

    // Step 2: Score all stored files & chunks from local persistent store
    const scoredChunks = clientChunks.map(chunk => {
      const { score, matchedWords } = scoreChunkRelevance(questionText, chunk);
      return { ...chunk, score, matchedWords };
    });

    const docMaxScore = new Map<string, number>();
    for (const c of scoredChunks) {
      docMaxScore.set(c.docId, Math.max(docMaxScore.get(c.docId) || 0, c.score));
    }

    const topDocScore = Array.from(docMaxScore.values()).reduce((max, s) => Math.max(max, s), 0);

    // Step 3: Check if vector / file context matched (require solid relevance, block weak noise)
    const contextFound = topDocScore >= 0.30;
    let answerText = '';

    if (contextFound) {
      // Keep only documents close to the top matching document so unrelated docs never leak in
      const docThreshold = Math.max(0.30, topDocScore * 0.72);
      const matchedDocIds = new Set(
        Array.from(docMaxScore.entries())
          .filter(([, score]) => score >= docThreshold)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([docId]) => docId)
      );

      // Retrieve all chunks from the winning matched document(s), ordered by doc rank then chunkIndex
      const retrievedChunks = scoredChunks
        .filter(c => matchedDocIds.has(c.docId))
        .sort((a, b) => {
          const docScoreDiff = (docMaxScore.get(b.docId) || 0) - (docMaxScore.get(a.docId) || 0);
          if (Math.abs(docScoreDiff) > 0.001) return docScoreDiff;
          if (a.docId === b.docId) return a.chunkIndex - b.chunkIndex;
          return a.docId.localeCompare(b.docId);
        })
        .slice(0, 6);

      const contextBlock = retrievedChunks
        .map(c => `--- [Doc: ${c.title} #${c.chunkIndex}] (Relevance: ${(Math.min(c.score, 1) * 100).toFixed(0)}%) ---\n${c.content}`)
        .join('\n\n');

      if (customApiKey) {
        try {
          const systemPrompt = `You are Genie, a principal software engineer and enterprise AI assistant.
Your objective is to provide a clear, complete, well-structured, and authoritative answer grounded strictly in the retrieved context.

CRITICAL QUALITY STANDARDS:
1. CONTEXT GROUNDING & CITATIONS:
   - Ground your answer thoroughly in the provided document context chunks.
   - Cite the sources inline with [Doc: <Title> #<Index>] when referencing statements, profiles, concepts, or pros/cons from them.
2. COMPLETENESS & STRUCTURE:
   - Start with a direct, natural answer to the user's question.
   - Organize supporting details under clear Markdown headings (###) and concise bullet points with bold key terms.
   - When asked for "Pros and Cons" or technical implementation details, include thorough explanations and include code examples only when relevant to the question/context.
   - NEVER leave any section or bullet incomplete or include unrelated documents.`;

          const promptToSend = `=== RETRIEVED KNOWLEDGE BASE CONTEXT ===
${contextBlock}

=== USER QUESTION ===
${questionText}

Please answer the user's question thoroughly and cleanly according to the quality standards above, with inline [Doc: <Title> #<Index>] citations.`;

          const llmResponse = await callGeminiDirectlyFromBrowser(customApiKey, promptToSend, systemPrompt, 0.1);
          answerText = llmResponse || synthesizeReadableAnswerFromChunks(retrievedChunks);
        } catch {
          answerText = synthesizeReadableAnswerFromChunks(retrievedChunks);
        }
      } else {
        answerText = synthesizeReadableAnswerFromChunks(retrievedChunks);
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: answerText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          contextFound: true,
          executionMode: 'ClientSideRAG',
          retrievedCount: retrievedChunks.length,
          sources: Array.from(new Set(retrievedChunks.map(c => c.title))),
          citations: retrievedChunks.map(c => ({
            citationLabel: `Doc: ${c.title} #${c.chunkIndex}`,
            documentTitle: c.title,
            chunkIndex: c.chunkIndex,
            similarityScore: Math.min(Math.round(c.score * 100) / 100, 1),
            department: c.department || 'General',
            snippet: c.content.slice(0, 150) + '...'
          }))
        }
      ]);
      setIsAiThinking(false);
      return;
    } else {
      // "IF VECTOR NOT MATCHED THEN GO FOR LLM CURRENT FLOW" (Requirement #7):
      if (customApiKey) {
        try {
          const systemPrompt = `You are Genie, a principal software engineer and knowledgeable assistant. 
The user is asking a question directly without custom vector documents in the knowledge base.
Provide a comprehensive, accurate, practical, and well-structured answer to the user's question.
Use clean markdown with headings (###), bold key terms, bullet points, and code snippets where appropriate.`;

          const llmResponse = await callGeminiDirectlyFromBrowser(customApiKey, questionText, systemPrompt);
          answerText = llmResponse;
        } catch (geminiErr: any) {
          answerText = `### Direct Gemini Request Notice (Requirement #7)\n\nNo relevant vector documents were found matching **"${questionText}"**, so the query was routed directly to Gemini LLM.\n\n* **Status:** ${geminiErr.message || String(geminiErr)}\n\nPlease click **AI Key** in the top bar to verify or update your key.`;
        }
      } else {
        answerText = `### AI Service Notice (Requirement #7)\n\nNo relevant vector documents were found in your stored files matching **"${questionText}"**.\n\n* **Live LLM Inference:** You are running in client-side static mode (e.g. GitHub Pages). To enable live AI responses for any question, click the **AI Key** button in the top navigation bar and enter your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).\n* **Document Grounding:** Upload documents in the **Upload Documents** tab to index them into vector storage.`;
      }
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        contextFound: false,
        executionMode: 'DirectLlmFallback',
        retrievedCount: 0,
        sources: [],
        citations: []
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

            {/* GitHub Global Store Sync Button */}
            <button
              onClick={() => {
                setGhDraft(githubConfig);
                setGithubTestResult(null);
                setShowGithubModal(true);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border ${
                githubConfig.token || serverGithubConfigured
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                  : isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
              }`}
              title="Configure Global GitHub Chunk Storage">
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GitHub Sync</span>
              {(githubConfig.token || serverGithubConfigured) && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
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

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => fetchDocuments()}
                    className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-sky-500/30' : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'}`}
                    title="Fetch latest global chunks from GitHub server">
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Sync Global</span>
                  </button>

                  <button
                    onClick={() => handlePushAllToGithub()}
                    disabled={isSyncingGithub || documents.length === 0}
                    className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                      githubConfig.token || serverGithubConfigured
                        ? isDark ? 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/70' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                        : isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    }`}
                    title="Commit local chunked documents permanently to GitHub repository">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>{isSyncingGithub ? 'Pushing...' : 'Push to GitHub'}</span>
                  </button>

                  <input
                    type="file"
                    ref={jsonInputRef}
                    onChange={handleImportStore}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    onClick={() => jsonInputRef.current?.click()}
                    className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'}`}
                    title="Import previously saved vector store JSON backup">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Import Store</span>
                  </button>

                  {documents.length > 0 && (
                    <>
                      <button
                        onClick={handleExportStore}
                        className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'}`}
                        title="Download backup JSON file of all ingested vector documents">
                        <Download className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Export Store</span>
                      </button>

                      <button
                        onClick={() => {
                          setForceDeleteConfirmText('');
                          setForceDeleteModal({ mode: 'all' });
                        }}
                        className={`px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1.5 transition-colors ${isDark ? 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border-rose-800/80' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}>
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>Force Delete All</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Global GitHub Storage Status Banner */}
              <div className={`mb-4 p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                githubConfig.token || serverGithubConfigured
                  ? isDark ? 'bg-sky-950/30 border-sky-800/60 text-sky-200' : 'bg-sky-50 border-sky-200 text-sky-800'
                  : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="flex items-start sm:items-center gap-2">
                  <Globe className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${githubConfig.token || serverGithubConfigured ? 'text-sky-400' : 'text-amber-400'}`} />
                  <div>
                    <span className="font-semibold">Global GitHub Chunk Store: </span>
                    <span className="font-mono text-[11px]">{githubConfig.owner}/{githubConfig.repo}/{githubConfig.filePath}</span>
                    <span className="ml-2 text-[11px] opacity-80">
                      ({globalSourceLabel === 'github-live'
                        ? 'Live Global Read Active'
                        : globalSourceLabel === 'server'
                        ? 'Server + Global Store Active'
                        : globalSourceLabel === 'static-bundle'
                        ? 'Static Bundle Read Active'
                        : 'Local Browser Store'}
                      {serverGithubConfigured
                        ? ` • Server Token Active (branch: ${githubConfig.branch})`
                        : githubConfig.token
                        ? ` • Browser Auto-Push Enabled (branch: ${githubConfig.branch})`
                        : ' • Read-Only until Token Added'})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setGhDraft(githubConfig);
                    setGithubTestResult(null);
                    setShowGithubModal(true);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 border transition-colors ${
                    githubConfig.token || serverGithubConfigured
                      ? isDark ? 'bg-sky-900/40 hover:bg-sky-800/50 border-sky-700 text-sky-200' : 'bg-white hover:bg-sky-100 border-sky-300 text-sky-700'
                      : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-600 text-white'
                  }`}>
                  {githubConfig.token || serverGithubConfigured ? 'Configure GitHub Sync' : 'Enable Global GitHub Upload'}
                </button>
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
                      {isUploading ? 'Extracting, chunking & syncing document globally...' : 'Click to select or drag and drop a document'}
                    </div>
                    <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Supports PDF (.pdf), CSV (.csv), Plain Text (.txt), Word (.docx) • Retained permanently until Force Delete
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Notification */}
              {uploadMessage && (
                <div
                  className={`mt-4 p-3 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
                    uploadMessage.variant === 'error'
                      ? isDark ? 'bg-rose-950/50 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-700'
                      : uploadMessage.variant === 'warning'
                      ? isDark ? 'bg-amber-950/50 border-amber-700 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'
                      : isDark ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                  <div className="flex items-start sm:items-center gap-2">
                    {uploadMessage.variant === 'error' ? (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                    ) : uploadMessage.variant === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <span>{uploadMessage.text}</span>
                  </div>
                  {uploadMessage.needsGithubSync && (
                    <button
                      onClick={() => {
                        setGhDraft(githubConfig);
                        setGithubTestResult(null);
                        setShowGithubModal(true);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                      Enable GitHub Sync &amp; Push
                    </button>
                  )}
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
                  Protected — never deleted until you Force Delete
                </span>
              </div>

              {documents.length === 0 ? (
                <div className={`p-8 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  No documents in vector store. Ready for deployment. Upload your first document above.
                </div>
              ) : (
                <div className={`divide-y ${isDark ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                  {documents.map((doc) => (
                    <div key={doc.id} className="py-3 flex justify-between items-center text-xs gap-3">
                      <div className="min-w-0">
                        <div className={`font-semibold flex items-center gap-2 flex-wrap ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                          <span>{doc.title}</span>
                          {doc.syncedToGithub ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${isDark ? 'bg-sky-950/60 text-sky-300 border-sky-800/70' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                              Global GitHub
                            </span>
                          ) : (
                            <>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${isDark ? 'bg-amber-950/60 text-amber-300 border-amber-800/70' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                Local Pending Sync
                              </span>
                              <button
                                onClick={() => handlePushSingleDoc(doc)}
                                disabled={isSyncingGithub}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                  isDark
                                    ? 'bg-sky-950/70 hover:bg-sky-900/70 text-sky-300 border-sky-700/70'
                                    : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                                }`}
                                title="Push this local document to GitHub so all browsers & devices can access it">
                                <Cloud className="w-3 h-3" />
                                <span>{isSyncingGithub ? 'Pushing...' : 'Push'}</span>
                              </button>
                            </>
                          )}
                        </div>
                        <div className={`text-[11px] font-mono mt-0.5 truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {doc.fileName} • {doc.chunksCount} chunks • ~{doc.estimatedTokens} tokens
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`px-2 py-0.5 font-mono text-[10px] rounded border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {doc.department}
                        </span>
                        <button
                          onClick={() => {
                            setForceDeleteConfirmText('');
                            setForceDeleteModal({ mode: 'single', doc });
                          }}
                          className={`p-1.5 rounded transition-colors ${isDark ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40' : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'}`}
                          title="Force Delete from Global Vector Store">
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
                  href={buildApiUrl('/api/rag/download-zip', githubConfig)}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-500" />
                    <span>Top 12 Production RAG Interview Questions &amp; Model Answers</span>
                  </h3>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Master key architectural tradeoffs, chunking math, fuzzy retrieval, RBAC security, and scaling patterns.
                  </p>
                </div>
                <div className="text-xs font-mono px-2.5 py-1 rounded-lg border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 w-fit">
                  {INTERVIEW_QUESTIONS.length} Questions Loaded
                </div>
              </div>

              {/* Search & Category Filter */}
              <div className="space-y-3 mb-5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={interviewSearch}
                    onChange={(e) => setInterviewSearch(e.target.value)}
                    placeholder="Search questions by topic, keyword, or tag (e.g., 'overlap', 'pgvector', 'typo', 'RBAC', 'latency')..."
                    className={`w-full pl-9 pr-9 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                  {interviewSearch && (
                    <button
                      onClick={() => setInterviewSearch('')}
                      className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200">
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {[
                    { id: 'all', label: 'All Questions', count: INTERVIEW_QUESTIONS.length },
                    { id: 'architecture', label: 'Architecture & Guardrails', count: INTERVIEW_QUESTIONS.filter(q => q.category === 'architecture').length },
                    { id: 'chunking', label: 'Chunking & Ingestion', count: INTERVIEW_QUESTIONS.filter(q => q.category === 'chunking').length },
                    { id: 'retrieval', label: 'Retrieval & Search', count: INTERVIEW_QUESTIONS.filter(q => q.category === 'retrieval').length },
                    { id: 'scaling', label: 'Scale & Performance', count: INTERVIEW_QUESTIONS.filter(q => q.category === 'scaling').length },
                    { id: 'production', label: 'Production & DevOps', count: INTERVIEW_QUESTIONS.filter(q => q.category === 'production').length }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setInterviewCategory(cat.id)}
                      className={`px-3 py-1 rounded-lg transition-all text-[11px] whitespace-nowrap flex items-center gap-1.5 border ${
                        interviewCategory === cat.id
                          ? 'bg-indigo-600 text-white font-semibold border-indigo-600 shadow-xs'
                          : isDark
                          ? 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}>
                      <span>{cat.label}</span>
                      <span className={`text-[10px] px-1 rounded ${interviewCategory === cat.id ? 'bg-indigo-700 text-white' : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {INTERVIEW_QUESTIONS.filter((q) => {
                  const matchesCat = interviewCategory === 'all' || q.category === interviewCategory;
                  const query = interviewSearch.toLowerCase().trim();
                  if (!query) return matchesCat;
                  const matchesSearch =
                    q.question.toLowerCase().includes(query) ||
                    q.summary.toLowerCase().includes(query) ||
                    q.tags.some(t => t.toLowerCase().includes(query)) ||
                    q.answerBullets.some(b => b.title.toLowerCase().includes(query) || b.text.toLowerCase().includes(query));
                  return matchesCat && matchesSearch;
                }).map((q) => {
                  const isExpanded = expandedQuestionId === q.id || !interviewSearch;
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isDark ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}>
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-indigo-600 text-white">
                            Q{q.number}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-600'
                          }`}>
                            {q.categoryLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setUserInput(q.question);
                              setActiveOption('chat');
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                              isDark ? 'bg-indigo-950/50 hover:bg-indigo-900 text-indigo-300 border-indigo-800' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                            }`}
                            title="Test this question in AI Chat">
                            <Send className="w-2.5 h-2.5" />
                            <span>Ask in AI Chat</span>
                          </button>

                          <button
                            onClick={() => setExpandedQuestionId(expandedQuestionId === q.id ? null : q.id)}
                            className="text-slate-400 hover:text-slate-200 p-1">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Question Heading */}
                      <h4 className={`font-bold text-sm mb-1.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                        {q.question}
                      </h4>

                      {/* Executive Summary */}
                      <p className={`text-xs italic mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        &ldquo;{q.summary}&rdquo;
                      </p>

                      {/* Answer Breakdown */}
                      {isExpanded && (
                        <div className="space-y-2 border-t pt-3 mt-2 border-slate-800/40 text-xs">
                          {q.answerBullets.map((bullet, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                              <div className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                                <strong className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                  {bullet.title}:
                                </strong>{' '}
                                {bullet.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tag Chips */}
                      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/30 flex-wrap">
                        <Tag className="w-3 h-3 text-slate-500 shrink-0" />
                        {q.tags.map((t, idx) => (
                          <span
                            key={idx}
                            onClick={() => setInterviewSearch(t)}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                              isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                            }`}>
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {INTERVIEW_QUESTIONS.filter((q) => {
                  const matchesCat = interviewCategory === 'all' || q.category === interviewCategory;
                  const query = interviewSearch.toLowerCase().trim();
                  if (!query) return matchesCat;
                  return matchesCat && (
                    q.question.toLowerCase().includes(query) ||
                    q.summary.toLowerCase().includes(query) ||
                    q.tags.some(t => t.toLowerCase().includes(query))
                  );
                }).length === 0 && (
                  <div className={`p-8 text-center text-xs rounded-xl border ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                    No interview questions match "{interviewSearch}". Try searching for keywords like "pgvector", "overlap", "typo", or "scaling".
                  </div>
                )}
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
                  href={buildApiUrl('/api/rag/download-zip', githubConfig)}
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

      {/* GitHub Global Store Configuration Modal */}
      {showGithubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-600/15 text-sky-400 flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Global GitHub Chunk Store Settings</h3>
                  <p className="text-xs text-slate-400">Persist chunked uploads on GitHub so all users &amp; devices access them</p>
                </div>
              </div>
              <button
                onClick={() => setShowGithubModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1 text-slate-300">GitHub Owner</label>
                <input
                  type="text"
                  value={ghDraft.owner}
                  onChange={(e) => setGhDraft({ ...ghDraft, owner: e.target.value })}
                  placeholder="dpxtd-ai"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1 text-slate-300">Repository</label>
                <input
                  type="text"
                  value={ghDraft.repo}
                  onChange={(e) => setGhDraft({ ...ghDraft, repo: e.target.value })}
                  placeholder="genie_ai"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1 text-slate-300">Branch</label>
                <input
                  type="text"
                  value={ghDraft.branch}
                  onChange={(e) => setGhDraft({ ...ghDraft, branch: e.target.value })}
                  placeholder="main"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>
              <div>
                <label className="font-semibold block mb-1 text-slate-300">Global Chunk File Path</label>
                <input
                  type="text"
                  value={ghDraft.filePath}
                  onChange={(e) => setGhDraft({ ...ghDraft, filePath: e.target.value })}
                  placeholder="public/global_vector_store.json"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Backend Server URL <span className="font-normal text-slate-400">(Optional — bridges GitHub Pages to your hosted server)</span>
              </label>
              <input
                type="url"
                placeholder="https://your-server.run.app (leave blank on standalone GitHub Pages)"
                value={ghDraft.backendUrl || ''}
                onChange={(e) => setGhDraft({ ...ghDraft, backendUrl: e.target.value })}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                GitHub Fine-Grained Personal Access Token (Write Access)
              </label>
              <input
                type="password"
                placeholder="github_pat_... or ghp_..."
                value={ghDraft.token}
                onChange={(e) => setGhDraft({ ...ghDraft, token: e.target.value })}
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {serverGithubConfigured && !ghDraft.token
                    ? 'Server GITHUB_TOKEN is active. Leave blank to use server secret.'
                    : <>Readers on other devices need NO token. Uploaders need <code className="text-sky-400">Contents: Read &amp; Write</code> (or Backend Server URL).</>}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      const rawBackend = (ghDraft.backendUrl || '').trim();
                      if (rawBackend && !normalizeBackendUrl(rawBackend)) {
                        setGithubTestResult({
                          ok: false,
                          canPush: false,
                          message: 'Backend Server URL must start with http:// or https://.'
                        });
                        return;
                      }
                      setTestingGithub(true);
                      setGithubTestResult(null);
                      try {
                        const apiRes = await fetch(buildApiUrl('/api/github/test', ghDraft), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(ghDraft)
                        });
                        if (apiRes.ok) {
                          const data = await apiRes.json();
                          setGithubTestResult(data);
                          setTestingGithub(false);
                          return;
                        }
                      } catch {
                        // Static hosting fallback
                      }
                      const res = await testGithubConnection(ghDraft);
                      setGithubTestResult(res);
                      setTestingGithub(false);
                    }}
                    disabled={testingGithub}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 disabled:opacity-50">
                    {testingGithub ? 'Testing...' : 'Test Repo'}
                  </button>
                  {ghDraft.token && (
                    <button
                      onClick={() => setGhDraft({ ...ghDraft, token: '' })}
                      className="text-rose-400 hover:text-rose-300">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {githubTestResult && (
                <div className={`p-3 rounded-xl border text-xs ${
                  githubTestResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {githubTestResult.message}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/20">
              <button
                onClick={() => setShowGithubModal(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const rawBackend = (ghDraft.backendUrl || '').trim();
                  if (rawBackend && !normalizeBackendUrl(rawBackend)) {
                    setGithubTestResult({
                      ok: false,
                      canPush: false,
                      message: 'Backend Server URL must be a valid http:// or https:// URL.'
                    });
                    return;
                  }
                  const normalized = saveGithubSyncConfig(ghDraft);
                  setGithubConfig(normalized);
                  setShowGithubModal(false);
                  const pendingDocsBeforeSync = documents.filter(d => d.syncedToGithub === false);
                  const remoteInfo = await fetchDocuments(normalized);
                  if (pendingDocsBeforeSync.length > 0 && (normalized.token || normalized.backendUrl || remoteInfo.serverGithubConfigured)) {
                    await handlePushAllToGithub(
                      normalized,
                      remoteInfo.serverGithubConfigured,
                      remoteInfo.docs,
                      remoteInfo.chunks
                    );
                  }
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 shadow-md shadow-sky-600/20">
                Save &amp; Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Force Delete Confirmation Modal (Prevents Accidental Data Loss) */}
      {forceDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 ${isDark ? 'bg-slate-900 border-rose-900/60 text-white' : 'bg-white border-rose-200 text-slate-900'}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {forceDeleteModal.mode === 'all' ? 'Force Delete All Global Vector Data?' : 'Force Delete Uploaded File?'}
                </h3>
                <p className="text-xs text-slate-400">
                  Uploaded chunk data is kept permanently until you force-delete it.
                </p>
              </div>
            </div>

            <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${isDark ? 'bg-rose-950/30 border-rose-900/50 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {forceDeleteModal.mode === 'single' ? (
                <>
                  <p>
                    You are about to permanently remove <strong>{forceDeleteModal.doc.fileName}</strong> ({forceDeleteModal.doc.chunksCount} chunks).
                  </p>
                  <p className="opacity-85">
                    {(githubConfig.token || serverGithubConfigured) && forceDeleteModal.doc.syncedToGithub !== false
                      ? `This will commit the deletion to GitHub (${githubConfig.owner}/${githubConfig.repo}/${githubConfig.filePath}) and remove it for all users on all devices.`
                      : forceDeleteModal.doc.syncedToGithub
                      ? 'Note: No GitHub write token is configured in this browser, so this only removes your local copy unless you configure GitHub Sync.'
                      : 'This pending local document and its chunks will be permanently removed.'}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    This will permanently delete all <strong>{documents.length} document(s)</strong> and <strong>{clientChunks.length} chunks</strong>.
                  </p>
                  <p className="font-semibold">Type <code className="px-1.5 py-0.5 rounded bg-rose-900/50 text-white">FORCE DELETE ALL</code> below to confirm:</p>
                  <input
                    type="text"
                    value={forceDeleteConfirmText}
                    onChange={(e) => setForceDeleteConfirmText(e.target.value)}
                    placeholder="FORCE DELETE ALL"
                    className={`w-full mt-1 px-3 py-2 text-xs font-mono rounded-lg border focus:outline-none focus:ring-2 focus:ring-rose-500 ${isDark ? 'bg-slate-950 border-rose-800 text-white' : 'bg-white border-rose-300 text-slate-900'}`}
                  />
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setForceDeleteModal(null);
                  setForceDeleteConfirmText('');
                }}
                disabled={isForceDeleting}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Keep File
              </button>
              <button
                onClick={executeForceDelete}
                disabled={isForceDeleting || (forceDeleteModal.mode === 'all' && forceDeleteConfirmText.trim() !== 'FORCE DELETE ALL')}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 shadow-md shadow-rose-600/20">
                {isForceDeleting ? 'Force Deleting...' : 'Force Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
