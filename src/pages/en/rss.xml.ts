import { buildRss } from "@/rss/feed";

export function GET() {
  return buildRss("en");
}
