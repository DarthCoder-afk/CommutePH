const canonicalMetroManilaCities = [
  "Caloocan",
  "Las Piñas",
  "Makati",
  "Malabon",
  "Mandaluyong",
  "Manila",
  "Marikina",
  "Muntinlupa",
  "Navotas",
  "Parañaque",
  "Pasay",
  "Pasig",
  "Pateros",
  "Quezon City",
  "San Juan",
  "Taguig",
  "Valenzuela",
] as const;

const cityByNormalizedName = new Map<string, string>(
  canonicalMetroManilaCities.map((city) => [city.toLocaleLowerCase(), city]),
);

cityByNormalizedName.set("caloocan city", "Caloocan");
cityByNormalizedName.set("pasig city", "Pasig");

export function normalizeMetroManilaCity(value: string) {
  return cityByNormalizedName.get(value.trim().toLocaleLowerCase()) ?? null;
}
