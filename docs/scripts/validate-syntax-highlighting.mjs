import { Prism } from "prism-react-renderer";

const previousPrism = globalThis.Prism;
globalThis.Prism = Prism;

try {
  await Promise.all([
    import("prismjs/components/prism-csharp.js"),
    import("prismjs/components/prism-bash.js"),
    import("prismjs/components/prism-powershell.js"),
  ]);

  for (const language of ["csharp", "bash", "powershell"]) {
    if (!Prism.languages[language]) {
      throw new Error(`Prism language ${language} was not registered.`);
    }
  }
} finally {
  if (previousPrism === undefined) {
    Reflect.deleteProperty(globalThis, "Prism");
  } else {
    globalThis.Prism = previousPrism;
  }
}

console.log("Prism syntax languages initialized successfully.");
