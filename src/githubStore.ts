export interface GlobalStoredDoc {
  id: string;
  title: string;
  fileName: string;
  department: string;
  requiredSecurityRole?: string;
  characterCount: number;
  estimatedTokens: number;
  createdAt: string;
  chunksCount: number;
  syncedToGithub?: boolean;
}

export interface GlobalStoredChunk {
  id: string;
  docId: string;
  documentId?: string;
  title: string;
  documentTitle?: string;
  chunkIndex: number;
  content: string;
  department: string;
  requiredSecurityRole?: string;
  tokenCount?: number;
  embedding?: number[];
}

export interface GlobalVectorStorePayload {
  version: number;
  updatedAt: string;
  documents: GlobalStoredDoc[];
  chunks: GlobalStoredChunk[];
}

export interface GithubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  token: string;
}

const VALID_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;
const VALID_BRANCH_RE = /^[a-zA-Z0-9._/-]+$/;

export function parseGithubRepoString(
  rawRepo?: string,
  fallbackOwner = 'dpxtd-ai',
  fallbackRepo = 'genie_ai'
): { owner: string; repo: string } {
  const input = (rawRepo || '').trim();
  if (!input) return { owner: fallbackOwner, repo: fallbackRepo };

  // Handle full https://github.com/owner/repo(.git) URLs
  const ghUrlMatch = input.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (ghUrlMatch) {
    return { owner: ghUrlMatch[1].trim(), repo: ghUrlMatch[2].trim() };
  }

  // Handle git@github.com:owner/repo.git
  const sshMatch = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1].trim(), repo: sshMatch[2].trim() };
  }

  // Handle GitHub Pages URL https://owner.github.io/repo/
  const pagesMatch = input.match(/^https?:\/\/([a-zA-Z0-9-]+)\.github\.io\/([^/\s?#]+)/i);
  if (pagesMatch) {
    return { owner: pagesMatch[1].trim(), repo: pagesMatch[2].trim() };
  }

  // Handle owner/repo format
  const cleaned = input.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0].trim(), repo: parts[1].trim() };
    }
  }

  return { owner: fallbackOwner, repo: cleaned || fallbackRepo };
}

export function normalizeGithubStorePath(rawPath?: string): string {
  let p = (rawPath || '').trim();
  if (!p) return 'public/global_vector_store.json';
  // If user pasted a GitHub blob/raw URL, extract path after branch
  const blobMatch = p.match(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:blob|raw)\/[^/]+\/(.+)$/i);
  if (blobMatch) p = blobMatch[1];
  const rawMatch = p.match(/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/i);
  if (rawMatch) p = rawMatch[1];
  return p.replace(/^[./]+/, '') || 'public/global_vector_store.json';
}

export function detectDefaultGithubRepo(): { owner: string; repo: string } {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.github.io')) {
      const owner = host.replace(/\.github\.io$/, '');
      const firstSeg = window.location.pathname.split('/').filter(Boolean)[0];
      if (owner && firstSeg && VALID_SEGMENT_RE.test(owner) && VALID_SEGMENT_RE.test(firstSeg)) {
        return { owner, repo: firstSeg };
      }
      if (owner && VALID_SEGMENT_RE.test(owner)) {
        return { owner, repo: `${owner}.github.io` };
      }
    }
  }
  return { owner: 'dpxtd-ai', repo: 'genie_ai' };
}

export function loadGithubSyncConfig(): GithubSyncConfig {
  const detected = detectDefaultGithubRepo();
  try {
    const raw = localStorage.getItem('genie_github_sync_config');
    const savedToken = localStorage.getItem('genie_github_token') || '';
    if (raw) {
      const parsed = JSON.parse(raw);
      const parsedOwnerRepo = parsed.repo && String(parsed.repo).includes('/')
        ? parseGithubRepoString(parsed.repo, detected.owner, detected.repo)
        : {
            owner: (parsed.owner || detected.owner).trim(),
            repo: (parsed.repo || detected.repo).trim()
          };
      return {
        owner: parsedOwnerRepo.owner,
        repo: parsedOwnerRepo.repo,
        branch: (parsed.branch || 'main').trim(),
        filePath: normalizeGithubStorePath(parsed.filePath),
        token: savedToken.trim()
      };
    }
    return {
      owner: detected.owner,
      repo: detected.repo,
      branch: 'main',
      filePath: 'public/global_vector_store.json',
      token: savedToken.trim()
    };
  } catch {
    return {
      owner: detected.owner,
      repo: detected.repo,
      branch: 'main',
      filePath: 'public/global_vector_store.json',
      token: ''
    };
  }
}

