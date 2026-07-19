import WorkItemsPage from "./pages/WorkItemsPage";

export const pages = {
  "work-items/page": WorkItemsPage
} as const;

export type PageId = keyof typeof pages;
