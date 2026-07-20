import type { ReactNode } from "react";
import { resumeToPipeableStream, type PipeableStream } from "react-dom/server";
import {
  prerenderToNodeStream,
  type PostponedState,
  type PrerenderToNodeStreamResult
} from "react-dom/static";

export interface PartialPrerenderOptions {
  /** Time budget for static work before unresolved Suspense boundaries become resumable holes. */
  readonly staticBudgetMs: number;
  readonly bootstrapModules?: readonly string[];
  readonly onError?: (error: unknown) => string | void;
}

/** Creates a static prelude and opaque resumable state using React 19.2's native PPR primitives. */
export async function prerenderPartial(
  tree: ReactNode,
  options: PartialPrerenderOptions
): Promise<PrerenderToNodeStreamResult> {
  if (!Number.isInteger(options.staticBudgetMs) || options.staticBudgetMs < 1 || options.staticBudgetMs > 60_000)
    throw new RangeError("staticBudgetMs must be an integer between 1 and 60000.");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("DotReact PPR static budget elapsed.")), options.staticBudgetMs);
  timer.unref?.();
  try {
    return await prerenderToNodeStream(tree, {
      signal: abort.signal,
      ...(options.bootstrapModules === undefined ? {} : { bootstrapModules: [...options.bootstrapModules] }),
      ...(options.onError === undefined ? {} : { onError: options.onError })
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Resumes the postponed Suspense holes against the same component tree. */
export async function resumePartial(
  tree: ReactNode,
  postponed: PostponedState,
  options: { readonly nonce?: string; readonly signal?: AbortSignal } = {}
): Promise<PipeableStream> {
  return await resumeToPipeableStream(tree, postponed, {
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
}

/** The React contract states that postponed state is JSON-serializable but otherwise opaque. */
export function serializePostponedState(state: PostponedState): string {
  return JSON.stringify(state);
}

export function deserializePostponedState(serialized: string): PostponedState {
  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid serialized React postponed state.");
  return parsed as PostponedState;
}
