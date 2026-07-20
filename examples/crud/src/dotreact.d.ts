/// <reference types="vite/client" />

declare module "virtual:dotreact/pages" {
  export const pages: Readonly<Record<string, {
    default: import("react").ComponentType<Record<string, unknown>>;
    metadata?: import("@dotreact/client/router").DotReactMetadata | ((props: Record<string, unknown>) => import("@dotreact/client/router").DotReactMetadata);
  }>>;
  export const routeModules: typeof pages;
  export const routeLayouts: Readonly<Record<string, readonly import("react").ComponentType<import("@dotreact/client/router").DotReactLayoutProps<any>>[]>>;
  export const boundaries: Readonly<Record<string, {
    notFound?: import("@dotreact/client/router").DotReactPageModule;
    error?: import("@dotreact/client/router").DotReactPageModule;
    loading?: import("@dotreact/client/router").DotReactPageModule;
  }>>;
  export const fontPreloads: readonly Readonly<Record<string, string>>[];
  export const globalError: import("react").ComponentType<import("@dotreact/client/errors").DotReactGlobalErrorProps> | undefined;
  export default pages;
}

declare module "*.drx" {
  const Page: import("react").ComponentType<Record<string, unknown>>;
  export default Page;
}