export function saveGithubSyncConfig(config: GithubSyncConfig): GithubSyncConfig {
  const parsedRepo = config.repo.includes('/') || config.repo.includes('github.')
    ? parseGithubRepoString(config.repo, config.owner || 'dpxtd-ai', 'genie_ai')
    : { owner: config.owner.trim(), repo: config.repo.trim() };

  const normalized: GithubSyncConfig = {
    owner: parsedRepo.owner,
    repo: parsedRepo.repo,
    branch: config.branch.trim() || 'main',
    filePath: normalizeGithubStorePath(config.filePath),
    token: (config.token || '').trim()
  };

  localStorage.setItem(
    'genie_github_sync_config',
    JSON.stringify({
      owner: normalized.owner,
      repo: normalized.repo,
      branch: normalized.branch,
      filePath: normalized.filePath
    })
  );
  if (normalized.token) {
    localStorage.setItem('genie_github_token', normalized.token);
  } else {
    localStorage.removeItem('genie_github_token');
  }
  return normalized;
}

export function validateGithubConfig(config: Pick<GithubSyncConfig, 'owner' | 'repo' | 'branch' | 'filePath'>): string | null {
  if (!config.owner || !VALID_SEGMENT_RE.test(config.owner)) {
    return 'Invalid GitHub owner name.';
  }
  if (!config.repo || !VALID_SEGMENT_RE.test(config.repo)) {
    return 'Invalid GitHub repository name.';
  }
  if (!config.branch || !VALID_BRANCH_RE.test(config.branch) || config.branch.includes('..')) {
    return 'Invalid branch name.';
  }
  const cleanPath = normalizeGithubStorePath(config.filePath);
  if (!cleanPath || cleanPath.includes('..') || !/^[a-zA-Z0-9._/-]+\.json$/.test(cleanPath)) {
    return 'File path must be a relative .json path inside the repository (e.g., public/global_vector_store.json).';
  }
  return null;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const clean = b64.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function normalizeDoc(raw: any, syncedToGithub?: boolean): GlobalStoredDoc {
  return {
    id: String(raw.id),
    title: String(raw.title || 'Untitled Document'),
    fileName: String(raw.fileName || `${raw.title || 'document'}.txt`),
    department: String(raw.department || 'General'),
    requiredSecurityRole: raw.requiredSecurityRole || 'Public',
    characterCount: Number(raw.characterCount || 0),
    estimatedTokens: Number(raw.estimatedTokens || 0),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    chunksCount: Number(raw.chunksCount || 0),
    syncedToGithub: syncedToGithub !== undefined ? syncedToGithub : Boolean(raw.syncedToGithub)
  };
}

export function normalizeChunk(raw: any): GlobalStoredChunk {
  const docId = String(raw.docId || raw.documentId || '');
  const title = String(raw.title || raw.documentTitle || 'Untitled Document');
  return {
    id: String(raw.id),
    docId,
    documentId: docId,
    title,
    documentTitle: title,
    chunkIndex: Number(raw.chunkIndex ?? 0),
    content: String(raw.content || ''),
    department: String(raw.department || 'General'),
    requiredSecurityRole: raw.requiredSecurityRole || 'Public',
    tokenCount: raw.tokenCount !== undefined ? Number(raw.tokenCount) : Math.ceil(String(raw.content || '').length / 4),
    ...(Array.isArray(raw.embedding) && raw.embedding.length > 0 ? { embedding: raw.embedding } : {})
  };
}

function buildEncodedPath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');
}

/**
 * Fetches the live global chunk store from GitHub (Raw / Contents API) or static bundle fallback.
 * Never throws on read errors; returns null if unavailable so local store remains untouched.
 */
