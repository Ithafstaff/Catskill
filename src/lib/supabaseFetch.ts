/** Private API responses must not enter the browser HTTP cache, including profile reads. */
export function createSupabaseFetch(
  projectUrl: string,
  send: typeof fetch = fetch,
): typeof fetch {
  const publicDirectoryUrl = new URL(
    "/rest/v1/rpc/directory_listings",
    projectUrl,
  ).href
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    return send(
      input,
      url === publicDirectoryUrl ? init : { ...init, cache: "no-store" },
    )
  }
}
