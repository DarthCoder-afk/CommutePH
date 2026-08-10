"use client";

import { useEffect, useRef, useState } from "react";
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

type OperationsLocationMapProps = {
  locations: OperationsMapLocation[];
};

type OperationsPointFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Omit<OperationsMapLocation, "longitude" | "latitude">;
};

export function OperationsLocationMap({
  locations,
}: OperationsLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const operationsMapStyle = publicMapStyle ?? developmentMapStyle;

  useEffect(() => {
    const container = containerRef.current;

    if (!container || locations.length === 0) return;

    const features: OperationsPointFeature[] = locations.map((location) => ({
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
    }));
    const map = new maplibregl.Map({
      container,
      style: operationsMapStyle,
      center: [121.03, 14.56],
      zoom: 11,
      cooperativeGestures: true,
      maplibreLogo: true,
    });
    const popup = new maplibregl.Popup({ closeButton: true, offset: 10 });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.once("load", () => {
      map.addSource("operations-locations", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
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

      const bounds = new maplibregl.LngLatBounds();
      for (const location of locations) {
        bounds.extend([location.longitude, location.latitude]);
      }
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
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
      popup.remove();
      map.remove();
    };
  }, [locations, operationsMapStyle]);

  return (
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
  );
}