export async function fetchGlobalStoreFromGithubOrStatic(
  config: GithubSyncConfig
): Promise<{ store: GlobalVectorStorePayload; source: 'github-live' | 'static-bundle' } | null> {
  const err = validateGithubConfig(config);
  const cleanPath = config.filePath.replace(/^\/+/, '');
  const encodedPath = buildEncodedPath(cleanPath);

  if (!err) {
    // 1. Try GitHub Contents API first (instant propagation across all devices; uses token if provided)
    try {
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}&_t=${Date.now()}`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json'
      };
      if (config.token) {
        headers.Authorization = `Bearer ${config.token}`;
      }
      const resp = await fetch(apiUrl, {
        headers,
        cache: 'no-store'
      });
      if (resp.ok) {
        const json = await resp.json();
        let decoded: any = null;
        if (json && typeof json.content === 'string' && json.content.trim().length > 0) {
          decoded = JSON.parse(base64ToUtf8(json.content));
        } else if (json && json.download_url) {
          const dlResp = await fetch(json.download_url, { cache: 'no-store' });
          if (dlResp.ok) decoded = await dlResp.json();
        }
        if (decoded) {
          return {
            source: 'github-live',
            store: {
              version: decoded.version || 1,
              updatedAt: decoded.updatedAt || new Date().toISOString(),
              documents: Array.isArray(decoded.documents) ? decoded.documents.map((d: any) => normalizeDoc(d, true)) : [],
              chunks: Array.isArray(decoded.chunks) ? decoded.chunks.map(normalizeChunk) : []
            }
          };
        }
      }
    } catch {
      // Fall through to raw.githubusercontent.com
    }

    // 2. Try unauthenticated GitHub Raw (instant global read across all devices without requiring a token)
    try {
      const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodeURIComponent(config.branch)}/${encodedPath}?t=${Date.now()}`;
      const resp = await fetch(rawUrl, { cache: 'no-store' });
      if (resp.ok) {
        const decoded = await resp.json();
        return {
          source: 'github-live',
          store: {
            version: decoded.version || 1,
            updatedAt: decoded.updatedAt || new Date().toISOString(),
            documents: Array.isArray(decoded.documents) ? decoded.documents.map((d: any) => normalizeDoc(d, true)) : [],
            chunks: Array.isArray(decoded.chunks) ? decoded.chunks.map(normalizeChunk) : []
          }
        };
      }
    } catch {
      // Fall through to static bundle
    }
  }

  // 3. Fallback to static bundled public/global_vector_store.json served alongside index.html
  try {
    const fileName = cleanPath.split('/').pop() || 'global_vector_store.json';
    const resp = await fetch(`./${encodeURIComponent(fileName)}?t=${Date.now()}`, { cache: 'no-store' });
    if (resp.ok) {
      const decoded = await resp.json();
      return {
        source: 'static-bundle',
        store: {
          version: decoded.version || 1,
          updatedAt: decoded.updatedAt || new Date().toISOString(),
          documents: Array.isArray(decoded.documents) ? decoded.documents.map((d: any) => normalizeDoc(d, true)) : [],
          chunks: Array.isArray(decoded.chunks) ? decoded.chunks.map(normalizeChunk) : []
        }
      };
    }
  } catch {
    // Ignore
  }

  return null;
}

async function fetchGithubFileWithSha(
  config: GithubSyncConfig
): Promise<{ sha?: string; store: GlobalVectorStorePayload }> {
  const cleanPath = config.filePath.replace(/^\/+/, '');
  const encodedPath = buildEncodedPath(cleanPath);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}&_t=${Date.now()}`;

  const resp = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`
    },
    cache: 'no-store'
  });

  if (resp.status === 404) {
    return {
      sha: undefined,
      store: {
        version: 1,
        updatedAt: new Date().toISOString(),
        documents: [],
        chunks: []
      }
    };
  }

  if (!resp.ok) {
    const errJson = await resp.json().catch(() => ({}));
    throw new Error(errJson.message || `GitHub API returned HTTP ${resp.status}`);
  }

  const json = await resp.json();
  let parsed: any = { documents: [], chunks: [] };
  if (typeof json.content === 'string' && json.content.trim().length > 0) {
    parsed = JSON.parse(base64ToUtf8(json.content));
  } else if (json.download_url) {
    // Files > 1MB return empty content in Contents API; use git blob or raw download_url
    const rawResp = await fetch(json.download_url, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store'
    });
    if (rawResp.ok) {
      parsed = await rawResp.json();
    }
  }

  return {
    sha: json.sha,
    store: {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      documents: Array.isArray(parsed.documents) ? parsed.documents.map((d: any) => normalizeDoc(d, true)) : [],
      chunks: Array.isArray(parsed.chunks) ? parsed.chunks.map(normalizeChunk) : []
    }
  };
}

async function putGithubFile(
  config: GithubSyncConfig,
  store: GlobalVectorStorePayload,
  sha: string | undefined,
  commitMessage: string
): Promise<Response> {
  const cleanPath = config.filePath.replace(/^\/+/, '');
  const encodedPath = buildEncodedPath(cleanPath);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedPath}`;

  const serialized = JSON.stringify(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      documents: store.documents.map(d => ({ ...d, syncedToGithub: true })),
      chunks: store.chunks
    },
    null,
    2
  );

  const body: Record<string, any> = {
    message: commitMessage,
    content: utf8ToBase64(serialized),
    branch: config.branch
  };
  if (sha) {
    body.sha = sha;
  }

  return fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

/**
 * Atomically merges new documents & chunks into the remote GitHub file without deleting any existing records.
 */
export async function mergeDocumentsIntoGithub(
  config: GithubSyncConfig,
  newDocs: GlobalStoredDoc[],
  newChunks: GlobalStoredChunk[],
  commitMessage?: string
): Promise<GlobalVectorStorePayload> {
  const validationErr = validateGithubConfig(config);
  if (validationErr) throw new Error(validationErr);
  if (!config.token) throw new Error('GitHub Personal Access Token is required to write to GitHub.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const { sha, store } = await fetchGithubFileWithSha(config);

    const docMap = new Map<string, GlobalStoredDoc>();
    for (const d of store.documents) docMap.set(d.id, { ...d, syncedToGithub: true });
    for (const d of newDocs) docMap.set(d.id, { ...d, syncedToGithub: true });

    const chunkMap = new Map<string, GlobalStoredChunk>();
    for (const c of store.chunks) chunkMap.set(c.id, normalizeChunk(c));
    for (const c of newChunks) chunkMap.set(c.id, normalizeChunk(c));

    const merged: GlobalVectorStorePayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      documents: Array.from(docMap.values()),
      chunks: Array.from(chunkMap.values())
    };

    const msg =
      commitMessage ||
      `chore(vector-store): upload chunks for ${newDocs.map(d => d.fileName).join(', ')}`;

    const putResp = await putGithubFile(config, merged, sha, msg);
    if (putResp.ok) {
      return merged;
    }

    if (putResp.status === 409 && attempt < 2) {
      // Conflict due to concurrent write from another device; re-read SHA and merge again
      continue;
    }

    const errJson = await putResp.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to commit vector store to GitHub (HTTP ${putResp.status})`);
  }

  throw new Error('Could not commit to GitHub after concurrent update retries.');
}

