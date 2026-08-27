import { getPostOgRouteData } from "@/posts/routes";

export { GET } from "@/pages/posts/[...slug]/index.png";

export async function getStaticPaths() {
  return (await getPostOgRouteData("en")).map(({ slug, post }) => ({
    params: { slug },
    props: post,
  }));
}
