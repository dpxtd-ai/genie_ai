using RagLlm.Api.Repositories;
using RagLlm.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Add Controllers and OpenAPI/Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title = "RAG LLM Pipeline API (.NET 8)",
        Version = "v1",
        Description = "Production-grade Retrieval-Augmented Generation API with PostgreSQL pgvector / SQL Server vector search, intelligent chunking, security claims filtering, and citation validation."
    });
});

// 2. Configure CORS for Angular Frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularClient", policy =>
    {
        policy.WithOrigins(
                "http://localhost:4200", 
                "http://localhost:3000",
                "https://localhost:4200"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// 3. Register HTTP Clients for Gemini / AI Services
builder.Services.AddHttpClient<IEmbeddingService, EmbeddingService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddHttpClient<ILlmGenerationService, LlmGenerationService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});

// 4. Register Core RAG Services (Requirements 2, 3, 4, 6, 7, 8)
builder.Services.AddSingleton<IDocumentIngestionService, DocumentIngestionService>();
builder.Services.AddSingleton<IChunkingService, ChunkingService>();
builder.Services.AddSingleton<IResponseValidationService, ResponseValidationService>();
builder.Services.AddScoped<IRetrievalService, RetrievalService>();

// 5. Register Vector Store Repository (Requirement 5)
// Configurable provider: "PgVector" (Postgres), "SqlServer" (SQL Server 2025/Azure SQL), or "InMemory"
var vectorProvider = builder.Configuration.GetValue<string>("Rag:VectorStoreProvider") ?? "InMemory";

switch (vectorProvider.ToLowerInvariant())
{
    case "pgvector":
    case "postgresql":
        builder.Services.AddScoped<IVectorRepository, PgVectorRepository>();
        break;

    case "sqlserver":
    case "mssql":
        builder.Services.AddScoped<IVectorRepository, SqlServerVectorRepository>();
        break;

    default:
        // High-performance in-memory vector store for out-of-the-box local developer startup
        builder.Services.AddSingleton<IVectorRepository, InMemoryVectorRepository>();
        break;
}

var app = builder.Build();

// Configure Middleware Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "RAG LLM Pipeline API v1");
        c.RoutePrefix = string.Empty; // Serve Swagger UI at root
    });
}

app.UseCors("AllowAngularClient");
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

// Health Check Endpoint
app.MapGet("/health", () => Results.Ok(new
{
    status = "Healthy",
    timestamp = DateTime.UtcNow,
    provider = vectorProvider,
    version = "1.0.0"
}));

app.Run();
