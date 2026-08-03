"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";

import type { JourneyPathFeatureCollection } from "@/server/journeys/assemble-published-journey-paths";

import type {
  JourneyMarkerFeatureCollection,
  JourneyMarkerRole,
} from "@/server/journeys/build-journey-map-geojson";

type JourneyMapProps = {
  markers: JourneyMarkerFeatureCollection;
  paths: JourneyPathFeatureCollection;
};

type MapStatus = "loading" | "ready" | "error";

const developmentStyleUrl = "https://demotiles.maplibre.org/style.json";

const markerRoleLabels = {
  origin: "Origin",
  pickup: "Pickup point",
  transfer: "Transfer point",
  dropoff: "Drop-off point",
  destination: "Destination",
} satisfies Record<JourneyMarkerRole, string>;

function formatMarkerRoles(roles: JourneyMarkerRole[]) {
  return roles.map((role) => markerRoleLabels[role]).join(", ");
}

function getMarkerColor(roles: JourneyMarkerRole[]) {
  if (roles.includes("origin")) {
    return "#1d4ed8";
  }

  if (roles.includes("destination")) {
    return "#047857";
  }

  if (roles.includes("transfer")) {
    return "#b45309";
  }

  if (roles.includes("pickup")) {
    return "#7e22ce";
  }

  return "#be123c";
}

