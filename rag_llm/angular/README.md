# Angular RAG Client

Modern Angular 19 Single Page Application for the Enterprise Retrieval-Augmented Generation (RAG) platform.

## Features
- **Standalone Components & Signals**: Clean, high-performance architecture without NgModules.
- **ASP.NET Core Integration**: Directly communicates with the .NET 8 Web API at `http://localhost:5000/api/v1`.
- **Requirement #7 Indicator**: Visual distinguishing between "Retrieval-Augmented" mode and "Direct LLM Fallback" mode when vector search returns no matching chunks.
- **Requirement #8 Citations & Validation**: Inline citation tags `[Doc: <Title> #<Index>]`, source snippets, and groundedness confidence scores.
- **RBAC Security Clearance**: Allows testing queries with Public, InternalEmployee, and ConfidentialAdmin clearances.

## Getting Started

### Prerequisites
- Node.js (v18.19+ or v20+)
- Angular CLI (`npm install -g @angular/cli`)

### Installation & Run
```bash
cd rag_llm/angular
npm install
npm start
```

Navigate to `http://localhost:4200/`.

Ensure the ASP.NET Core API (`rag_llm/dotnet`) is running at `http://localhost:5000`.
