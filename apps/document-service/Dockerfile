FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY document-service.csproj ./
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore

COPY . .
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

USER app

ENV ASPNETCORE_URLS=http://+:5000

EXPOSE 5000

ENTRYPOINT ["dotnet", "document-service.dll"]
