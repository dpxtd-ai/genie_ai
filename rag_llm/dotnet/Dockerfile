# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy csproj and restore dependencies
COPY src/RagLlm.Api/*.csproj ./src/RagLlm.Api/
RUN dotnet restore src/RagLlm.Api/RagLlm.Api.csproj

# Copy remaining source files and publish release
COPY src/RagLlm.Api/ ./src/RagLlm.Api/
RUN dotnet publish src/RagLlm.Api/RagLlm.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "RagLlm.Api.dll"]
