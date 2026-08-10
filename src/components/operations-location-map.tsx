"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";

import { developmentMapStyle, publicMapStyle } from "@/config/map-style-url";

type OperationsMapLocation = {
  id: string;
  name: string;
  kind: string;
  city: string;
  sourceType: string;
  verificationStatus: string;
  isActive: boolean;
  longitude: number;
  latitude: number;
};

type OperationsMapRoute = {
  id: string;
  name: string;
  stops: Array<{ locationId: string; position: number }>;
};

type OperationsLocationMapProps = {
  locations: OperationsMapLocation[];
  routes: OperationsMapRoute[];
};

type OperationsPointFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Omit<OperationsMapLocation, "longitude" | "latitude">;
};

const sourceOptions = [
  ["all", "All sources"],
  ["manual", "Manual"],
  ["openstreetmap", "OpenStreetMap"],
  ["gtfs", "GTFS"],
  ["development_fixture", "Development fixtures"],
] as const;

function toFeature(location: OperationsMapLocation): OperationsPointFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [location.longitude, location.latitude],
    },
    properties: {
      id: location.id,
      name: location.name,
      kind: location.kind,
      city: location.city,
      sourceType: location.sourceType,
      verificationStatus: location.verificationStatus,
      isActive: location.isActive,
    },
  };
}

export function OperationsLocationMap({
  locations,
  routes,
}: OperationsLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [routeId, setRouteId] = useState("all");
  const operationsMapStyle = publicMapStyle ?? developmentMapStyle;

  const selectedRoute = routes.find((route) => route.id === routeId) ?? null;
  const routeLocationIds = useMemo(
    () => new Set(selectedRoute?.stops.map((stop) => stop.locationId) ?? []),
    [selectedRoute],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredLocations = useMemo(
    () =>
      locations.filter((location) => {
        if (selectedRoute && !routeLocationIds.has(location.id)) return false;
        if (source !== "all" && location.sourceType !== source) return false;

        return (
          !normalizedQuery ||
          location.name.toLocaleLowerCase().includes(normalizedQuery) ||
          location.city.toLocaleLowerCase().includes(normalizedQuery)
        );
      }),
    [locations, normalizedQuery, routeLocationIds, selectedRoute, source],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: operationsMapStyle,
      center: [121.03, 14.56],
      zoom: 11,
      cooperativeGestures: true,
      maplibreLogo: true,
    });
    const popup = new maplibregl.Popup({ closeButton: true, offset: 10 });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.once("load", () => {
      map.addSource("operations-locations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "operations-location-points",
        type: "circle",
        source: "operations-locations",
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "terminal"], 8, 6],
          "circle-color": [
            "match",
            ["get", "sourceType"],
            "development_fixture",
            "#dc2626",
            "openstreetmap",
            "#d97706",
            "gtfs",
            "#7c3aed",
            "#047857",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9,
        },
      });
      setMapLoaded(true);
    });

    map.on("click", "operations-location-points", (event) => {
      const feature = event.features?.[0];
      const coordinates =
        feature?.geometry.type === "Point"
          ? (feature.geometry.coordinates as [number, number])
          : null;
      const properties = feature?.properties;

      if (!coordinates || !properties) return;

      const content = document.createElement("div");
      const name = document.createElement("strong");
      const detail = document.createElement("p");
      const state = document.createElement("p");
      name.textContent = String(properties.name);
      detail.textContent = `${properties.kind} · ${properties.city} · ${properties.sourceType}`;
      state.textContent = `${properties.verificationStatus} · ${properties.isActive ? "active" : "inactive"}`;
      detail.style.marginTop = "0.25rem";
      state.style.marginTop = "0.25rem";
      content.append(name, detail, state);
      popup.setLngLat(coordinates).setDOMContent(content).addTo(map);
    });
    map.on("mouseenter", "operations-location-points", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "operations-location-points", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("error", (event) => {
      console.error("Operations map error:", event.error);
      setError("The operations basemap could not be loaded.");
    });

    return () => {
      routeMarkersRef.current.forEach((marker) => marker.remove());
      routeMarkersRef.current = [];
      popup.remove();
      mapRef.current = null;
      map.remove();
    };
  }, [operationsMapStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapLoaded) return;

    const mapSource = map.getSource(
      "operations-locations",
    ) as maplibregl.GeoJSONSource;
    mapSource.setData({
      type: "FeatureCollection",
      features: filteredLocations.map(toFeature),
    });

    routeMarkersRef.current.forEach((marker) => marker.remove());
    routeMarkersRef.current = [];

    if (selectedRoute) {
      const locationById = new Map(
        locations.map((location) => [location.id, location]),
      );

      for (const stop of selectedRoute.stops) {
        const location = locationById.get(stop.locationId);

        if (!location || !filteredLocations.includes(location)) continue;

        const markerElement = document.createElement("span");
        markerElement.textContent = String(stop.position);
        markerElement.setAttribute(
          "aria-label",
          `${selectedRoute.name} stop ${stop.position}: ${location.name}`,
        );
        markerElement.style.display = "flex";
        markerElement.style.width = "1.75rem";
        markerElement.style.height = "1.75rem";
        markerElement.style.alignItems = "center";
        markerElement.style.justifyContent = "center";
        markerElement.style.border = "3px solid white";
        markerElement.style.borderRadius = "9999px";
        markerElement.style.background = "#0f172a";
        markerElement.style.color = "white";
        markerElement.style.fontSize = "0.75rem";
        markerElement.style.fontWeight = "700";
        markerElement.style.boxShadow = "0 2px 6px rgb(15 23 42 / 35%)";

        routeMarkersRef.current.push(
          new maplibregl.Marker({ element: markerElement, anchor: "center" })
            .setLngLat([location.longitude, location.latitude])
            .addTo(map),
        );
      }
    }

    if (filteredLocations.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const location of filteredLocations) {
        bounds.extend([location.longitude, location.latitude]);
      }
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
    }
  }, [filteredLocations, locations, mapLoaded, selectedRoute]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Search stops
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or city"
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          />
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Data source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          >
            {sourceOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-semibold text-slate-700">
          Stored route
          <select
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          >
            <option value="all">All locations</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p aria-live="polite">
          Showing {filteredLocations.length} of {locations.length} locations.
        </p>
        {selectedRoute ? (
          <p className="font-medium text-amber-800">
            Numbered markers show stored stop order, not a verified street path.
          </p>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-slate-100">
        <div ref={containerRef} className="h-[32rem] w-full" />
        {error ? (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}
        <div className="absolute bottom-3 left-3 z-10 rounded-xl bg-white/95 p-3 text-xs shadow-lg">
          <p>
            <span className="text-emerald-700">●</span> Manual
          </p>
          <p>
            <span className="text-amber-600">●</span> OpenStreetMap
          </p>
          <p>
            <span className="text-purple-700">●</span> GTFS
          </p>
          <p>
            <span className="text-red-600">●</span> Development fixture
          </p>
        </div>
      </div>
    </div>
  );
}