export function JourneyMap({ markers, paths }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MapStatus>("loading");

  const hasMapData = markers.features.length > 0 || paths.features.length > 0;

  const hasWalkingPaths = paths.features.some(
    (feature) => feature.properties.kind === "walking",
  );

  const hasTransitPaths = paths.features.some(
    (feature) => feature.properties.kind === "transit",
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !hasMapData) {
      return;
    }

    let disposed = false;
    let mapInstance: maplibregl.Map | null = null;

    const renderedMarkers: maplibregl.Marker[] = [];

    try {
      const firstCoordinates =
        markers.features[0]?.geometry.coordinates ??
        paths.features[0]?.geometry.coordinates[0];

      if (!firstCoordinates) {
        throw new Error("The journey map has no initial coordinates.");
      }

      mapInstance = new maplibregl.Map({
        container,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? developmentStyleUrl,
        center: firstCoordinates,
        zoom: 14,
        cooperativeGestures: true,
        maplibreLogo: true,
      });

      mapInstance.addControl(
        new maplibregl.NavigationControl({
          showCompass: true,
          showZoom: true,
        }),
        "top-right",
      );

      const bounds = new maplibregl.LngLatBounds();

      let boundedCoordinateCount = 0;

      for (const feature of markers.features) {
        const coordinates = feature.geometry.coordinates;
        const rolesLabel = formatMarkerRoles(feature.properties.roles);
        const markerLabel = `Stop ${feature.properties.sequence}: ${feature.properties.name}: ${rolesLabel}`;

        bounds.extend(coordinates);

        boundedCoordinateCount += 1;

        const markerElement = document.createElement("button");

        markerElement.type = "button";
        markerElement.title = markerLabel;
        markerElement.setAttribute("aria-label", markerLabel);
        markerElement.textContent = String(feature.properties.sequence);

        markerElement.style.width = "1.75rem";
        markerElement.style.height = "1.75rem";
        markerElement.style.borderRadius = "9999px";
        markerElement.style.border = "3px solid white";
        markerElement.style.backgroundColor = getMarkerColor(
          feature.properties.roles,
        );
        markerElement.style.boxShadow = "0 2px 6px rgb(15 23 42 / 35%)";
        markerElement.style.color = "white";
        markerElement.style.fontSize = "0.75rem";
        markerElement.style.fontWeight = "700";
        markerElement.style.lineHeight = "1";
        markerElement.style.textAlign = "center";
        markerElement.style.cursor = "pointer";

        const popupContent = document.createElement("div");
        const popupSequence = document.createElement("p");
        const popupTitle = document.createElement("strong");
        const popupRoles = document.createElement("p");

        popupSequence.textContent = `Stop ${feature.properties.sequence}`;
        popupSequence.style.marginBottom = "0.25rem";
        popupSequence.style.fontSize = "0.75rem";
        popupSequence.style.fontWeight = "700";
        popupSequence.style.color = "#475569";

        popupTitle.textContent = feature.properties.name;
        popupRoles.textContent = rolesLabel;
        popupRoles.style.marginTop = "0.25rem";

        popupContent.append(popupSequence, popupTitle, popupRoles);

        const popup = new maplibregl.Popup({
          offset: 20,
          closeButton: true,
        }).setDOMContent(popupContent);

        const marker = new maplibregl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat(coordinates)
          .setPopup(popup)
          .addTo(mapInstance);

        renderedMarkers.push(marker);
      }

      for (const feature of paths.features) {
        for (const coordinates of feature.geometry.coordinates) {
          bounds.extend(coordinates);
          boundedCoordinateCount += 1;
        }
      }

      if (boundedCoordinateCount === 1) {
        mapInstance.jumpTo({
          center: firstCoordinates,
          zoom: 15,
        });
      } else {
        mapInstance.fitBounds(bounds, {
          padding: 48,
          maxZoom: 15,
          duration: 0,
        });
      }

      mapInstance.once("load", () => {
        if (disposed || !mapInstance) {
          return;
        }

        if (paths.features.length > 0) {
          mapInstance.addSource("journey-paths", {
            type: "geojson",
            data: paths,
          });

          mapInstance.addLayer({
            id: "journey-transit-paths",
            type: "line",
            source: "journey-paths",
            filter: ["==", ["get", "kind"], "transit"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#2563eb",
              "line-width": 5,
              "line-opacity": 0.9,
            },
          });

          mapInstance.addLayer({
            id: "journey-walking-paths",
            type: "line",
            source: "journey-paths",
            filter: ["==", ["get", "kind"], "walking"],
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#475569",
              "line-width": 4,
              "line-opacity": 0.9,
              "line-dasharray": [2, 2],
            },
          });
        }

        setStatus("ready");
      });

      mapInstance.on("error", () => {
        if (!disposed) {
          setStatus("error");
        }
      });
    } catch (error) {
      console.error("Unable to initialize journey map:", error);

      queueMicrotask(() => {
        if (!disposed) {
          setStatus("error");
        }
      });
    }

    return () => {
      disposed = true;

      for (const marker of renderedMarkers) {
        marker.remove();
      }

      mapInstance?.remove();
    };
  }, [hasMapData, markers, paths]);

  if (!hasMapData) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        Map locations are unavailable for this journey.
      </p>
    );
  }

  return (
    <div>
      <div
        role="region"
        aria-label="Interactive journey map"
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
      >
        <div ref={containerRef} className="h-96 w-full" />

        {status === "loading" ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/80 text-sm font-semibold text-slate-700"
          >
            Loading map…
          </div>
        ) : null}

        {status === "error" ? (
          <div
            role="alert"
            className="absolute right-4 bottom-4 left-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-sm"
          >
            The interactive map could not be loaded. Use the location list
            below.
          </div>
        ) : null}
      </div>

      {paths.features.length > 0 ? (
        <div
          aria-label="Journey path legend"
          className="mt-3 flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
        >
          {hasTransitPaths ? (
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-1 w-8 rounded-full bg-blue-600"
              />
              <span>Transit path</span>
            </div>
          ) : null}

          {hasWalkingPaths ? (
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-8 border-t-4 border-dashed border-slate-600"
              />
              <span>Walking path</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-800">
          Locations shown on the map
        </summary>

        <ul className="mt-3 space-y-2">
          {markers.features.map((feature) => (
            <li
              key={feature.id}
              className="flex flex-wrap justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2 font-medium text-slate-900">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white"
                >
                  {feature.properties.sequence}
                </span>

                {feature.properties.name}
              </span>

              <span className="text-slate-600">
                {formatMarkerRoles(feature.properties.roles)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
