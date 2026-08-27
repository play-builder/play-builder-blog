import {
  TRANSLATION_KEY_PATTERN,
  isContentLocale,
  type ContentLocale,
} from "@/i18n/locales";

export type PublicationStatus = "Draft" | "Published" | "Archived";

export type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  locale: ContentLocale;
  translationKey: string;
  order: number;
  status: PublicationStatus;
  tags: string[];
  coverUrl?: string;
  lastEditedTime: string;
};

export type Lesson = {
  id: string;
  title: string;
  slug: string;
  description: string;
  locale: ContentLocale;
  translationKey: string;
  courseId: string;
  module: string;
  moduleOrder: number;
  lessonOrder: number;
  status: PublicationStatus;
  estimatedMinutes?: number;
  tags: string[];
  lastEditedTime: string;
  markdown?: string;
};

export type Publication = { courses: Course[]; lessons: Lesson[] };

export class NotionValidationError extends Error {}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NotionValidationError(`${label} must be an object`);
  }
  return value as UnknownRecord;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value))
    throw new NotionValidationError(`${label} must be an array`);
  return value;
};

const text = (items: unknown, label: string): string =>
  array(items, label)
    .map((item, index) => {
      const value = record(item, `${label}[${index}]`).plain_text;
      if (typeof value !== "string")
        throw new NotionValidationError(`${label} must contain plain_text`);
      return value;
    })
    .join("")
    .trim();

const property = (properties: UnknownRecord, name: string): UnknownRecord =>
  record(properties[name], `property ${name}`);

const requiredText = (
  properties: UnknownRecord,
  name: string,
  key: string
): string => {
  const value = text(property(properties, name)[key], name);
  if (!value) throw new NotionValidationError(`${name} is required`);
  return value;
};

const requiredNumber = (properties: UnknownRecord, name: string): number => {
  const value = property(properties, name).number;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NotionValidationError(`${name} must be a non-negative integer`);
  }
  return value;
};

const optionalNumber = (
  properties: UnknownRecord,
  name: string
): number | undefined => {
  const value = property(properties, name).number;
  if (value === null) return undefined;
  if (typeof value !== "number" || value < 0)
    throw new NotionValidationError(`${name} must be non-negative`);
  return value;
};

const status = (properties: UnknownRecord): PublicationStatus => {
  const name = record(
    property(properties, "Status").status,
    "Status.status"
  ).name;
  if (name !== "Draft" && name !== "Published" && name !== "Archived") {
    throw new NotionValidationError(
      `Status must be Draft, Published, or Archived`
    );
  }
  return name;
};

const tags = (properties: UnknownRecord): string[] =>
  array(property(properties, "Tags").multi_select, "Tags.multi_select").map(
    item => {
      const name = record(item, "Tags item").name;
      if (typeof name !== "string")
        throw new NotionValidationError("Tag name is required");
      return name;
    }
  );

const assertSlug = (slug: string, label: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new NotionValidationError(`${label} must be lowercase kebab-case`);
  }
};

const localization = (
  properties: UnknownRecord,
  pageId: string
): { locale: ContentLocale; translationKey: string } => {
  const localeProperty = record(
    properties.Locale,
    `page ${pageId} property Locale`
  );
  const localeSelection = record(
    localeProperty.select,
    `page ${pageId} property Locale.select`
  );
  const locale = localeSelection.name;
  if (!isContentLocale(locale)) {
    throw new NotionValidationError(
      `page ${pageId} property Locale must be ko or en`
    );
  }

  const translationKeyProperty = record(
    properties.TranslationKey,
    `page ${pageId} property TranslationKey`
  );
  const translationKey = text(
    translationKeyProperty.rich_text,
    `page ${pageId} property TranslationKey.rich_text`
  );
  if (!TRANSLATION_KEY_PATTERN.test(translationKey)) {
    throw new NotionValidationError(
      `page ${pageId} property TranslationKey must be lowercase kebab-case`
    );
  }

  return { locale, translationKey };
};

