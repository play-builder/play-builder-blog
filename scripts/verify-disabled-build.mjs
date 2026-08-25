import { access } from "node:fs/promises";
import path from "node:path";

const staleLesson = path.resolve(
  "dist/courses/ethereum-validator-operations/install-clients/index.html"
);

try {
  await access(staleLesson);
  throw new Error(`Disabled Notion sync leaked stale fixture content: ${staleLesson}`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Disabled Notion sync")) throw error;
  if (error?.code !== "ENOENT") throw error;
}

process.stdout.write("Disabled Notion sync contains no stale fixture lesson.\n");
