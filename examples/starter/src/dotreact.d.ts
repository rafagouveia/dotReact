declare module "virtual:dotreact/pages" {
  export const pages: Readonly<Record<string, {
    default: import("react").ComponentType<Record<string, unknown>>;
  }>>;
  export const boundaries: Readonly<Record<string, {
    notFound?: { default: import("react").ComponentType<Record<string, unknown>> };
    error?: { default: import("react").ComponentType<Record<string, unknown>> };
  }>>;
  export default pages;
}

declare module "*.drx" {
  const Page: import("react").ComponentType<Record<string, unknown>>;
  export default Page;
}
