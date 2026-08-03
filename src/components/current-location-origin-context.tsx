"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { OriginSelection } from "@/lib/geolocation/origin-selection";

type CurrentLocationOriginUpdate = {
  origin: Extract<OriginSelection, { type: "CURRENT_LOCATION" }>;
  sequence: number;
};

type CurrentLocationOriginContextValue = {
  currentLocationOrigin: CurrentLocationOriginUpdate | null;
  selectCurrentLocation: (coordinates: {
    latitude: number;
    longitude: number;
  }) => void;
};

const CurrentLocationOriginContext =
  createContext<CurrentLocationOriginContextValue | null>(null);

export function CurrentLocationOriginProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [currentLocationOrigin, setCurrentLocationOrigin] =
    useState<CurrentLocationOriginUpdate | null>(null);

  const selectCurrentLocation = useCallback(
    (coordinates: { latitude: number; longitude: number }) => {
      setCurrentLocationOrigin((current) => ({
        origin: {
          type: "CURRENT_LOCATION",
          ...coordinates,
        },
        sequence: (current?.sequence ?? 0) + 1,
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({ currentLocationOrigin, selectCurrentLocation }),
    [currentLocationOrigin, selectCurrentLocation],
  );

  return (
    <CurrentLocationOriginContext.Provider value={value}>
      {children}
    </CurrentLocationOriginContext.Provider>
  );
}

export function useCurrentLocationOrigin() {
  const context = useContext(CurrentLocationOriginContext);

  if (!context) {
    throw new Error(
      "useCurrentLocationOrigin must be used inside CurrentLocationOriginProvider.",
    );
  }

  return context;
}
