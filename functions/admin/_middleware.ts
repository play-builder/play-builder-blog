import { authorizeAdminRequest, forbiddenResponse, type AdminEnv } from "../../src/admin/auth";

export const onRequest: PagesFunction<AdminEnv> = async context => {
  try {
    await authorizeAdminRequest(context.request, context.env);
    return await context.next();
  } catch {
    return forbiddenResponse();
  }
};
