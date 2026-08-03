"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";

import { publicMapStyle } from "@/config/map-style-url";

type MapStatus = "loading" | "ready" | "error";

const initialCenter: [number, number] = [121.0244, 14.5674];

export function CommuteMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MapStatus>("loading");

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    let isReady = false;
    let mapInstance: maplibregl.Map | null = null;
    let loadingTimeout: ReturnType<typeof setTimeout> | null = null;

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
      mapInstance.once("load", markReady);
      mapInstance.once("idle", markReady);

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
          markReady();
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

      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }

      mapInstance?.remove();
    };
  }, []);

  return (
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
          The map service is unavailable. You can still search using the curated
          location fields above.
        </div>
      ) : null}
    </div>
  );
}
