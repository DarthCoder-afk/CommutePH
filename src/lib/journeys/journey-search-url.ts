const locationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type JourneySearchSlugs = {
  origin: string;
  destination: string;
};

function isValidLocationSlug(value: string) {
  return (
    value.length > 0 && value.length <= 180 && locationSlugPattern.test(value)
  );
}

export function readJourneySearchSlugs(
  search: string,
): JourneySearchSlugs | null {
  const searchParams = new URLSearchParams(search);
  const origin = (searchParams.get("origin") ?? "").trim();
  const destination = (searchParams.get("destination") ?? "").trim();

  if (
    !isValidLocationSlug(origin) ||
    !isValidLocationSlug(destination) ||
    origin === destination
  ) {
    return null;
  }

  return { origin, destination };
}

export function buildJourneySearchUrl(
  href: string,
  slugs: JourneySearchSlugs | null,
) {
  const url = new URL(href);

  if (slugs) {
    url.searchParams.set("origin", slugs.origin);
    url.searchParams.set("destination", slugs.destination);
  } else {
    url.searchParams.delete("origin");
    url.searchParams.delete("destination");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
