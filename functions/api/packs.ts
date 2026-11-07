import { handleApiRequest } from '../_lib/router';

export async function onRequest(context: any) {
  return handleApiRequest(context.request, context);
}
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestOptions = onRequest;
