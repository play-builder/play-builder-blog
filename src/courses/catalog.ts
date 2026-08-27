import type { ContentLocale } from "@/i18n/locales";

export type CourseEntry = {
  id: string;
  data: {
    notionId?: string;
    id?: string;
    title: string;
    slug: string;
    description: string;
    locale: ContentLocale;
    translationKey: string;
    order: number;
    tags: string[];
    coverUrl?: string;
    lastEditedTime: Date;
  };
};

export type LessonEntry = {
  id: string;
  data: {
    notionId: string;
    title: string;
    slug: string;
    description: string;
    locale: ContentLocale;
    translationKey: string;
    courseId: string;
    courseSlug: string;
    module: string;
    moduleOrder: number;
    lessonOrder: number;
    estimatedMinutes?: number;
    tags: string[];
    lastEditedTime: Date;
  };
};

export type CourseCatalog = {
  course: CourseEntry;
  modules: Array<{ name: string; order: number; lessons: LessonEntry[] }>;
  lessons: LessonEntry[];
  lessonNavigation: Record<string, { previous?: string; next?: string }>;
};

export function buildCourseCatalog(
  courses: CourseEntry[],
  lessons: LessonEntry[]
): CourseCatalog[] {
  const courseBySlug = new Map(
    courses.map(course => [course.data.slug, course])
  );
  for (const lesson of lessons) {
    const course = courseBySlug.get(lesson.data.courseSlug);
    if (!course) {
      throw new Error(
        `Lesson ${lesson.id} references unknown course ${lesson.data.courseSlug}`
      );
    }
    if (lesson.data.locale !== course.data.locale) {
      throw new Error(
        `Lesson ${lesson.id} locale ${lesson.data.locale} does not match course ${course.data.slug} locale ${course.data.locale}`
      );
    }
  }
  return [...courses]
    .sort(
      (a, b) =>
        a.data.order - b.data.order || a.data.title.localeCompare(b.data.title)
    )
    .map(course => {
      const ordered = lessons
        .filter(lesson => lesson.data.courseSlug === course.data.slug)
        .sort(
          (a, b) =>
            a.data.moduleOrder - b.data.moduleOrder ||
            a.data.lessonOrder - b.data.lessonOrder ||
            a.data.title.localeCompare(b.data.title)
        );
      const grouped = new Map<
        string,
        { name: string; order: number; lessons: LessonEntry[] }
      >();
      for (const lesson of ordered) {
        const module = grouped.get(lesson.data.module) ?? {
          name: lesson.data.module,
          order: lesson.data.moduleOrder,
          lessons: [],
        };
        module.lessons.push(lesson);
        grouped.set(module.name, module);
      }
      const lessonNavigation: CourseCatalog["lessonNavigation"] = {};
      ordered.forEach((lesson, index) => {
        lessonNavigation[lesson.data.slug] = {
          ...(ordered[index - 1]
            ? { previous: ordered[index - 1].data.slug }
            : {}),
          ...(ordered[index + 1] ? { next: ordered[index + 1].data.slug } : {}),
        };
      });
      return {
        course,
        modules: [...grouped.values()].sort((a, b) => a.order - b.order),
        lessons: ordered,
        lessonNavigation,
      };
    });
}
