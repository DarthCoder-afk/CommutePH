"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import * as maplibregl from "maplibre-gl";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import type { LocationOption } from "@/components/location-search-input";
import { publicMapStyle } from "@/config/map-style-url";
import {
  geolocationStatusMessages,
  isGeolocationFailure,
} from "@/lib/geolocation/geolocation-status";
import { formatApproximateDistance } from "@/lib/geolocation/format-distance";

type MapStatus = "loading" | "ready" | "error";
type LocationStatus = "loading" | "ready" | "empty" | "error";

const initialCenter: [number, number] = [121.0244, 14.5674];
const selectedJourneyLayerIds = {
  initialWalking: "selected-journey-initial-walking",
  publishedWalking: "selected-journey-published-walking",
  publishedTransit: "selected-journey-published-transit",
} as const;
const selectedJourneySourceIds = {
  initialWalking: "selected-journey-initial-walking-source",
  publishedPaths: "selected-journey-published-paths-source",
} as const;

const journeyMarkerLabels = {
  origin: "Transit origin",
  pickup: "Pickup point",
  transfer: "Transfer point",
  dropoff: "Drop-off point",
  destination: "Destination",
} as const;

function getJourneyMarkerColor(roles: Array<keyof typeof journeyMarkerLabels>) {
  if (roles.includes("pickup")) {
    return "#7e22ce";
  }

  if (roles.includes("transfer")) {
    return "#b45309";
  }

  if (roles.includes("dropoff")) {
    return "#be123c";
  }

  if (roles.includes("destination")) {
    return "#047857";
  }

  return "#1d4ed8";
}

function removeSelectedJourneyLayers(map: maplibregl.Map) {
  for (const layerId of Object.values(selectedJourneyLayerIds)) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  for (const sourceId of Object.values(selectedJourneySourceIds)) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }
}

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

function createSearchedPlaceMarkerElement(role: "origin" | "destination") {
  const marker = document.createElement("button");

  marker.type = "button";
  marker.className =
    role === "origin"
      ? "size-11 cursor-pointer rounded-full border-[3px] border-white bg-violet-700 shadow-lg ring-4 ring-violet-400/35 focus:ring-4 focus:ring-violet-300 focus:outline-none"
      : "size-11 cursor-pointer rounded-full border-[3px] border-white bg-rose-700 shadow-lg ring-4 ring-rose-400/35 focus:ring-4 focus:ring-rose-300 focus:outline-none";

  return marker;
}

function createSearchedPlacePopupContent({
  name,
  label,
  role,
}: {
  name: string;
  label: string;
  role: "origin" | "destination";
}) {
  const content = document.createElement("div");
  const title = document.createElement("strong");
  const address = document.createElement("span");
  const status = document.createElement("span");

  title.className = "block text-sm text-slate-950";
  title.textContent = name;
  address.className = "mt-1 block text-xs text-slate-600";
  address.textContent = label;
  status.className = "mt-2 block text-xs font-semibold text-violet-800";
  status.textContent = `Searched ${role} · Not a verified commute point`;
  content.append(title, address, status);

  return content;
}

function createLocationPopupContent(properties: Record<string, unknown>) {
  const content = document.createElement("div");
  const name = document.createElement("strong");
  const place = document.createElement("span");
  const pickupDetails = document.createElement("span");
  const journeyDetails = document.createElement("span");

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

  if (typeof properties.pickupDistanceMeters === "number") {
    pickupDetails.className = "mt-2 block text-xs font-semibold text-amber-800";
    pickupDetails.textContent =
      (properties.isSelectedPickup
        ? "Selected pickup · "
        : "Nearby pickup · ") +
      formatApproximateDistance(properties.pickupDistanceMeters);
    content.append(pickupDetails);
  }

  if (typeof properties.verifiedJourneyCount === "number") {
    journeyDetails.className = "mt-1 block text-xs font-semibold text-blue-800";
    journeyDetails.textContent = `${properties.verifiedJourneyCount} verified ${
      properties.verifiedJourneyCount === 1 ? "journey" : "journeys"
    } to the destination`;
    content.append(journeyDetails);
  } else if (properties.journeyUnavailable === true) {
    journeyDetails.className =
      "mt-1 block text-xs font-semibold text-slate-600";
    journeyDetails.textContent = "No verified journey to the destination";
    content.append(journeyDetails);
  }

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
    "relative flex size-10 cursor-pointer items-center justify-center rounded-full focus:ring-4 focus:ring-sky-300 focus:outline-none";

  pulse.setAttribute("aria-hidden", "true");
  pulse.className =
    "pointer-events-none absolute size-10 animate-ping rounded-full bg-sky-500/35";

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
  description.textContent =
    "Used as your journey origin for this page and not saved.";

  content.append(title, description);

  return content;
}

