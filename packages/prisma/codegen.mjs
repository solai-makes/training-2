import { spawnSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";

try {
  await access("schema.prisma");
} catch {
  await writeFile(
    "schema.prisma",
    'generator client {\n  provider = "prisma-client-js"\n  output = "./generated"\n}\ndatasource db {\n  provider = "postgresql"\n}\n',
  );
}
for (const args of [
  ["exec", "prisma", "db", "pull"],
  ["exec", "prisma", "generate"],
]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
