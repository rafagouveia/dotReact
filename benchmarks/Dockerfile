# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS node-runtime

FROM mcr.microsoft.com/dotnet/sdk:10.0
COPY --from=node-runtime /usr/local /usr/local

WORKDIR /workspace
COPY . .

RUN npm ci
RUN npm run build:tooling

ENV DOTREACT_BENCHMARK_SAMPLE_RESOURCES=true
CMD ["npm", "run", "benchmark:consumption"]
