import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Target = "api" | "mobile" | "trpc" | "web";

type FeatureNames = {
  camel: string;
  kebab: string;
  pascal: string;
};

const rootDir = process.cwd();

function printUsage() {
  console.log(`Usage:
  bun run scaffold:feature <feature-name> [--api --trpc] [--mobile] [--web] [--dry-run]

Examples:
  bun run scaffold:feature user-profile
  bun run scaffold:feature user-profile --api --trpc
  bun run scaffold:feature user-profile --mobile --dry-run
  bun run scaffold:feature user-profile --web

Defaults:
  If no target flags are provided, the script scaffolds api + trpc + mobile + web.

Valid target combinations:
  --web
  --mobile
  --mobile --web
  --api --trpc
  --api --trpc --web
  --api --trpc --mobile --web
  --api --trpc --mobile`);
}

function parseWords(value: string) {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!normalized) {
    throw new Error("Feature name must contain letters or numbers.");
  }

  return normalized.split("-").filter(Boolean);
}

function toFeatureNames(rawName: string): FeatureNames {
  const words = parseWords(rawName);
  const kebab = words.join("-");
  const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  const camel = `${words[0]}${pascal.slice(words[0].length)}`;

  return {
    camel,
    kebab,
    pascal,
  };
}

function relativePath(...segments: string[]) {
  return join(...segments);
}

function readTextFile(relativeFile: string) {
  return readFileSync(join(rootDir, relativeFile), "utf8");
}

function ensureDir(relativeDir: string, dryRun: boolean) {
  if (!dryRun) {
    mkdirSync(join(rootDir, relativeDir), {
      recursive: true,
    });
  }
}

function ensureNewFile(relativeFile: string, contents: string, dryRun: boolean) {
  const absoluteFile = join(rootDir, relativeFile);

  if (existsSync(absoluteFile)) {
    throw new Error(`Refusing to overwrite existing file: ${relativeFile}`);
  }

  ensureDir(dirname(relativeFile), dryRun);

  if (!dryRun) {
    writeFileSync(absoluteFile, contents);
  }
}

function writeTextFile(relativeFile: string, contents: string, dryRun: boolean) {
  if (!dryRun) {
    writeFileSync(join(rootDir, relativeFile), contents);
  }
}

function insertImport(source: string, importLine: string) {
  if (source.includes(importLine)) {
    return source;
  }

  const imports = [...source.matchAll(/^import .*;$/gm)];

  if (imports.length === 0) {
    return `${importLine}\n${source}`;
  }

  const lastImport = imports[imports.length - 1];
  const insertAt = (lastImport.index ?? 0) + lastImport[0].length;

  return `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
}

function insertBefore(source: string, marker: string, snippet: string) {
  if (source.includes(snippet.trim())) {
    return source;
  }

  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(`Could not find marker: ${marker}`);
  }

  return `${source.slice(0, markerIndex)}${snippet}${source.slice(markerIndex)}`;
}

function scaffoldApiFeature(names: FeatureNames, dryRun: boolean) {
  const moduleDir = relativePath("apps", "api", "src", "modules", names.camel);

  ensureNewFile(
    relativePath(moduleDir, "dto.ts"),
    `import type { TrpcServices } from "@repo/trpc";

export type ${names.pascal}Input = Parameters<TrpcServices["${names.camel}"]["get"]>[0];
export type ${names.pascal}Result = Awaited<
  ReturnType<TrpcServices["${names.camel}"]["get"]>
>;
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(moduleDir, "service.ts"),
    `import type { TrpcServices } from "@repo/trpc";

type ${names.pascal}ServiceContract = TrpcServices["${names.camel}"];

export class ${names.pascal}Service implements ${names.pascal}ServiceContract {
  get(
    input: {
      id: string;
    },
    options: {
      requestId: string;
      user: {
        id: string;
      } | null;
    },
  ) {
    return {
      id: input.id,
      message: "${names.camel} feature is not implemented yet.",
      requestId: options.requestId,
    };
  }
}
`,
    dryRun,
  );

  const servicesFile = relativePath("apps", "api", "src", "lib", "services.ts");
  let servicesSource = readTextFile(servicesFile);

  servicesSource = insertImport(
    servicesSource,
    `import { ${names.pascal}Service } from "../modules/${names.camel}/service";`,
  );
  servicesSource = insertBefore(
    servicesSource,
    "}\n\ntype MakeServicesOptions = {",
    `  ${names.camel}: ${names.pascal}Service;\n`,
  );
  servicesSource = insertBefore(
    servicesSource,
    "\n  };\n}",
    `    ${names.camel}: new ${names.pascal}Service(),\n`,
  );

  writeTextFile(servicesFile, servicesSource, dryRun);
}

