"use client";

import { MapPinCheck } from "lucide-react";

import { formatApproximateDistance } from "@/lib/geolocation/format-distance";
import type { NearbySupportedLocation } from "@/lib/locations/nearby-supported-location";

type NearbySupportedLocationSelectorProps = {
  candidates: readonly NearbySupportedLocation[];
  fieldName: string;
  label: string;
  radiusMeters: number;
  selectedLocationId: string | null;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  onSelectionChange: (locationId: string) => void;
};

export function NearbySupportedLocationSelector({
  candidates,
  fieldName,
  label,
  radiusMeters,
  selectedLocationId,
  status,
  onSelectionChange,
}: NearbySupportedLocationSelectorProps) {
  if (status === "idle") {
    return null;
  }

  if (status === "loading") {
    return (
      <p role="status" className="text-sm leading-6 text-blue-700">
        Finding nearby supported commute points…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p role="alert" className="text-sm leading-6 text-red-700">
        Nearby supported commute points could not be loaded. Try selecting the
        place again.
      </p>
    );
  }

  if (status === "empty") {
    return (
      <p role="status" className="text-sm leading-6 text-amber-800">
        No supported commute point was found within {radiusMeters / 1_000} km of
        this place.
      </p>
    );
  }

  return (
    <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <legend className="px-1 text-sm font-semibold text-emerald-950">
        {label}
      </legend>

      <p className="mt-1 text-xs leading-5 text-emerald-800">
        The nearest point is selected automatically. Distance is straight-line
        proximity, not a walking route.
      </p>

      <div className="mt-2 space-y-2">
        {candidates.map((candidate, index) => {
          const isSelected = candidate.location.id === selectedLocationId;

          return (
            <label
              key={candidate.location.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                isSelected
                  ? "border-emerald-500 bg-white ring-2 ring-emerald-100"
                  : "border-emerald-100 bg-white/70 hover:border-emerald-300"
              }`}
            >
              <input
                type="radio"
                name={fieldName}
                value={candidate.location.id}
                checked={isSelected}
                onChange={() => {
                  onSelectionChange(candidate.location.id);
                }}
                className="mt-1 size-4 accent-emerald-700"
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <MapPinCheck
                    aria-hidden="true"
                    className="size-4 text-emerald-700"
                  />
                  <span className="font-semibold text-slate-950">
                    {candidate.location.name}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Supported commute point
                  </span>
                  {index === 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      Nearest
                    </span>
                  ) : null}
                </span>

                <span className="mt-1 block text-sm text-slate-600">
                  {candidate.location.area
                    ? `${candidate.location.area}, ${candidate.location.city}`
                    : candidate.location.city}
                </span>

                <span className="mt-1 block text-xs font-medium text-slate-500">
                  {formatApproximateDistance(candidate.distanceMeters)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
