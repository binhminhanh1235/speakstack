import { handleApiRequest } from '../../router';

export async function onRequest(context: any) {
  return handleApiRequest(context.request, context);
}
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestPut = onRequest;
export const onRequestDelete = onRequest;
export const onRequestOptions = onRequest;
