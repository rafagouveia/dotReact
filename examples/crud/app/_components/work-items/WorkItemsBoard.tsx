import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { DotReactActionError } from "@dotreact/client";
import { useDotReactRouter } from "@dotreact/client/router";
import { workItemsCreate, workItemsDelete, workItemsUpdate } from "../../../src/actions";
import type {
  CreateWorkItemRequest,
  DashboardProps,
  UpdateWorkItemActionRequest,
  WorkItemDto,
  WorkItemPriority,
  WorkItemStatus
} from "../../../src/contracts";

const statuses: WorkItemStatus[] = ["Backlog", "InProgress", "Done"];
const priorities: WorkItemPriority[] = ["Low", "Medium", "High"];

const statusLabels: Record<WorkItemStatus, string> = {
  Backlog: "Backlog",
  InProgress: "In progress",
  Done: "Done"
};

const priorityLabels: Record<WorkItemPriority, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High"
};

interface FormModel {
  title: string;
  description: string;
  priority: WorkItemPriority;
  status: WorkItemStatus;
}

const emptyForm: FormModel = {
  title: "",
  description: "",
  priority: "Medium",
  status: "Backlog"
};

function summarize(items: WorkItemDto[]) {
  return {
    total: items.length,
    backlog: items.filter((item) => item.status === "Backlog").length,
    inProgress: items.filter((item) => item.status === "InProgress").length,
    done: items.filter((item) => item.status === "Done").length,
    highPriority: items.filter((item) => item.priority === "High").length
  };
}

function safeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toISOString().slice(0, 16).replace("T", " · ") + " UTC";
}

function messageFor(error: unknown): string {
  if (error instanceof DotReactActionError) {
    if (error.status === 404) return "That item no longer exists. Refreshing the board may help.";
    return error.message;
  }
  if (error instanceof TypeError) return "The server could not be reached. Check your connection and retry.";
  return "Something went wrong. Please try again.";
}

