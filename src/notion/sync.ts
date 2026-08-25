import YAML from "yaml";
import {
  parseCoursePage,
  parseLessonPage,
  selectPublishedContent,
  type Course,
  type Lesson,
} from "./model";

type NotionClient = {
  queryDataSource(id: string): Promise<unknown[]>;
  retrievePageMarkdown(id: string): Promise<string>;
};

export type SyncConfig = {
  coursesDataSourceId: string;
  lessonsDataSourceId: string;
};
export type SyncSummary = {
  publishedCourses: number;
  publishedLessons: number;
  excludedCourses: number;
  excludedLessons: number;
};
export type GeneratedFiles = Record<string, string | Uint8Array>;
export type SyncDependencies = {
  client: NotionClient;
  replaceGenerated(
    files: GeneratedFiles,
    assets?: GeneratedFiles
  ): Promise<void>;
  ingestRemoteAsset?: (input: {
    pageId: string;
    blockId: string;
    url: string;
  }) => Promise<{
    publicPath: string;
    bytes: Uint8Array;
  }>;
};

const frontmatter = (value: Record<string, unknown>) =>
  `---\n${YAML.stringify(value).trim()}\n---\n\n`;

async function localizeMarkdownImages(
  markdown: string,
  lesson: Lesson,
  deps: SyncDependencies,
  assets: GeneratedFiles
) {
  if (!deps.ingestRemoteAsset) return markdown;
  const matches = [
    ...markdown.matchAll(
      /!\[([^\]]*)\]\((https:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g
    ),
  ];
  let result = markdown;
  for (const [index, match] of matches.entries()) {
    const ingested = await deps.ingestRemoteAsset({
      pageId: lesson.id,
      blockId: `image-${index + 1}`,
      url: match[2],
    });
    assets[ingested.publicPath.replace(/^\/notion-assets\//, "")] =
      ingested.bytes;
    result = result.replace(match[0], `![${match[1]}](${ingested.publicPath})`);
  }
  return result;
}

const courseDocument = (course: Course) =>
  JSON.stringify(
    {
      ...course,
      coverUrl: course.coverUrl,
    },
    null,
    2
  );

export async function syncNotionCourses(
  config: SyncConfig,
  deps: SyncDependencies
): Promise<SyncSummary> {
  const [coursePages, lessonPages] = await Promise.all([
    deps.client.queryDataSource(config.coursesDataSourceId),
    deps.client.queryDataSource(config.lessonsDataSourceId),
  ]);
  const courses = coursePages.map(parseCoursePage);
  const lessons = lessonPages.map(parseLessonPage);
  const publication = selectPublishedContent(courses, lessons);
  const courseById = new Map(
    publication.courses.map(course => [course.id, course])
  );
  const files: GeneratedFiles = {};
  const assets: GeneratedFiles = {};

  for (const course of publication.courses) {
    let normalized = course;
    if (course.coverUrl && deps.ingestRemoteAsset) {
      const cover = await deps.ingestRemoteAsset({
        pageId: course.id,
        blockId: "cover",
        url: course.coverUrl,
      });
      assets[cover.publicPath.replace(/^\/notion-assets\//, "")] = cover.bytes;
      normalized = { ...course, coverUrl: cover.publicPath };
    }
    files[`courses/${course.slug}.json`] = courseDocument(normalized);
  }

  for (const lesson of publication.lessons) {
    const course = courseById.get(lesson.courseId);
    if (!course)
      throw new Error(
        `Published lesson ${lesson.id} references unknown course ${lesson.courseId}`
      );
    let markdown: string;
    try {
      markdown = await deps.client.retrievePageMarkdown(lesson.id);
    } catch (error) {
      throw new Error(`Failed to retrieve markdown for ${lesson.id}`, {
        cause: error,
      });
    }
    markdown = await localizeMarkdownImages(markdown, lesson, deps, assets);
    const data = {
      notionId: lesson.id,
      title: lesson.title,
      slug: lesson.slug,
      description: lesson.description,
      courseId: lesson.courseId,
      courseSlug: course.slug,
      module: lesson.module,
      moduleOrder: lesson.moduleOrder,
      lessonOrder: lesson.lessonOrder,
      estimatedMinutes: lesson.estimatedMinutes,
      tags: lesson.tags,
      lastEditedTime: lesson.lastEditedTime,
    };
    files[`lessons/${course.slug}/${lesson.slug}.md`] =
      `${frontmatter(data)}${markdown.trim()}\n`;
  }

  await deps.replaceGenerated(files, assets);
  return {
    publishedCourses: publication.courses.length,
    publishedLessons: publication.lessons.length,
    excludedCourses: courses.length - publication.courses.length,
    excludedLessons: lessons.length - publication.lessons.length,
  };
}
