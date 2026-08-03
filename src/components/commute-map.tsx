"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import * as maplibregl from "maplibre-gl";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import type { LocationOption } from "@/components/location-search-input";
import { publicMapStyle } from "@/config/map-style-url";
import {
  geolocationStatusMessages,
  getGeolocationFailureStatus,
  isGeolocationFailure,
  type GeolocationStatus,
} from "@/lib/geolocation/geolocation-status";

type MapStatus = "loading" | "ready" | "error";
type LocationStatus = "loading" | "ready" | "empty" | "error";

type LocationSearchResponse = {
  data: LocationOption[];
};

const initialCenter: [number, number] = [121.0244, 14.5674];

function isRenderableLocation(location: LocationOption) {
  return (
    Number.isFinite(location.longitude) &&
    Number.isFinite(location.latitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    location.latitude >= -90 &&
    location.latitude <= 90
  );
}

function createLocationPopupContent(properties: Record<string, unknown>) {
  const content = document.createElement("div");
  const name = document.createElement("strong");
  const place = document.createElement("span");

  name.className = "block text-sm text-slate-950";
  name.textContent =
    typeof properties.name === "string"
      ? properties.name
      : "Supported location";

  place.className = "mt-1 block text-xs text-slate-600";

  const area = typeof properties.area === "string" ? properties.area : null;
  const city = typeof properties.city === "string" ? properties.city : null;

  place.textContent = [area, city].filter(Boolean).join(", ");

  content.append(name, place);

  return content;
}

function createCurrentLocationMarkerElement() {
  const marker = document.createElement("button");
  const pulse = document.createElement("span");
  const dot = document.createElement("span");

  marker.type = "button";
  marker.title = "Your current location";
  marker.setAttribute("aria-label", "Your current location");
  marker.className =
    "relative flex size-8 cursor-pointer items-center justify-center rounded-full focus:ring-4 focus:ring-sky-300 focus:outline-none";

  pulse.setAttribute("aria-hidden", "true");
  pulse.className =
    "pointer-events-none absolute size-8 animate-ping rounded-full bg-sky-500/35";

  dot.setAttribute("aria-hidden", "true");
  dot.className =
    "pointer-events-none relative size-5 rounded-full border-[3px] border-white bg-sky-600 shadow-lg";

  marker.append(pulse, dot);

  return marker;
}

function createCurrentLocationPopupContent() {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  const description = document.createElement("span");

  title.className = "block text-sm text-slate-950";
  title.textContent = "Your current location";

  description.className = "mt-1 block text-xs text-slate-600";
  description.textContent = "Used only for this map view and not saved.";

  content.append(title, description);

  return content;
}

export function CommuteMap() {
  const { selectCurrentLocation } = useCurrentLocationOrigin();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const geolocationRequestRef = useRef(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("loading");
  const [locationCount, setLocationCount] = useState(0);
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>("idle");

  function handleUseCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setGeolocationStatus("unsupported");
      return;
    }

    const requestId = geolocationRequestRef.current + 1;

    geolocationRequestRef.current = requestId;
    setGeolocationStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }

        const map = mapRef.current;
        const longitude = position.coords.longitude;
        const latitude = position.coords.latitude;

        if (
          !map ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          setGeolocationStatus("position-unavailable");
          return;
        }

        const coordinates: [number, number] = [longitude, latitude];

        currentLocationMarkerRef.current?.remove();

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 20,
        }).setDOMContent(createCurrentLocationPopupContent());

        currentLocationMarkerRef.current = new maplibregl.Marker({
          element: createCurrentLocationMarkerElement(),
          anchor: "center",
        })
          .setLngLat(coordinates)
          .setPopup(popup)
          .addTo(map);

        map.jumpTo({
          center: coordinates,
          zoom: Math.max(map.getZoom(), 14),
        });

        selectCurrentLocation({ latitude, longitude });

        setGeolocationStatus("success");
      },
      (error) => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }

        setGeolocationStatus(getGeolocationFailureStatus(error.code));
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const locationsRequest = new AbortController();

    let disposed = false;
    let isReady = false;
    let locationsRequested = false;
    let mapInstance: maplibregl.Map | null = null;
    let loadingTimeout: ReturnType<typeof setTimeout> | null = null;

    const renderedLocationMarkers: maplibregl.Marker[] = [];

    const markReady = () => {
      if (disposed || isReady) {
        return;
      }

      isReady = true;

      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }

      setStatus("ready");

      requestAnimationFrame(() => {
        if (!disposed) {
          mapInstance?.resize();
        }
      });
    };

    const loadSupportedLocations = async (map: maplibregl.Map) => {
      try {
        const response = await fetch("/api/locations", {
          signal: locationsRequest.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Location loading failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as LocationSearchResponse;

        if (!Array.isArray(payload.data)) {
          throw new Error(
            "The locations endpoint returned an invalid response.",
          );
        }

        const renderableLocations = payload.data.filter(isRenderableLocation);

        if (disposed) {
          return;
        }

        setLocationCount(renderableLocations.length);

        if (renderableLocations.length === 0) {
          setLocationStatus("empty");
          return;
        }

        const bounds = new maplibregl.LngLatBounds();

        for (const location of renderableLocations) {
          const coordinates: [number, number] = [
            location.longitude,
            location.latitude,
          ];

          const markerElement = document.createElement("button");

          markerElement.type = "button";
          markerElement.title = location.name;
          markerElement.setAttribute(
            "aria-label",
            `Supported location: ${location.name}`,
          );
          markerElement.className =
            "size-7 cursor-pointer rounded-full border-[3px] border-white bg-blue-700 shadow-lg ring-2 ring-blue-700/25 transition-colors hover:bg-blue-900 focus:ring-4 focus:ring-blue-300 focus:outline-none";

          const popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            offset: 18,
          }).setDOMContent(
            createLocationPopupContent({
              name: location.name,
              area: location.area,
              city: location.city,
            }),
          );

          const marker = new maplibregl.Marker({
            element: markerElement,
            anchor: "center",
          })
            .setLngLat(coordinates)
            .setPopup(popup)
            .addTo(map);

          renderedLocationMarkers.push(marker);
          bounds.extend(coordinates);
        }

        map.fitBounds(bounds, {
          padding: 64,
          maxZoom: 12,
          duration: 0,
        });

        setLocationStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load supported locations:", error);

        if (!disposed) {
          setLocationCount(0);
          setLocationStatus("error");
        }
      }
    };

    const handleMapReady = () => {
      markReady();

      if (!disposed && !locationsRequested && mapInstance) {
        locationsRequested = true;
        void loadSupportedLocations(mapInstance);
      }
    };

    try {
      if (!publicMapStyle) {
        throw new Error(
          "NEXT_PUBLIC_MAP_STYLE_URL is required outside development.",
        );
      }

      mapInstance = new maplibregl.Map({
        container,
        style: publicMapStyle,
        center: initialCenter,
        zoom: 11,
        cooperativeGestures: true,
        maplibreLogo: true,
      });

      mapRef.current = mapInstance;

      mapInstance.addControl(
        new maplibregl.NavigationControl({
          showCompass: true,
          showZoom: true,
        }),
        "top-right",
      );

      mapInstance.once("style.load", () => {
        mapInstance?.jumpTo({
          center: initialCenter,
          zoom: 11,
        });
      });
      mapInstance.once("load", handleMapReady);
      mapInstance.once("idle", handleMapReady);

      mapInstance.on("error", (event) => {
        console.error("MapLibre failed to load a map resource:", event.error);

        if (!disposed && !isReady) {
          setStatus("error");
        }
      });

      if (mapInstance.isStyleLoaded()) {
        mapInstance.jumpTo({
          center: initialCenter,
          zoom: 11,
        });

        if (mapInstance.loaded()) {
          handleMapReady();
        }
      }

      loadingTimeout = setTimeout(() => {
        if (!disposed && !isReady) {
          console.error(
            "The commute map did not become ready within 15 seconds.",
          );
          setStatus("error");
        }
      }, 15_000);
    } catch (error) {
      console.error("Unable to initialize the commute map:", error);

      queueMicrotask(() => {
        if (!disposed) {
          setStatus("error");
        }
      });
    }

    return () => {
      disposed = true;
      geolocationRequestRef.current += 1;
      locationsRequest.abort();

      currentLocationMarkerRef.current?.remove();
      currentLocationMarkerRef.current = null;
      mapRef.current = null;

      for (const marker of renderedLocationMarkers) {
        marker.remove();
      }

      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }

      mapInstance?.remove();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          aria-describedby="current-location-status"
          disabled={status !== "ready" || geolocationStatus === "requesting"}
          onClick={handleUseCurrentLocation}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-800 transition-colors hover:border-blue-300 hover:bg-blue-100 focus:ring-4 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
        >
          {geolocationStatus === "requesting" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <LocateFixed aria-hidden="true" className="size-4" />
          )}

          {geolocationStatus === "requesting"
            ? "Locating…"
            : geolocationStatus === "success"
              ? "Update my location"
              : "Use my current location"}
        </button>

        <p
          id="current-location-status"
          role={isGeolocationFailure(geolocationStatus) ? "alert" : "status"}
          aria-live="polite"
          className={`text-sm leading-6 ${
            isGeolocationFailure(geolocationStatus)
              ? "text-red-700"
              : geolocationStatus === "success"
                ? "text-emerald-700"
                : "text-slate-600"
          }`}
        >
          {geolocationStatus === "success"
            ? "Current location is selected as your starting point. Your precise position is kept in this browser session and is not saved."
            : geolocationStatusMessages[geolocationStatus]}
        </p>
      </div>

      <div
        role="region"
        aria-label="Interactive commute map"
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-lg shadow-slate-900/5"
      >
        <div ref={containerRef} className="h-80 w-full sm:h-[28rem]" />

        {status === "loading" ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/85 px-6 text-center text-sm font-semibold text-slate-700"
          >
            Loading commute map…
          </div>
        ) : null}

        {status === "error" ? (
          <div
            role="alert"
            className="absolute right-4 bottom-4 left-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 shadow-sm"
          >
            The map service is unavailable. You can still search using the
            curated location fields above.
          </div>
        ) : null}

        {status === "ready" && locationStatus === "loading" ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-4 left-4 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-md"
          >
            Loading supported locations…
          </div>
        ) : null}

        {status === "ready" && locationStatus === "ready" ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-4 left-4 rounded-full bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-md"
          >
            {locationCount} supported{" "}
            {locationCount === 1 ? "location" : "locations"}
          </div>
        ) : null}

        {status === "ready" && locationStatus === "empty" ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute right-4 bottom-4 left-4 rounded-xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-700 shadow-sm"
          >
            No active supported locations are available yet.
          </div>
        ) : null}

        {status === "ready" && locationStatus === "error" ? (
          <div
            role="alert"
            className="absolute right-4 bottom-4 left-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm"
          >
            Supported locations could not be loaded. Try refreshing the page.
          </div>
        ) : null}
      </div>
    </div>
  );
}
