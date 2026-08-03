"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";

import type {
  JourneyMarkerFeatureCollection,
  JourneyMarkerRole,
} from "@/server/journeys/build-journey-map-geojson";

type JourneyMapProps = {
  markers: JourneyMarkerFeatureCollection;
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

export function JourneyMap({ markers }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MapStatus>("loading");

  const hasMarkers = markers.features.length > 0;

  useEffect(() => {
    const container = containerRef.current;

    if (!container || markers.features.length === 0) {
      return;
    }

    let disposed = false;
    let mapInstance: maplibregl.Map | null = null;

    const renderedMarkers: maplibregl.Marker[] = [];

    try {
      const firstCoordinates = markers.features[0]?.geometry.coordinates;

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

      for (const feature of markers.features) {
        const coordinates = feature.geometry.coordinates;
        const rolesLabel = formatMarkerRoles(feature.properties.roles);

        bounds.extend(coordinates);

        const markerElement = document.createElement("button");

        markerElement.type = "button";
        markerElement.title = `${feature.properties.name}: ${rolesLabel}`;

        markerElement.setAttribute(
          "aria-label",
          `${feature.properties.name}: ${rolesLabel}`,
        );

        markerElement.style.width = "1.75rem";
        markerElement.style.height = "1.75rem";
        markerElement.style.borderRadius = "9999px";
        markerElement.style.border = "3px solid white";
        markerElement.style.backgroundColor = getMarkerColor(
          feature.properties.roles,
        );
        markerElement.style.boxShadow = "0 2px 6px rgb(15 23 42 / 35%)";
        markerElement.style.cursor = "pointer";

        const popupContent = document.createElement("div");
        const popupTitle = document.createElement("strong");
        const popupRoles = document.createElement("p");

        popupTitle.textContent = feature.properties.name;
        popupRoles.textContent = rolesLabel;
        popupRoles.style.marginTop = "0.25rem";

        popupContent.append(popupTitle, popupRoles);

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

      if (markers.features.length === 1) {
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
        if (!disposed) {
          setStatus("ready");
        }
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
  }, [markers]);

  if (!hasMarkers) {
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
              <span className="font-medium text-slate-900">
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