const base = (page: unknown) => {
  const value = record(page, "Notion page");
  const id = value.id;
  const lastEditedTime = value.last_edited_time;
  if (typeof id !== "string" || typeof lastEditedTime !== "string") {
    throw new NotionValidationError(
      "Notion page id and last_edited_time are required"
    );
  }
  return {
    id,
    lastEditedTime,
    properties: record(value.properties, `page ${id} properties`),
  };
};

export function parseCoursePage(page: unknown): Course {
  const { id, lastEditedTime, properties } = base(page);
  const { locale, translationKey } = localization(properties, id);
  const slug = requiredText(properties, "Slug", "rich_text");
  assertSlug(slug, "Course Slug");
  const files = array(property(properties, "Cover").files, "Cover.files");
  const first = files[0] ? record(files[0], "Cover file") : undefined;
  const external = first?.external
    ? record(first.external, "Cover.external").url
    : undefined;
  const file = first?.file ? record(first.file, "Cover.file").url : undefined;
  const coverUrl =
    typeof external === "string"
      ? external
      : typeof file === "string"
        ? file
        : undefined;
  return {
    id,
    title: requiredText(properties, "Title", "title"),
    slug,
    description: requiredText(properties, "Description", "rich_text"),
    locale,
    translationKey,
    order: requiredNumber(properties, "Order"),
    status: status(properties),
    tags: tags(properties),
    ...(coverUrl ? { coverUrl } : {}),
    lastEditedTime,
  };
}

export function parseLessonPage(page: unknown): Lesson {
  const { id, lastEditedTime, properties } = base(page);
  const { locale, translationKey } = localization(properties, id);
  const slug = requiredText(properties, "Slug", "rich_text");
  assertSlug(slug, "Lesson Slug");
  const relation = array(
    property(properties, "Course").relation,
    "Course.relation"
  );
  if (relation.length !== 1)
    throw new NotionValidationError(
      "Course relation must contain exactly one page"
    );
  const courseId = record(relation[0], "Course relation").id;
  const moduleName = record(
    property(properties, "Module").select,
    "Module.select"
  ).name;
  if (
    typeof courseId !== "string" ||
    typeof moduleName !== "string" ||
    !moduleName
  ) {
    throw new NotionValidationError("Course relation and Module are required");
  }
  return {
    id,
    title: requiredText(properties, "Title", "title"),
    slug,
    description: requiredText(properties, "Description", "rich_text"),
    locale,
    translationKey,
    courseId,
    module: moduleName,
    moduleOrder: requiredNumber(properties, "ModuleOrder"),
    lessonOrder: requiredNumber(properties, "LessonOrder"),
    status: status(properties),
    estimatedMinutes: optionalNumber(properties, "EstimatedMinutes"),
    tags: tags(properties),
    lastEditedTime,
  };
}

export function selectPublishedContent(
  courses: Course[],
  lessons: Lesson[]
): Publication {
  const publishedCourses = courses.filter(
    course => course.status === "Published"
  );
  const allCourseIds = new Set(courses.map(course => course.id));
  for (const lesson of lessons.filter(item => item.status === "Published")) {
    if (!allCourseIds.has(lesson.courseId)) {
      throw new NotionValidationError(
        `Published lesson ${lesson.id} references unknown course ${lesson.courseId}`
      );
    }
  }
  const publishedIds = new Set(publishedCourses.map(course => course.id));
  return {
    courses: [...publishedCourses].sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title)
    ),
    lessons: lessons
      .filter(
        lesson =>
          lesson.status === "Published" && publishedIds.has(lesson.courseId)
      )
      .sort(
        (a, b) =>
          a.moduleOrder - b.moduleOrder ||
          a.lessonOrder - b.lessonOrder ||
          a.title.localeCompare(b.title)
      ),
  };
}
