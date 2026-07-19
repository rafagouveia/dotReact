import type { ReactNode } from "react";

export interface DocPage {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly body: ReactNode;
}

export interface ReferenceRow {
  readonly name: string;
  readonly defaultValue?: string;
  readonly description: string;
}
