import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NotionReadClient } from "../src/notion/client";
import { ingestAsset } from "../src/notion/assets";
import { syncNotionCourses, type GeneratedFiles } from "../src/notion/sync";

const root = fileURLToPath(new URL("..", import.meta.url));
const contentTarget = path.join(root, "src/content/generated-notion");
const assetTarget = path.join(root, "public/notion-assets");

async function writeTree(target: string, files: GeneratedFiles) {
  const stage = `${target}.stage-${process.pid}`;
  const backup = `${target}.backup-${process.pid}`;
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(stage, relative);
    if (!destination.startsWith(`${stage}${path.sep}`)) throw new Error(`Unsafe generated path: ${relative}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  await rm(backup, { recursive: true, force: true });
  try {
    await rename(target, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(stage, target);
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rename(backup, target).catch(() => undefined);
    throw error;
  }
}

const replaceGenerated = async (files: GeneratedFiles, assets: GeneratedFiles = {}) => {
  await writeTree(contentTarget, files);
  await writeTree(assetTarget, assets);
};

async function fixtureClient() {
  const base = path.join(root, "tests/fixtures/notion");
  const courses = JSON.parse(await readFile(path.join(base, "courses.json"), "utf8"));
  const lessons = JSON.parse(await readFile(path.join(base, "lessons.json"), "utf8"));
  const markdown = JSON.parse(await readFile(path.join(base, "lesson-markdown.json"), "utf8"));
  return {
    queryDataSource: async (id: string) => (id === "courses" ? courses : lessons),
    retrievePageMarkdown: async (id: string) => markdown[id],
  };
}

async function main() {
  const fixture = process.argv.includes("--fixture");
  if (!fixture && process.env.NOTION_SYNC_ENABLED !== "true") {
    await replaceGenerated({});
    console.log("Notion sync disabled; generated course content is empty.");
    return;
  }
  const token = process.env.NOTION_TOKEN ?? "";
  const coursesDataSourceId = fixture ? "courses" : (process.env.NOTION_COURSES_DATA_SOURCE_ID ?? "");
  const lessonsDataSourceId = fixture ? "lessons" : (process.env.NOTION_LESSONS_DATA_SOURCE_ID ?? "");
  if (!fixture && (!token || !coursesDataSourceId || !lessonsDataSourceId)) {
    throw new Error("NOTION_TOKEN and both NOTION_*_DATA_SOURCE_ID values are required when sync is enabled");
  }
  const client = fixture ? await fixtureClient() : new NotionReadClient({ token });
  const assetBytes = new Map<string, Uint8Array>();
  const summary = await syncNotionCourses(
    { coursesDataSourceId, lessonsDataSourceId },
    {
      client,
      replaceGenerated,
      ...(fixture
        ? {}
        : {
            ingestRemoteAsset: async (input: { pageId: string; blockId: string; url: string }) => {
              const result = await ingestAsset(input, {
                outputRoot: "/",
                writeFile: async (outputPath, bytes) => void assetBytes.set(outputPath, bytes),
              });
              return { publicPath: result.publicPath, bytes: assetBytes.get(result.outputPath)! };
            },
          }),
    }
  );
  console.log(
    `Notion sync complete: ${summary.publishedCourses} courses, ${summary.publishedLessons} lessons; excluded ${summary.excludedCourses} courses and ${summary.excludedLessons} lessons.`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Notion sync failed");
  process.exitCode = 1;
});
