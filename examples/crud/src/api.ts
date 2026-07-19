import type {
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemDto
} from "./contracts";

interface ProblemDetails {
  detail?: string;
  errors?: Record<string, string[]>;
  title?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin"
  });

  if (!response.ok) {
    let problem: ProblemDetails = {};
    try {
      problem = await response.json() as ProblemDetails;
    } catch {
      // The status text remains a safe fallback for empty and non-JSON responses.
    }

    throw new ApiError(
      problem.detail ?? problem.title ?? `Request failed (${response.status}).`,
      response.status,
      problem.errors ?? {}
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const workItemsApi = {
  list: (signal?: AbortSignal) => request<WorkItemDto[]>(
    "/api/work-items",
    signal ? { signal } : undefined
  ),
  create: (input: CreateWorkItemRequest) => request<WorkItemDto>("/api/work-items", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  update: (id: number, input: UpdateWorkItemRequest) => request<WorkItemDto>(
    `/api/work-items/${encodeURIComponent(String(id))}`,
    { method: "PUT", body: JSON.stringify(input) }
  ),
  remove: (id: number) => request<void>(`/api/work-items/${encodeURIComponent(String(id))}`, {
    method: "DELETE"
  })
};
