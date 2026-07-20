import { ClientCounter } from "./client-counter.js";

export interface DotNetModel {
  readonly message: string;
  readonly generatedAt: string;
}

export function Root({ model }: { model: DotNetModel }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>DotReact RSC experimental</title>
      </head>
      <body>
        <main>
          <p>React Server Component com modelo serializável do host C#</p>
          <h1>{model.message}</h1>
          <time>{model.generatedAt}</time>
          <ClientCounter />
        </main>
      </body>
    </html>
  );
}
