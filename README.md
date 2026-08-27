# Play Builder 🛠️

<p align="center">
  <img src="public/play-builder-image.jpg" alt="Play Builder" width="160">
</p>

**Play Builder** is the engineering blog of **Kai** — practical lessons from real-world production environments, covering cloud-native infrastructure, blockchain operations, and distributed systems.

🔗 **Live site:** [blog.playbuilder.xyz](https://blog.playbuilder.xyz/)

## ✍️ What I Write About

- **DevOps & Platform Engineering** — Kubernetes, Terraform, GitOps (Argo CD), CI/CD, AWS
- **Observability & Reliability** — Prometheus, Grafana, Loki, SLA-driven monitoring
- **Linux & Networking** — Linux kernel, TCP/IP, network security, DNS
- **Web3 Infrastructure** — validator & full-node operations, smart contracts, on-chain data delivery
- **Distributed Systems** — real-time data pipelines, autoscaling, high-throughput streaming

Recent topics include Kinesis hot-shard handling and iterator-age monitoring, bastion-free access with AWS SSM Session Manager, Auto Scaling lifecycle hooks for log preservation, security group connection tracking, container Linux capabilities, and running Solana node infrastructure beyond the major clouds.

## 🧱 Tech Stack

- [Astro](https://astro.build/) with the [AstroPaper](https://github.com/satnaing/astro-paper) theme
- [Tailwind CSS](https://tailwindcss.com/) + TypeScript
- [Pagefind](https://pagefind.app/) static search
- Locale-isolated Korean/English Markdown Tech Posts and build-time Notion Courses
- Cloudflare Access-protected manual Production publishing
- Type-safe frontmatter, RSS feed, sitemap, and dynamic OG image generation

## 🚀 Getting Started

```bash
pnpm install      # install dependencies
pnpm dev          # start dev server at localhost:4321
pnpm build        # type-check, build, and index search
pnpm build:fixture # build two deterministic sample lessons without Notion credentials
pnpm test         # run unit and generated-HTML contract tests
pnpm preview      # preview the production build locally
```

Other useful commands:

```bash
pnpm format       # format with Prettier
pnpm lint         # lint with ESLint
```

## 📝 Writing a Post

Korean is the default locale. A Korean Post and its English translation are two
separate Markdown/MDX files; the site does not translate content at runtime.

1. Add the Korean source to `src/content/posts/` (for example,
   `src/content/posts/my-post.md`).
2. Add the English translation to `src/content/posts/en/` (for example,
   `src/content/posts/en/my-post.md`). English content is optional until it is
   ready.
3. Give both files the same stable `translationKey`. Set `locale: ko` on the
   Korean file and `locale: en` on the English file.
4. Put shared images in `src/assets/images/<post-slug>/` and reference them as
   `@/assets/images/<post-slug>/<file>`.
5. Set the frontmatter:

```yaml
---
title: "한국어 글 제목"
description: SEO와 카드에 표시할 한국어 요약입니다.
pubDatetime: 2026-06-12T09:00:00Z
locale: ko
translationKey: my-post
tags:
  - aws
  - kubernetes
featured: false
draft: false
---
```

The English file uses its own English `title`, `description`, and body while
keeping the same `translationKey`:

```yaml
---
title: "English post title"
description: English summary used for SEO and previews.
pubDatetime: 2026-06-12T09:00:00Z
locale: en
translationKey: my-post
tags:
  - aws
  - kubernetes
featured: false
draft: false
---
```

Posts with `draft: true` are excluded from the build. A missing translation is
allowed: the language switcher opens the target locale's Posts list and does
not advertise a false detail-page `hreflang`. Site-wide settings (title,
socials, pagination, features) live in `astro-paper.config.ts`.

## 🌐 Locale URL Matrix

| Content    | Korean (default)              | English                          |
| ---------- | ----------------------------- | -------------------------------- |
| Home       | `/`                           | `/en/`                           |
| Tech Posts | `/posts/`                     | `/en/posts/`                     |
| Post       | `/posts/{slug}/`              | `/en/posts/{slug}/`              |
| Courses    | `/courses/`                   | `/en/courses/`                   |
| Course     | `/courses/{course}/`          | `/en/courses/{course}/`          |
| Lesson     | `/courses/{course}/{lesson}/` | `/en/courses/{course}/{lesson}/` |
| Search     | `/search/`                    | `/en/search/`                    |
| RSS        | `/rss.xml`                    | `/en/rss.xml`                    |

Every Post, Course, and Lesson body must be translated and authored separately.
`TranslationKey` only connects the two records for language navigation; it does
not generate translated text. Course and Lesson metadata/body authoring details
are in the publishing guide below.

## 🎓 Publishing a Course

Course metadata and lesson bodies are maintained as pages inside private Notion databases. Notion pages do not need to be published to the web. A read-only Notion connection reads only pages explicitly shared with it.

Changing Notion does not immediately change the site. After setting the parent Course and intended Lessons to `Published`, an authorized administrator opens `/admin/publish/` and requests a Cloudflare Pages build. The previous Production deployment remains active when validation or build fails.

See [`docs/notion-cloudflare-course-publishing.md`](docs/notion-cloudflare-course-publishing.md) for the complete Notion schema, secrets, Cloudflare Access policy, first deployment, publishing, validation, and rollback procedures.

## 🙏 Credits

Built on [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://github.com/satnaing) — a minimal, accessible, SEO-friendly Astro blog theme.

## 📬 Connect

- GitHub: [github.com/play-builder](https://github.com/play-builder)
- YouTube: [youtube.com/@play-builder47](https://www.youtube.com/@play-builder47)
- LinkedIn: [linkedin.com/in/changsuk-jeon](https://www.linkedin.com/in/changsuk-jeon)
- Email: [playbuilder47@gmail.com](mailto:playbuilder47@gmail.com)

## 📜 License

Licensed under the [MIT License](LICENSE).
