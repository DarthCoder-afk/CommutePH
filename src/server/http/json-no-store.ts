export const noStoreCacheControl = "no-store, max-age=0";

type JsonNoStoreInit = Omit<ResponseInit, "headers"> & {
  headers?: HeadersInit;
};

export function jsonNoStore(
  data: unknown,
  init: JsonNoStoreInit = {},
): Response {
  const headers = new Headers(init.headers);

  headers.set("Cache-Control", noStoreCacheControl);

  return Response.json(data, {
    ...init,
    headers,
  });
}
