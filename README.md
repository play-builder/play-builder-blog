# Play Builder 🛠️

<p align="center">
  <img src="public/play-builder-image.jpg" alt="Play Builder" width="160">
</p>

**Play Builder** is the engineering blog of **Kai** — practical lessons from real-world production environments, covering cloud-native infrastructure, blockchain operations, and distributed systems.

🔗 **Live site:** [play-builder.pages.dev](https://play-builder.pages.dev/)

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
- Markdown/MDX content with type-safe frontmatter, RSS feed, sitemap, and dynamic OG image generation

## 🚀 Getting Started

```bash
pnpm install      # install dependencies
pnpm dev          # start dev server at localhost:4321
pnpm build        # type-check, build, and index search
pnpm preview      # preview the production build locally
```

Other useful commands:

```bash
pnpm format       # format with Prettier
pnpm lint         # lint with ESLint
```

## 📝 Writing a Post

1. Add a markdown file to `src/content/posts/` (e.g. `my-post.md`).
2. Put images in `src/assets/images/<post-slug>/` and reference them as `@/assets/images/<post-slug>/<file>`.
3. Set the frontmatter:

```yaml
---
title: "Post title"
description: Short summary used for SEO and previews.
pubDatetime: 2026-06-12T09:00:00Z
tags:
  - aws
  - kubernetes
featured: false
draft: false
---
```

Posts with `draft: true` are excluded from the build. Site-wide settings (title, socials, pagination, features) live in `astro-paper.config.ts`.

## 🙏 Credits

Built on [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://github.com/satnaing) — a minimal, accessible, SEO-friendly Astro blog theme.

## 📬 Connect

- GitHub: [github.com/play-builder](https://github.com/play-builder)
- YouTube: [youtube.com/@play-builder47](https://www.youtube.com/@play-builder47)
- LinkedIn: [linkedin.com/in/changsuk-jeon](https://www.linkedin.com/in/changsuk-jeon)
- Email: [playbuilder47@gmail.com](mailto:playbuilder47@gmail.com)

## 📜 License

Licensed under the [MIT License](LICENSE).
