import { handleMcpRequest } from '../router';

export async function onRequest(context: any) {
  return handleMcpRequest(context.request, context, context.params?.secret || '');
}
export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestOptions = onRequest;
