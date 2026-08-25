
import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://blog.playbuilder.xyz/",
    title: "Play Builder",
    description:
      "DevOps, Kubernetes, AWS, Terraform, Web3, and platform engineering notes by Kai. Sharing real-world experiences in cloud infrastructure, blockchain operations, and production systems.",
    author: "PlayBuilder",
    profile: "https://github.com/play-builder",
    ogImage: "play-builder-image.jpg",
    lang: "en",
    timezone: "Asia/Seoul",
    dir: "ltr",
  },

  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },

  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
  },

  socials: [
    {
      name: "youtube",
      url: "https://www.youtube.com/@play-builder47",
    },
        {
      name: "github",
      url: "https://github.com/play-builder",
    },
    {
      name: "mail",
      url: "mailto:playbuilder47@gmail.com",
    },
  ],

  shareLinks: [
    {
      name: "x",
      url: "https://x.com/intent/post?url=",
    },
    {
      name: "mail",
      url: "mailto:?subject=Play%20Builder&body=",
    },
  ],
});