export function CommuteMap() {
  const {
    activeSupportedLocations,
    currentPosition,
    geolocationStatus,
    locateOnMap,
    nearbyPickupCandidates,
    pickupJourneyMatches,
    pickupJourneySearchStatus,
    selectedJourneyDetailStatus,
    selectedDestinationPlace,
    selectedCurrentLocationJourneyMap,
    selectedCurrentLocationJourneyOption,
    selectedOriginPlace,
    selectedPickupCandidate,
    selectedSearchJourneyPreviewMap,
    selectPickupCandidate,
    supportedLocationsStatus,
  } = useCurrentLocationOrigin();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const renderedLocationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const searchedPlaceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const selectedJourneyMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [selectedJourneyRenderFailed, setSelectedJourneyRenderFailed] =
    useState(false);
  const renderableLocations = useMemo(
    () => activeSupportedLocations.filter(isRenderableLocation),
    [activeSupportedLocations],
  );
  const nearbyPickupByLocationId = useMemo(
    () =>
      new Map(
        nearbyPickupCandidates.map((candidate) => [
          candidate.location.id,
          candidate,
        ]),
      ),
    [nearbyPickupCandidates],
  );
  const pickupJourneyMatchByLocationId = useMemo(
    () =>
      new Map(
        pickupJourneyMatches.map((match) => [
          match.candidate.location.id,
          match,
        ]),
      ),
    [pickupJourneyMatches],
  );
  const locationCount = renderableLocations.length;
  const locationStatus: LocationStatus =
    supportedLocationsStatus === "loading"
      ? "loading"
      : supportedLocationsStatus === "error"
        ? "error"
        : locationCount > 0
          ? "ready"
          : "empty";

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

    const handleMapReady = () => {
      markReady();
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

      currentLocationMarkerRef.current?.remove();
      currentLocationMarkerRef.current = null;
      searchedPlaceMarkersRef.current = [];
      selectedJourneyMarkersRef.current = [];
      mapRef.current = null;

      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }

      mapInstance?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    for (const marker of renderedLocationMarkersRef.current) {
      marker.remove();
    }

    renderedLocationMarkersRef.current = [];

    if (!map || status !== "ready" || renderableLocations.length === 0) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    for (const location of renderableLocations) {
      const coordinates: [number, number] = [
        location.longitude,
        location.latitude,
      ];
      const markerElement = document.createElement("button");
      const pickupCandidate = nearbyPickupByLocationId.get(location.id);
      const pickupJourneyMatch = pickupJourneyMatchByLocationId.get(
        location.id,
      );
      const journeyUnavailable =
        Boolean(pickupCandidate) &&
        (pickupJourneySearchStatus === "empty" ||
          (pickupJourneySearchStatus === "ready" && !pickupJourneyMatch));
      const isSelectedPickup =
        selectedPickupCandidate?.location.id === location.id;

      markerElement.type = "button";
      markerElement.title = location.name;
      markerElement.setAttribute(
        "aria-label",
        `Supported location: ${location.name}`,
      );
      if (pickupCandidate) {
        markerElement.setAttribute(
          "aria-label",
          (isSelectedPickup
            ? "Selected pickup point: "
            : journeyUnavailable
              ? "Pickup point without a verified journey: "
              : "Nearby pickup point: ") + location.name,
        );
      }

      markerElement.className = isSelectedPickup
        ? "size-11 cursor-pointer rounded-full border-[3px] border-white bg-emerald-700 shadow-lg ring-4 ring-emerald-400/40 transition-colors hover:bg-emerald-900 focus:ring-4 focus:ring-emerald-300 focus:outline-none"
        : pickupCandidate && journeyUnavailable
          ? "size-10 cursor-default rounded-full border-[3px] border-white bg-slate-400 shadow-lg ring-4 ring-slate-300/40 focus:ring-4 focus:ring-slate-300 focus:outline-none"
          : pickupCandidate
            ? "size-10 cursor-pointer rounded-full border-[3px] border-white bg-amber-500 shadow-lg ring-4 ring-amber-400/35 transition-colors hover:bg-amber-700 focus:ring-4 focus:ring-amber-300 focus:outline-none"
            : "size-10 cursor-pointer rounded-full border-[3px] border-white bg-blue-700 shadow-lg ring-2 ring-blue-700/25 transition-colors hover:bg-blue-900 focus:ring-4 focus:ring-blue-300 focus:outline-none";

      if (pickupCandidate && !journeyUnavailable) {
        markerElement.addEventListener("click", () => {
          selectPickupCandidate(location.id);
        });
      }

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 18,
      }).setDOMContent(
        createLocationPopupContent({
          name: location.name,
          area: location.area,
          city: location.city,
          pickupDistanceMeters: pickupCandidate?.distanceMeters,
          isSelectedPickup,
          verifiedJourneyCount: pickupJourneyMatch?.journeys.length,
          journeyUnavailable,
        }),
      );

      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map);

      renderedLocationMarkersRef.current.push(marker);
      bounds.extend(coordinates);
    }

    if (!currentPosition) {
      map.fitBounds(bounds, {
        padding: 64,
        maxZoom: 12,
        duration: 0,
      });
    }

    return () => {
      for (const marker of renderedLocationMarkersRef.current) {
        marker.remove();
      }

      renderedLocationMarkersRef.current = [];
    };
  }, [
    currentPosition,
    nearbyPickupByLocationId,
    pickupJourneyMatchByLocationId,
    pickupJourneySearchStatus,
    renderableLocations,
    selectedPickupCandidate,
    selectPickupCandidate,
    status,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    for (const marker of searchedPlaceMarkersRef.current) {
      marker.remove();
    }

    searchedPlaceMarkersRef.current = [];

    if (!map || status !== "ready") {
      return;
    }

    const selectedPlaces = [
      selectedOriginPlace
        ? { place: selectedOriginPlace, role: "origin" as const }
        : null,
      selectedDestinationPlace
        ? { place: selectedDestinationPlace, role: "destination" as const }
        : null,
    ].filter((entry) => entry !== null);

    if (selectedPlaces.length === 0) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    for (const { place, role } of selectedPlaces) {
      const coordinates: [number, number] = [place.longitude, place.latitude];
      const markerElement = createSearchedPlaceMarkerElement(role);
      const roleLabel = role === "origin" ? "Starting place" : "Destination";

      markerElement.title = `${roleLabel}: ${place.name}`;
      markerElement.setAttribute(
        "aria-label",
        `${roleLabel}: ${place.name}. Not a verified commute point.`,
      );

      const marker = new maplibregl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(coordinates)
        .setPopup(
          new maplibregl.Popup({ offset: 22 }).setDOMContent(
            createSearchedPlacePopupContent({
              name: place.name,
              label: place.label,
              role,
            }),
          ),
        )
        .addTo(map);

      searchedPlaceMarkersRef.current.push(marker);
      bounds.extend(coordinates);
    }

    if (selectedPlaces.length === 1) {
      const selectedPlace = selectedPlaces[0]?.place;

      if (selectedPlace) {
        map.jumpTo({
          center: [selectedPlace.longitude, selectedPlace.latitude],
          zoom: 14,
        });
      }
    } else {
      map.fitBounds(bounds, {
        padding: 72,
        maxZoom: 14,
        duration: 0,
      });
    }

    return () => {
      for (const marker of searchedPlaceMarkersRef.current) {
        marker.remove();
      }

      searchedPlaceMarkersRef.current = [];
    };
  }, [selectedDestinationPlace, selectedOriginPlace, status]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || status !== "ready" || !currentPosition) {
      return;
    }

    const coordinates: [number, number] = [
      currentPosition.coordinates.longitude,
      currentPosition.coordinates.latitude,
    ];

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

    if (nearbyPickupCandidates.length > 0) {
      const bounds = new maplibregl.LngLatBounds(coordinates, coordinates);

      for (const candidate of nearbyPickupCandidates) {
        bounds.extend([
          candidate.location.longitude,
          candidate.location.latitude,
        ]);
      }

      map.fitBounds(bounds, {
        padding: 72,
        maxZoom: 14,
        duration: 0,
      });
    } else {
      map.jumpTo({
        center: coordinates,
        zoom: Math.max(map.getZoom(), 14),
      });
    }
  }, [currentPosition, nearbyPickupCandidates, status]);

  useEffect(() => {
    const map = mapRef.current;
    let disposed = false;

    for (const marker of selectedJourneyMarkersRef.current) {
      marker.remove();
    }

    selectedJourneyMarkersRef.current = [];
    queueMicrotask(() => {
      if (!disposed) {
        setSelectedJourneyRenderFailed(false);
      }
    });

    if (!map || status !== "ready") {
      return;
    }

    const interactivePathLayerIds: string[] = [];
    const handlePathClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const kind = feature?.properties?.kind;
      const popupContent = document.createElement("div");
      const popupTitle = document.createElement("strong");
      const popupDescription = document.createElement("span");

      popupTitle.className = "block text-sm text-slate-950";
      popupTitle.textContent =
        kind === "walking" ? "Walking connector" : "Transit connector";
      popupDescription.className = "mt-1 block text-xs text-slate-600";
      popupDescription.textContent = selectedSearchJourneyPreviewMap
        ? "Schematic development line · Not a verified street route"
        : "Verified journey path";
      popupContent.append(popupTitle, popupDescription);

      new maplibregl.Popup({ offset: 12 })
        .setLngLat(event.lngLat)
        .setDOMContent(popupContent)
        .addTo(map);
    };
    const showPathPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const hidePathPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    removeSelectedJourneyLayers(map);

    if (
      !selectedCurrentLocationJourneyMap &&
      !selectedSearchJourneyPreviewMap
    ) {
      return;
    }

    try {
      const publishedMap = selectedCurrentLocationJourneyMap
        ? selectedCurrentLocationJourneyMap.publishedMap
        : selectedSearchJourneyPreviewMap;

      if (!publishedMap) {
        return;
      }

      const boundsCoordinates = selectedCurrentLocationJourneyMap
        ? selectedCurrentLocationJourneyMap.boundsCoordinates
        : [
            ...publishedMap.markers.features.map(
              (feature) => feature.geometry.coordinates,
            ),
            ...publishedMap.paths.features.flatMap(
              (feature) => feature.geometry.coordinates,
            ),
          ];

      if (selectedCurrentLocationJourneyMap) {
        map.addSource(selectedJourneySourceIds.initialWalking, {
          type: "geojson",
          data: selectedCurrentLocationJourneyMap.initialWalkingPath,
        });
        map.addLayer({
          id: selectedJourneyLayerIds.initialWalking,
          type: "line",
          source: selectedJourneySourceIds.initialWalking,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#d97706",
            "line-width": 5,
            "line-opacity": 0.95,
            "line-dasharray": [1, 2],
          },
        });
      }

      if (publishedMap.paths.features.length > 0) {
        map.addSource(selectedJourneySourceIds.publishedPaths, {
          type: "geojson",
          data: publishedMap.paths,
        });
        map.addLayer({
          id: selectedJourneyLayerIds.publishedTransit,
          type: "line",
          source: selectedJourneySourceIds.publishedPaths,
          filter: ["==", ["get", "kind"], "transit"],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#2563eb",
            "line-width": 6,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: selectedJourneyLayerIds.publishedWalking,
          type: "line",
          source: selectedJourneySourceIds.publishedPaths,
          filter: ["==", ["get", "kind"], "walking"],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#475569",
            "line-width": 4,
            "line-opacity": 0.95,
            "line-dasharray": [2, 2],
          },
        });

        interactivePathLayerIds.push(
          selectedJourneyLayerIds.publishedTransit,
          selectedJourneyLayerIds.publishedWalking,
        );

        for (const layerId of interactivePathLayerIds) {
          map.on("click", layerId, handlePathClick);
          map.on("mouseenter", layerId, showPathPointer);
          map.on("mouseleave", layerId, hidePathPointer);
        }
      }

      for (const feature of publishedMap.markers.features) {
        const roles = feature.properties.roles;
        const rolesLabel = roles
          .map((role) => journeyMarkerLabels[role])
          .join(", ");
        const markerElement = document.createElement("button");

        markerElement.type = "button";
        markerElement.title = `${feature.properties.name}: ${rolesLabel}`;
        markerElement.setAttribute(
          "aria-label",
          `Journey stop ${feature.properties.sequence}: ${feature.properties.name}: ${rolesLabel}`,
        );
        markerElement.textContent = String(feature.properties.sequence);
        markerElement.style.width = "2.5rem";
        markerElement.style.height = "2.5rem";
        markerElement.style.borderRadius = "9999px";
        markerElement.style.border = "3px solid white";
        markerElement.style.backgroundColor = getJourneyMarkerColor(roles);
        markerElement.style.boxShadow = "0 2px 8px rgb(15 23 42 / 40%)";
        markerElement.style.color = "white";
        markerElement.style.fontSize = "0.75rem";
        markerElement.style.fontWeight = "700";
        markerElement.style.lineHeight = "1";
        markerElement.style.cursor = "pointer";

        const popupContent = document.createElement("div");
        const popupTitle = document.createElement("strong");
        const popupRoles = document.createElement("span");
        const popupVerification = document.createElement("span");

        popupTitle.className = "block text-sm text-slate-950";
        popupTitle.textContent = feature.properties.name;
        popupRoles.className = "mt-1 block text-xs text-slate-600";
        popupRoles.textContent = rolesLabel;
        popupContent.append(popupTitle, popupRoles);

        if (selectedSearchJourneyPreviewMap) {
          popupVerification.className =
            "mt-2 block text-xs font-semibold text-amber-800";
          popupVerification.textContent =
            "Unverified local development preview";
          popupContent.append(popupVerification);
        }

        const marker = new maplibregl.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat(feature.geometry.coordinates)
          .setPopup(
            new maplibregl.Popup({ offset: 20 }).setDOMContent(popupContent),
          )
          .addTo(map);

        selectedJourneyMarkersRef.current.push(marker);
      }

      const [firstCoordinate, ...remainingCoordinates] = boundsCoordinates;

      if (firstCoordinate) {
        const bounds = new maplibregl.LngLatBounds(
          firstCoordinate,
          firstCoordinate,
        );

        for (const coordinate of remainingCoordinates) {
          bounds.extend(coordinate);
        }

        map.fitBounds(bounds, {
          padding: 72,
          maxZoom: 15,
          duration: 0,
        });
      }
    } catch (error) {
      console.error("Unable to render the selected journey on the map:", error);
      queueMicrotask(() => {
        if (!disposed) {
          setSelectedJourneyRenderFailed(true);
        }
      });
    }

    return () => {
      disposed = true;

      for (const marker of selectedJourneyMarkersRef.current) {
        marker.remove();
      }

      selectedJourneyMarkersRef.current = [];

      if (mapRef.current === map) {
        for (const layerId of interactivePathLayerIds) {
          map.off("click", layerId, handlePathClick);
          map.off("mouseenter", layerId, showPathPointer);
          map.off("mouseleave", layerId, hidePathPointer);
        }

        map.getCanvas().style.cursor = "";
        removeSelectedJourneyLayers(map);
      }
    };
  }, [
    selectedCurrentLocationJourneyMap,
    selectedSearchJourneyPreviewMap,
    status,
  ]);

  return (
    <div className="space-y-3">
      <div
        id="commute-map"
        role="region"
        aria-label="Interactive commute map"
        tabIndex={-1}
        className="relative scroll-mt-20 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-lg shadow-slate-900/5 focus:ring-4 focus:ring-blue-200 focus:outline-none"
      >
        <div ref={containerRef} className="h-80 w-full sm:h-[28rem]" />

        <button
          type="button"
          aria-label={
            geolocationStatus === "success"
              ? "Update current location"
              : "Use current location"
          }
          title={
            geolocationStatus === "success"
              ? "Update current location"
              : "Use current location"
          }
          aria-describedby="current-location-status"
          disabled={status !== "ready" || geolocationStatus === "requesting"}
          onClick={locateOnMap}
          className="absolute top-4 left-4 z-10 flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-800 shadow-md transition-colors hover:bg-blue-50 focus:ring-4 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {geolocationStatus === "requesting" ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <LocateFixed aria-hidden="true" className="size-5" />
          )}
        </button>

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
            className="pointer-events-none absolute top-4 left-18 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-md"
          >
            Loading supported locations…
          </div>
        ) : null}

        {status === "ready" && locationStatus === "ready" ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute top-4 left-18 rounded-full bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-md"
          >
            {locationCount} supported{" "}
            {locationCount === 1 ? "location" : "locations"}
          </div>
        ) : null}

        {status === "ready" && selectedSearchJourneyPreviewMap ? (
          <div
            role="status"
            className="pointer-events-none absolute top-16 left-4 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-950 shadow-md"
          >
            Showing unverified draft journey stops
          </div>
        ) : null}

        {status === "ready" && nearbyPickupCandidates.length > 0 ? (
          <div className="pointer-events-none absolute bottom-8 left-4 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-md">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 rounded-full bg-amber-500"
              />
              Nearby pickup
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 rounded-full bg-emerald-700"
              />
              Selected pickup
            </span>
            {pickupJourneySearchStatus === "empty" ||
            pickupJourneySearchStatus === "ready" ? (
              <span className="mt-1 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full bg-slate-400"
                />
                No verified journey
              </span>
            ) : null}
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
          ? "Current location is displayed on the map. Your precise position is kept on this page and is not saved."
          : geolocationStatusMessages[geolocationStatus]}
      </p>

      {selectedSearchJourneyPreviewMap ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
        >
          Numbered markers and schematic lines show the selected local
          development preview. Solid blue connects the draft transit stops;
          dotted gray connects walking endpoints. They are not street-following
          or field-verified routes.
        </p>
      ) : null}

      {locationStatus === "ready" ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-slate-800 focus:outline-none">
            Locations shown on the map
          </summary>

          <ul className="mt-3 space-y-3">
            {renderableLocations.map((location) => {
              const pickupCandidate = nearbyPickupByLocationId.get(location.id);
              const pickupJourneyMatch = pickupJourneyMatchByLocationId.get(
                location.id,
              );
              const journeyUnavailable =
                Boolean(pickupCandidate) &&
                (pickupJourneySearchStatus === "empty" ||
                  (pickupJourneySearchStatus === "ready" &&
                    !pickupJourneyMatch));
              const isSelectedPickup =
                selectedPickupCandidate?.location.id === location.id;

              return (
                <li
                  key={location.id}
                  className="flex flex-col gap-1 border-t border-slate-100 pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {location.name}
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      {[location.area, location.city]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>

                  <span className="text-sm font-medium text-slate-600 sm:text-right">
                    {isSelectedPickup
                      ? "Selected pickup point"
                      : journeyUnavailable
                        ? "No verified journey to the destination"
                        : pickupJourneyMatch
                          ? `${pickupJourneyMatch.journeys.length} verified ${
                              pickupJourneyMatch.journeys.length === 1
                                ? "journey"
                                : "journeys"
                            } to the destination`
                          : pickupCandidate
                            ? `Nearby pickup · ${formatApproximateDistance(
                                pickupCandidate.distanceMeters,
                              )}`
                            : "Supported location"}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {selectedCurrentLocationJourneyOption ? (
        <div
          role={
            selectedJourneyDetailStatus === "error" ||
            selectedJourneyRenderFailed
              ? "alert"
              : "status"
          }
          aria-live="polite"
          className={`rounded-xl border p-3 text-sm leading-6 ${
            selectedJourneyDetailStatus === "error" ||
            selectedJourneyRenderFailed
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-blue-200 bg-blue-50 text-blue-950"
          }`}
        >
          {selectedJourneyDetailStatus === "loading"
            ? "Loading the selected verified journey map…"
            : selectedJourneyDetailStatus === "error" ||
                selectedJourneyRenderFailed
              ? "The selected journey route could not be displayed. Its text directions remain available."
              : `Showing ${selectedCurrentLocationJourneyOption.publishedJourney.title}. The amber dotted line is an estimated initial walk; blue and gray paths come from verified journey data.`}
        </div>
      ) : null}
    </div>
  );
}
