export type SupportedLocationOption = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  city: string;
  area: string | null;
  longitude: number;
  latitude: number;
};

export type PlaceSearchOption = {
  id: string;
  source: "place";
  provider: "maptiler";
  name: string;
  label: string;
  kind: string;
  city: string | null;
  area: string | null;
  longitude: number;
  latitude: number;
};

export type SearchLocationOption = SupportedLocationOption | PlaceSearchOption;

export function isPlaceSearchOption(
  option: SearchLocationOption,
): option is PlaceSearchOption {
  return "source" in option && option.source === "place";
}

export function isSupportedLocationOption(
  option: SearchLocationOption,
): option is SupportedLocationOption {
  return !isPlaceSearchOption(option);
}
