import { createElement, type ComponentType } from "react";
import { hydrateRoot } from "react-dom/client";
import { boundaries, pages } from "virtual:dotreact/pages";
import "./styles.css";

interface BootstrapPayload {
  moduleId: string;
  props: Record<string, unknown>;
  boundaryKind?: "not-found" | "error" | null;
}

const root = document.getElementById("root");
const state = document.getElementById("__DOTREACT_DATA__");
if (!root || !state?.textContent) throw new Error("DotReact bootstrap payload is missing.");
const payload = JSON.parse(state.textContent) as BootstrapPayload;
const pageModule = payload.boundaryKind === "not-found"
  ? boundaries[payload.moduleId]?.notFound
  : payload.boundaryKind === "error"
    ? boundaries[payload.moduleId]?.error
    : pages[payload.moduleId];
if (!pageModule) throw new Error(`Unknown page module: ${payload.moduleId}`);
const Page = pageModule.default as unknown as ComponentType<Record<string, unknown>>;
hydrateRoot(root, createElement(Page, payload.props));
