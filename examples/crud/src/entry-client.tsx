import { createElement, type ComponentType } from "react";
import { hydrateRoot } from "react-dom/client";
import { pages, type PageId } from "./pages";
import "./styles.css";

interface BootstrapPayload {
  moduleId: PageId;
  props: Record<string, unknown>;
}

const root = document.getElementById("root");
const state = document.getElementById("__DOTREACT_DATA__");

if (!root || !state?.textContent) {
  throw new Error("DotReact bootstrap payload is missing.");
}

const payload = JSON.parse(state.textContent) as BootstrapPayload;
const Page = pages[payload.moduleId] as unknown as ComponentType<Record<string, unknown>>;

if (!Page) throw new Error(`Unknown page module: ${payload.moduleId}`);
hydrateRoot(root, createElement(Page, payload.props));
