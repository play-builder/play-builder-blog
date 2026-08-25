import { handlePublishRequest, type PublishEnv } from "../../../src/admin/publish";

export const onRequest: PagesFunction<PublishEnv> = async context =>
  handlePublishRequest(context.request, context.env);
