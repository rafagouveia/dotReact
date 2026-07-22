import { Prism } from "prism-react-renderer";

type PrismGlobal = typeof globalThis & {
  Prism?: typeof Prism;
};

const prismGlobal = globalThis as PrismGlobal;
const previousPrism = prismGlobal.Prism;

// Prism's optional language modules are classic scripts: they register their
// grammars on a global Prism instance when evaluated. Load them only after the
// renderer-owned instance is available so production chunk ordering cannot
// execute a language module against an undefined global.
prismGlobal.Prism = Prism;

await Promise.all([
  import("prismjs/components/prism-csharp.js"),
  import("prismjs/components/prism-bash.js"),
  import("prismjs/components/prism-powershell.js"),
]);

if (previousPrism === undefined) {
  Reflect.deleteProperty(prismGlobal, "Prism");
} else {
  prismGlobal.Prism = previousPrism;
}

export { Prism };