function scaffoldTrpcFeature(names: FeatureNames, dryRun: boolean) {
  const moduleDir = relativePath("packages", "trpc", "src", "modules", names.camel);

  ensureNewFile(
    relativePath(moduleDir, "dto.ts"),
    `import { z } from "zod";

export const ${names.pascal}Input = z.object({
  id: z.string().min(1),
});

export const ${names.pascal}Output = z.object({
  id: z.string(),
  message: z.string(),
  requestId: z.string(),
});

export type ${names.pascal}InputDTO = z.infer<typeof ${names.pascal}Input>;
export type ${names.pascal}OutputDTO = z.infer<typeof ${names.pascal}Output>;
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(moduleDir, "router.ts"),
    `import { publicProcedure, router } from "../../lib/trpc/core";
import { ${names.pascal}Input, ${names.pascal}Output } from "./dto";

export const ${names.camel}Router = router({
  get: publicProcedure
    .input(${names.pascal}Input)
    .output(${names.pascal}Output)
    .query(async ({ ctx, input }) => {
      return ctx.services.${names.camel}.get(input, {
        requestId: ctx.requestId,
        user: ctx.user,
      });
    }),
});
`,
    dryRun,
  );

  const contextFile = relativePath("packages", "trpc", "src", "context.ts");
  let contextSource = readTextFile(contextFile);

  contextSource = insertImport(
    contextSource,
    `import type { ${names.pascal}InputDTO, ${names.pascal}OutputDTO } from "./modules/${names.camel}/dto";`,
  );
  contextSource = insertBefore(
    contextSource,
    "export interface TrpcContext {",
    `  ${names.camel}: {
    get(
      input: ${names.pascal}InputDTO,
      options: {
        requestId: string;
        user: AuthUser | null;
      },
    ): ${names.pascal}OutputDTO | Promise<${names.pascal}OutputDTO>;
  };
}

`,
  );

  if (!contextSource.includes(`  ${names.camel}: {`)) {
    throw new Error(`Failed to register ${names.camel} in packages/trpc/src/context.ts`);
  }

  writeTextFile(contextFile, contextSource, dryRun);

  const appRouterFile = relativePath("packages", "trpc", "src", "routers", "_app.ts");
  let appRouterSource = readTextFile(appRouterFile);

  appRouterSource = insertImport(
    appRouterSource,
    `import { ${names.camel}Router } from "../modules/${names.camel}/router";`,
  );
  appRouterSource = insertBefore(
    appRouterSource,
    "});",
    `  ${names.camel}: ${names.camel}Router,\n`,
  );

  writeTextFile(appRouterFile, appRouterSource, dryRun);
}

function scaffoldMobileFeature(names: FeatureNames, dryRun: boolean) {
  const featureDir = relativePath("apps", "mobile", "src", "features", names.kebab);

  ensureNewFile(
    relativePath(featureDir, "hooks", `use${names.pascal}.ts`),
    `export function use${names.pascal}() {
  return {
    isReady: true,
  };
}
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(featureDir, "components", `${names.pascal}Section.tsx`),
    `import { StyleSheet, Text } from "react-native";
import { SurfaceCard } from "../../../components/ui/SurfaceCard";

interface ${names.pascal}SectionProps {
  title?: string;
}

export function ${names.pascal}Section({
  title = "${names.pascal}",
}: ${names.pascal}SectionProps) {
  return (
    <SurfaceCard>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>
        Replace this section with the real ${names.kebab} feature UI.
      </Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: "#4b5565",
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    color: "#172033",
    fontSize: 22,
    fontWeight: "700",
  },
});
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(featureDir, "screens", `${names.pascal}Screen.tsx`),
    `import { SafeAreaView, ScrollView, StyleSheet } from "react-native";
import { ${names.pascal}Section } from "../components/${names.pascal}Section";
import { use${names.pascal} } from "../hooks/use${names.pascal}";

export default function ${names.pascal}Screen() {
  const feature = use${names.pascal}();

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <${names.pascal}Section title={feature.isReady ? "${names.pascal}" : "Loading"} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  screen: {
    backgroundColor: "#f4efe6",
    flex: 1,
  },
});
`,
    dryRun,
  );
}

function scaffoldWebFeature(names: FeatureNames, dryRun: boolean) {
  const featureDir = relativePath("apps", "web", "features", names.kebab);

  ensureNewFile(
    relativePath(featureDir, "hooks", `use-${names.kebab}.ts`),
    `"use client";

export function use${names.pascal}() {
  return {
    isReady: true,
  };
}
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(featureDir, "components", `${names.pascal}Section.tsx`),
    `"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ${names.pascal}SectionProps {
  title?: string;
}

export function ${names.pascal}Section({
  title = "${names.pascal}",
}: ${names.pascal}SectionProps) {
  return (
    <Card className="border-border/70 bg-card/95 backdrop-blur">
      <CardHeader>
        <CardDescription>${names.kebab} feature</CardDescription>
        <CardTitle className="text-3xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Replace this section with the real ${names.kebab} feature UI.
        </p>
      </CardContent>
    </Card>
  );
}
`,
    dryRun,
  );

  ensureNewFile(
    relativePath(featureDir, "screens", `${names.pascal}Page.tsx`),
    `"use client";

import { ${names.pascal}Section } from "../components/${names.pascal}Section";
import { use${names.pascal} } from "../hooks/use-${names.kebab}";

export default function ${names.pascal}Page() {
  const feature = use${names.pascal}();

  return (
    <${names.pascal}Section
      title={feature.isReady ? "${names.pascal}" : "Loading"}
    />
  );
}
`,
    dryRun,
  );
}

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const positional = argv.filter((arg) => !arg.startsWith("--"));

  if (flags.has("--help") || positional.length === 0) {
    return {
      dryRun: false,
      featureName: null,
      help: true,
      targets: [] as Target[],
    };
  }

  const explicitTargets = (["api", "trpc", "mobile", "web"] as const).filter((target) =>
    flags.has(`--${target}`),
  );
  const targets =
    explicitTargets.length > 0
      ? explicitTargets
      : ["api", "trpc", "mobile", "web"];
  const apiSelected = targets.includes("api");
  const trpcSelected = targets.includes("trpc");

  if (apiSelected !== trpcSelected) {
    throw new Error(
      "API and tRPC scaffolding must be generated together. Use `--api --trpc`, `--mobile`, or no target flags.",
    );
  }

  return {
    dryRun: flags.has("--dry-run"),
    featureName: positional[0] ?? null,
    help: false,
    targets,
  };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help || !parsed.featureName) {
    printUsage();
    process.exit(parsed.help ? 0 : 1);
  }

  const names = toFeatureNames(parsed.featureName);
  const createdFiles: string[] = [];
  const touchedFiles: string[] = [];

  if (parsed.targets.includes("api")) {
    createdFiles.push(
      relativePath("apps", "api", "src", "modules", names.camel, "dto.ts"),
      relativePath("apps", "api", "src", "modules", names.camel, "service.ts"),
    );
    touchedFiles.push(relativePath("apps", "api", "src", "lib", "services.ts"));
  }

  if (parsed.targets.includes("trpc")) {
    createdFiles.push(
      relativePath("packages", "trpc", "src", "modules", names.camel, "dto.ts"),
      relativePath("packages", "trpc", "src", "modules", names.camel, "router.ts"),
    );
    touchedFiles.push(
      relativePath("packages", "trpc", "src", "context.ts"),
      relativePath("packages", "trpc", "src", "routers", "_app.ts"),
    );
  }

  if (parsed.targets.includes("mobile")) {
    createdFiles.push(
      relativePath(
        "apps",
        "mobile",
        "src",
        "features",
        names.kebab,
        "hooks",
        `use${names.pascal}.ts`,
      ),
      relativePath(
        "apps",
        "mobile",
        "src",
        "features",
        names.kebab,
        "components",
        `${names.pascal}Section.tsx`,
      ),
      relativePath(
        "apps",
        "mobile",
        "src",
        "features",
        names.kebab,
        "screens",
        `${names.pascal}Screen.tsx`,
      ),
    );
  }

  if (parsed.targets.includes("web")) {
    createdFiles.push(
      relativePath(
        "apps",
        "web",
        "features",
        names.kebab,
        "hooks",
        `use-${names.kebab}.ts`,
      ),
      relativePath(
        "apps",
        "web",
        "features",
        names.kebab,
        "components",
        `${names.pascal}Section.tsx`,
      ),
      relativePath(
        "apps",
        "web",
        "features",
        names.kebab,
        "screens",
        `${names.pascal}Page.tsx`,
      ),
    );
  }

  for (const file of createdFiles) {
    if (existsSync(join(rootDir, file))) {
      throw new Error(`Refusing to scaffold existing feature file: ${file}`);
    }
  }

  if (parsed.targets.includes("api")) {
    scaffoldApiFeature(names, parsed.dryRun);
  }

  if (parsed.targets.includes("trpc")) {
    scaffoldTrpcFeature(names, parsed.dryRun);
  }

  if (parsed.targets.includes("mobile")) {
    scaffoldMobileFeature(names, parsed.dryRun);
  }

  if (parsed.targets.includes("web")) {
    scaffoldWebFeature(names, parsed.dryRun);
  }

  console.log(
    `${parsed.dryRun ? "Planned" : "Scaffolded"} feature "${parsed.featureName}" as:`,
  );

  for (const target of parsed.targets) {
    console.log(`- ${target}`);
  }

  console.log("\nCreated files:");
  for (const file of createdFiles) {
    console.log(`- ${file}`);
  }

  if (touchedFiles.length > 0) {
    console.log("\nUpdated files:");
    for (const file of touchedFiles) {
      console.log(`- ${file}`);
    }
  }

  console.log("\nManual follow-up:");
  if (parsed.targets.includes("api") || parsed.targets.includes("trpc")) {
    console.log(
      `- Replace placeholder DTOs and service logic for ${names.camel} with the real domain contract.`,
    );
  }
  console.log("- Add tests for the new feature.");
  if (parsed.targets.includes("mobile")) {
    console.log("- Wire the new mobile screen or section into the app entrypoints where it belongs.");
  }
  if (parsed.targets.includes("web")) {
    console.log("- Wire the new web page or section into the app router where it belongs.");
  }
  console.log("- Run `bun run check` and `bun run test` after finishing the implementation.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