/**
 * Force-deletes specific document IDs (or all documents if docIds === 'ALL') from the remote GitHub file.
 */
export async function forceDeleteFromGithub(
  config: GithubSyncConfig,
  docIds: string[] | 'ALL',
  commitMessage?: string
): Promise<GlobalVectorStorePayload> {
  const validationErr = validateGithubConfig(config);
  if (validationErr) throw new Error(validationErr);
  if (!config.token) throw new Error('GitHub Personal Access Token is required to force-delete from GitHub.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const { sha, store } = await fetchGithubFileWithSha(config);

    let remainingDocs: GlobalStoredDoc[];
    let remainingChunks: GlobalStoredChunk[];

    if (docIds === 'ALL') {
      remainingDocs = [];
      remainingChunks = [];
    } else {
      const removeSet = new Set(docIds);
      remainingDocs = store.documents.filter(d => !removeSet.has(d.id));
      remainingChunks = store.chunks.filter(c => !removeSet.has(c.docId || c.documentId || ''));
    }

    const updated: GlobalVectorStorePayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      documents: remainingDocs,
      chunks: remainingChunks
    };

    const msg =
      commitMessage ||
      (docIds === 'ALL'
        ? 'chore(vector-store): force delete all documents'
        : `chore(vector-store): force delete document(s) ${docIds.join(', ')}`);

    const putResp = await putGithubFile(config, updated, sha, msg);
    if (putResp.ok) {
      return updated;
    }

    if (putResp.status === 409 && attempt < 2) {
      continue;
    }

    const errJson = await putResp.json().catch(() => ({}));
    throw new Error(errJson.message || `Failed to force-delete on GitHub (HTTP ${putResp.status})`);
  }

  throw new Error('Could not complete force-delete on GitHub after concurrent retries.');
}

export async function testGithubConnection(
  config: GithubSyncConfig
): Promise<{ ok: boolean; canPush: boolean; message: string; existingDocsCount?: number }> {
  const validationErr = validateGithubConfig(config);
  if (validationErr) {
    return { ok: false, canPush: false, message: validationErr };
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json'
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  try {
    const repoResp = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
      { headers, cache: 'no-store' }
    );

    if (!repoResp.ok) {
      const errJson = await repoResp.json().catch(() => ({}));
      return {
        ok: false,
        canPush: false,
        message: errJson.message || `Repository check failed (HTTP ${repoResp.status}).`
      };
    }

    const repoData = await repoResp.json();
    const canPush = Boolean(repoData.permissions?.push);

    let existingDocsCount = 0;
    try {
      const remote = await fetchGlobalStoreFromGithubOrStatic(config);
      if (remote) {
        existingDocsCount = remote.store.documents.length;
      }
    } catch {
      // Ignore read count errors
    }

    if (config.token && !canPush) {
      return {
        ok: false,
        canPush: false,
        existingDocsCount,
        message: `Connected to ${repoData.full_name}, but this token does not have write (Contents: Read & Write) permission.`
      };
    }

    if (!config.token) {
      return {
        ok: true,
        canPush: false,
        existingDocsCount,
        message: `Connected in Read-Only mode to ${repoData.full_name} (${existingDocsCount} global docs found). Add a GitHub Token with Contents: Read & Write permission to upload or force-delete globally.`
      };
    }

    return {
      ok: true,
      canPush: true,
      existingDocsCount,
      message: `Authenticated with Write access to ${repoData.full_name} (branch "${config.branch}"). Global file currently holds ${existingDocsCount} document(s).`
    };
  } catch (err: any) {
    return {
      ok: false,
      canPush: false,
      message: err?.message || 'Network error while connecting to GitHub API.'
    };
  }
}
