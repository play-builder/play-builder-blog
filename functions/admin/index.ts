export const onRequest: PagesFunction = async () =>
  new Response(null, {
    status: 302,
    headers: { Location: "/admin/publish/", "Cache-Control": "no-store" },
  });
