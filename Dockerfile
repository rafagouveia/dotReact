# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS node-base

FROM node-base AS frontend-build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY examples/starter ./examples/starter
RUN npm ci
RUN npm run build -w @dotreact/protocol \
    && npm run build -w @dotreact/client \
    && npm run build -w @dotreact/vite \
    && npm run build -w @dotreact/renderer \
    && npm run build:client -w @dotreact/example-starter \
    && npm run build:ssr -w @dotreact/example-starter

FROM mcr.microsoft.com/dotnet/sdk:10.0-bookworm-slim AS dotnet-build
WORKDIR /src
COPY dotnet ./dotnet
COPY examples/starter/Server ./examples/starter/Server
RUN dotnet restore examples/starter/Server/Server.csproj
RUN dotnet publish examples/starter/Server/Server.csproj -c Release -o /publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-bookworm-slim AS runtime
COPY --from=node-base /usr/local /usr/local
WORKDIR /app
COPY --from=dotnet-build /publish ./
COPY --from=frontend-build /src/examples/starter/dist/client ./wwwroot
COPY --from=frontend-build /src/examples/starter/dist/server ./frontend/server
COPY --from=frontend-build /src/packages/renderer/dist ./renderer
COPY --from=frontend-build /src/packages/protocol ./node_modules/@dotreact/protocol
COPY --from=frontend-build /src/node_modules/react ./node_modules/react
COPY --from=frontend-build /src/node_modules/react-dom ./node_modules/react-dom
COPY --from=frontend-build /src/node_modules/scheduler ./node_modules/scheduler

ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    NODE_ENV=production \
    DOTREACT_RENDERER_URL=http://127.0.0.1:5178 \
    DOTREACT_CLIENT_SCRIPT_SRC=/_dotreact/client.js
EXPOSE 8080
USER $APP_UID
STOPSIGNAL SIGTERM
ENTRYPOINT ["dotnet", "Server.dll"]