function validationErrorsFor(error: unknown): Record<string, string[]> {
  if (!(error instanceof DotReactActionError) || typeof error.problem !== "object" || error.problem === null)
    return {};
  const errors = (error.problem as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return {};
  return Object.fromEntries(Object.entries(errors).filter(
    (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every(value => typeof value === "string")
  ));
}

export function WorkItemsBoard({ initial: props }: { readonly initial: DashboardProps }) {
  const router = useDotReactRouter();
  const initialItems = props.items;
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<WorkItemPriority | "All">("All");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormModel>(emptyForm);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const priorityId = useId();
  const statusId = useId();

  useEffect(() => {
    setItems(props.items);
  }, [props.items]);

  useEffect(() => {
    if (pendingDeleteId) confirmButtonRef.current?.focus();
  }, [pendingDeleteId]);

  const stats = items === initialItems ? props.stats : summarize(items);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesQuery = !normalizedQuery ||
        item.title.toLocaleLowerCase().includes(normalizedQuery) ||
        (item.description?.toLocaleLowerCase().includes(normalizedQuery) ?? false);
      return matchesQuery &&
        (statusFilter === "All" || item.status === statusFilter) &&
        (priorityFilter === "All" || item.priority === priorityFilter);
    });
  }, [items, priorityFilter, query, statusFilter]);

  function clearMessages(): void {
    setError(null);
    setSuccess(null);
    setFieldErrors({});
  }

  function beginCreate(): void {
    clearMessages();
    setEditingId(null);
    setForm(emptyForm);
    formHeadingRef.current?.focus();
  }

  function beginEdit(item: WorkItemDto): void {
    clearMessages();
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description ?? "",
      priority: item.priority,
      status: item.status
    });
    formHeadingRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearMessages();
    const action = editingId ? `edit:${editingId}` : "create";
    setBusyAction(action);

    try {
      if (editingId) {
        const request: UpdateWorkItemActionRequest = { id: editingId, ...form };
        const updated = await workItemsUpdate(request);
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
        setSuccess(`“${updated.title}” was updated.`);
      } else {
        const request: CreateWorkItemRequest = {
          title: form.title,
          description: form.description,
          status: form.status,
          priority: form.priority
        };
        const created = await workItemsCreate(request, { idempotencyKey: crypto.randomUUID() });
        setItems((current) => [created, ...current]);
        setSuccess(`“${created.title}” was added to the board.`);
      }
      setEditingId(null);
      setForm(emptyForm);
    } catch (caught) {
      setFieldErrors(validationErrorsFor(caught));
      setError(messageFor(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function changeStatus(item: WorkItemDto, status: WorkItemStatus): Promise<void> {
    if (status === item.status) return;
    clearMessages();
    setBusyAction(`status:${item.id}`);
    try {
      const updated = await workItemsUpdate({
        id: item.id,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status
      });
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setSuccess(`“${updated.title}” moved to ${statusLabels[updated.status]}.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function remove(item: WorkItemDto): Promise<void> {
    clearMessages();
    setBusyAction(`delete:${item.id}`);
    try {
      await workItemsDelete({ id: item.id });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (editingId === item.id) beginCreate();
      setPendingDeleteId(null);
      setSuccess(`“${item.title}” was deleted.`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function refresh(): Promise<void> {
    clearMessages();
    setBusyAction("refresh");
    try {
      await router.refresh();
      setSuccess("The board is up to date.");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusyAction(null);
    }
  }

  const hasFilters = query !== "" || statusFilter !== "All" || priorityFilter !== "All";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="DotReact Workboard home">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DotReact <strong>Workboard</strong></span>
        </a>
        <div className="topbar-meta">
          <span className="live-dot" aria-hidden="true" />
          Server rendered · {safeDate(props.generatedAt)}
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="dashboard-title">
          <div>
            <p className="eyebrow">Team workspace</p>
            <h1 id="dashboard-title">Make the next move clear.</h1>
            <p className="hero-copy">A focused board backed by ASP.NET Core, rendered with React, and kept honest by generated contracts.</p>
          </div>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={() => void refresh()} disabled={busyAction === "refresh"}>
              {busyAction === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
            <button className="button button-primary" type="button" onClick={beginCreate}>+ New work item</button>
          </div>
        </section>

        <div className="announcer" aria-live="polite" aria-atomic="true">
          {error && <p className="notice notice-error" role="alert"><strong>Couldn’t complete that.</strong> {error}</p>}
          {success && <p className="notice notice-success"><strong>All set.</strong> {success}</p>}
        </div>

        <section className="stats" aria-label="Board statistics">
          <article className="stat-card stat-total"><span>Total work</span><strong>{stats.total}</strong><small>across the board</small></article>
          <article className="stat-card stat-backlog"><span>Backlog</span><strong>{stats.backlog}</strong><small>ready to shape</small></article>
          <article className="stat-card stat-progress"><span>In progress</span><strong>{stats.inProgress}</strong><small>moving now</small></article>
          <article className="stat-card stat-done"><span>Done</span><strong>{stats.done}</strong><small>shipped with care</small></article>
          <article className="stat-card stat-high"><span>High priority</span><strong>{stats.highPriority}</strong><small>needs attention</small></article>
        </section>

        <div className="workspace">
          <aside className="editor-card" aria-label={editingId ? "Edit work item" : "Create work item"}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{editingId ? "Editing item" : "New item"}</p>
                <h2 ref={formHeadingRef} tabIndex={-1}>{editingId ? "Refine the details" : "Capture the work"}</h2>
              </div>
              {editingId && <button className="text-button" type="button" onClick={beginCreate}>Cancel</button>}
            </div>

            <form onSubmit={(event) => void submit(event)}>
              <label htmlFor={titleId}>Title</label>
              <input
                id={titleId}
                name="title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                maxLength={120}
                required
                aria-describedby={fieldErrors.title || fieldErrors.Title ? `${titleId}-error` : undefined}
              />
              {(fieldErrors.title ?? fieldErrors.Title)?.map((message) => <small className="field-error" id={`${titleId}-error`} key={message}>{message}</small>)}

              <label htmlFor={descriptionId}>Description <span className="label-hint">Optional</span></label>
              <textarea
                id={descriptionId}
                name="description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={5}
                maxLength={1000}
                placeholder="What does done look like?"
              />

              <div className="form-grid">
                <div>
                  <label htmlFor={priorityId}>Priority</label>
                  <select id={priorityId} value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as WorkItemPriority }))}>
                    {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                  </select>
                </div>
                {editingId && <div>
                  <label htmlFor={statusId}>Status</label>
                  <select id={statusId} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as WorkItemStatus }))}>
                    {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                </div>}
              </div>

              <button className="button button-primary button-block" type="submit" disabled={busyAction === "create" || busyAction === `edit:${editingId ?? ""}`}>
                {busyAction === "create" || busyAction === `edit:${editingId ?? ""}` ? "Saving…" : editingId ? "Save changes" : "Add to board"}
              </button>
            </form>
          </aside>

          <section className="board" aria-labelledby="work-items-heading" aria-busy={busyAction === "refresh"}>
            <div className="board-heading">
              <div>
                <p className="eyebrow">Current workload</p>
                <h2 id="work-items-heading">Work items <span>{filteredItems.length}</span></h2>
              </div>
            </div>

            <div className="filters" role="search" aria-label="Filter work items">
              <label className="search-field">
                <span className="sr-only">Search work items</span>
                <span aria-hidden="true">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or description" />
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WorkItemStatus | "All")}>
                  <option value="All">All statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by priority</span>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as WorkItemPriority | "All")}>
                  <option value="All">All priorities</option>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
                </select>
              </label>
            </div>

            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <span aria-hidden="true">◎</span>
                <h3>{items.length === 0 ? "A clear board, ready for work" : "No items match these filters"}</h3>
                <p>{items.length === 0 ? "Create the first item to start making progress visible." : "Try a broader search or reset the filters."}</p>
                {hasFilters ?
                  <button className="button button-secondary" type="button" onClick={() => { setQuery(""); setStatusFilter("All"); setPriorityFilter("All"); }}>Reset filters</button> :
                  <button className="button button-primary" type="button" onClick={beginCreate}>Create first item</button>}
              </div>
            ) : (
              <div className="item-list">
                {filteredItems.map((item) => {
                  const deleting = pendingDeleteId === item.id;
                  const changingStatus = busyAction === `status:${item.id}`;
                  return <article className="work-item" key={item.id}>
                    <div className="item-main">
                      <div className="item-badges">
                        <span className={`priority priority-${item.priority.toLowerCase()}`}>{priorityLabels[item.priority]}</span>
                        <span className={`status status-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span>
                      </div>
                      <h3>{item.title}</h3>
                      {item.description && <p>{item.description}</p>}
                      <small>Updated <time dateTime={item.updatedAt}>{safeDate(item.updatedAt)}</time></small>
                    </div>
                    <div className="item-controls">
                      <label>
                        <span className="sr-only">Change status for {item.title}</span>
                        <select value={item.status} onChange={(event) => void changeStatus(item, event.target.value as WorkItemStatus)} disabled={changingStatus}>
                          {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                        </select>
                      </label>
                      <button className="icon-button" type="button" onClick={() => beginEdit(item)} aria-label={`Edit ${item.title}`}>Edit</button>
                      <button className="icon-button icon-button-danger" type="button" onClick={() => setPendingDeleteId(item.id)} aria-label={`Delete ${item.title}`}>Delete</button>
                    </div>
                    {deleting && <div className="delete-confirmation" role="alertdialog" aria-labelledby={`delete-${item.id}`}>
                      <p id={`delete-${item.id}`}><strong>Delete “{item.title}”?</strong> This cannot be undone.</p>
                      <div>
                        <button className="button button-danger" ref={confirmButtonRef} type="button" onClick={() => void remove(item)} disabled={busyAction === `delete:${item.id}`}>{busyAction === `delete:${item.id}` ? "Deleting…" : "Yes, delete"}</button>
                        <button className="button button-secondary" type="button" onClick={() => setPendingDeleteId(null)}>Cancel</button>
                      </div>
                    </div>}
                  </article>;
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer><span>DotReact CRUD reference</span><span>ASP.NET Core × React SSR</span></footer>
    </div>
  );
}
