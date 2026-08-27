import {
  buildCourseCatalog,
  type CourseCatalog,
  type CourseEntry,
  type LessonEntry,
} from "./catalog";
import { filterByLocale, findTranslation } from "@/content/localized";
import {
  CONTENT_LOCALES,
  otherLocale,
  type ContentLocale,
} from "@/i18n/locales";
import { detailPath, sectionPath, translationTarget } from "@/i18n/urls";

export type LocaleAlternate = {
  locale: ContentLocale;
  href: string;
};

export type CourseRouteData = {
  locale: ContentLocale;
  catalog: CourseCatalog;
  languageHref: string;
  alternates: LocaleAlternate[];
  xDefaultHref: string;
};

export type LessonRouteData = CourseRouteData & {
  lesson: LessonEntry;
};

function orderedAlternates(
  entries: Partial<Record<ContentLocale, string>>
): LocaleAlternate[] {
  return CONTENT_LOCALES.flatMap(locale => {
    const href = entries[locale];
    return href ? [{ locale, href }] : [];
  });
}

function koreanCourseHref(
  courses: readonly CourseEntry[],
  course: CourseEntry,
  currentHref: string
): string {
  const korean = findTranslation(courses, course.data.translationKey, "ko");
  return korean ? detailPath("ko", "courses", korean.data.slug) : currentHref;
}

export function buildCourseRouteData(
  courses: readonly CourseEntry[],
  lessons: readonly LessonEntry[],
  locale: ContentLocale
): CourseRouteData[] {
  const localizedCourses = filterByLocale(courses, locale);
  const localizedLessons = filterByLocale(lessons, locale);

  return buildCourseCatalog(localizedCourses, localizedLessons).map(catalog => {
    const currentCourse = catalog.course;
    const targetLocale = otherLocale(locale);
    const translatedCourse = findTranslation(
      courses,
      currentCourse.data.translationKey,
      targetLocale
    );
    const currentHref = detailPath(locale, "courses", currentCourse.data.slug);
    const translatedHref = translatedCourse
      ? detailPath(targetLocale, "courses", translatedCourse.data.slug)
      : undefined;

    return {
      locale,
      catalog,
      languageHref: translationTarget(targetLocale, translatedHref, "courses"),
      alternates: orderedAlternates({
        [locale]: currentHref,
        ...(translatedHref ? { [targetLocale]: translatedHref } : {}),
      }),
      xDefaultHref: koreanCourseHref(courses, currentCourse, currentHref),
    };
  });
}

export function buildLessonRouteData(
  courses: readonly CourseEntry[],
  lessons: readonly LessonEntry[],
  locale: ContentLocale
): LessonRouteData[] {
  const courseRoutes = buildCourseRouteData(courses, lessons, locale);
  const targetLocale = otherLocale(locale);

  return courseRoutes.flatMap(route =>
    route.catalog.lessons.map(lesson => {
      const translatedLesson = findTranslation(
        lessons,
        lesson.data.translationKey,
        targetLocale
      );
      const currentHref = detailPath(
        locale,
        "courses",
        lesson.data.courseSlug,
        lesson.data.slug
      );
      const translatedHref = translatedLesson
        ? detailPath(
            targetLocale,
            "courses",
            translatedLesson.data.courseSlug,
            translatedLesson.data.slug
          )
        : undefined;
      const koreanLesson = findTranslation(
        lessons,
        lesson.data.translationKey,
        "ko"
      );

      return {
        ...route,
        lesson,
        languageHref: translationTarget(
          targetLocale,
          translatedHref,
          "courses"
        ),
        alternates: orderedAlternates({
          [locale]: currentHref,
          ...(translatedHref ? { [targetLocale]: translatedHref } : {}),
        }),
        xDefaultHref: koreanLesson
          ? detailPath(
              "ko",
              "courses",
              koreanLesson.data.courseSlug,
              koreanLesson.data.slug
            )
          : currentHref,
      };
    })
  );
}

export function coursesListRouteData(locale: ContentLocale): {
  languageHref: string;
  alternates: LocaleAlternate[];
  xDefaultHref: string;
} {
  const koreanHref = sectionPath("ko", "courses");
  return {
    languageHref: sectionPath(otherLocale(locale), "courses"),
    alternates: CONTENT_LOCALES.map(entryLocale => ({
      locale: entryLocale,
      href: sectionPath(entryLocale, "courses"),
    })),
    xDefaultHref: koreanHref,
  };
}

export async function getCourseRouteData(
  locale: ContentLocale
): Promise<CourseRouteData[]> {
  const { getCollection } = await import("astro:content");
  const [courses, lessons] = await Promise.all([
    getCollection("courses"),
    getCollection("lessons"),
  ]);
  return buildCourseRouteData(courses, lessons, locale);
}

export async function getLessonRouteData(
  locale: ContentLocale
): Promise<LessonRouteData[]> {
  const { getCollection } = await import("astro:content");
  const [courses, lessons] = await Promise.all([
    getCollection("courses"),
    getCollection("lessons"),
  ]);
  return buildLessonRouteData(courses, lessons, locale);
}
