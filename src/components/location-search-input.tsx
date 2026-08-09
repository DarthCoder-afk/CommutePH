"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

import {
  isPlaceSearchOption,
  isSupportedLocationOption,
  type PlaceSearchOption,
  type SearchLocationOption,
  type SupportedLocationOption,
} from "@/lib/locations/search-location-option";

export type LocationOption = SupportedLocationOption;
export type { PlaceSearchOption, SearchLocationOption };

type LocationSearchResponse = {
  data: LocationOption[];
};

type PlaceSearchResponse = {
  data: PlaceSearchOption[];
};

type SearchStatus = "idle" | "loading" | "success" | "error";

type LocationSearchActionOption = {
  label: string;
  description: string;
  disabled?: boolean;
  onSelect: () => void;
};

const actionOptionIndex = -2;

type LocationSearchInputProps = {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  query: string;
  value: SearchLocationOption | null;
  selectedLabel?: string | null;
  actionOption?: LocationSearchActionOption;
  onQueryChange: (query: string) => void;
  onSelectionChange: (location: SearchLocationOption | null) => void;
};

export function LocationSearchInput({
  id,
  name,
  label,
  placeholder = "Search locations",
  query,
  value,
  selectedLabel = value?.name ?? null,
  actionOption,
  onQueryChange,
  onSelectionChange,
}: LocationSearchInputProps) {
  const [options, setOptions] = useState<SearchLocationOption[]>([]);
  const [isPlaceSearchAvailable, setIsPlaceSearchAvailable] = useState(true);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const hasActionOption = Boolean(actionOption);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (selectedLabel && query === selectedLabel) {
      return;
    }

    if (normalizedQuery.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(async () => {
      setStatus("loading");
      setIsOpen(true);

      try {
        const searchParams = new URLSearchParams({
          q: normalizedQuery,
        });

        const [locationResponse, placeResponse] = await Promise.all([
          fetch(`/api/locations?${searchParams.toString()}`, {
            signal: controller.signal,
          }),
          fetch(`/api/places?${searchParams.toString()}`, {
            signal: controller.signal,
          }),
        ]);

        if (!locationResponse.ok) {
          throw new Error(
            `Location search failed with status ${locationResponse.status}.`,
          );
        }

        const locationPayload =
          (await locationResponse.json()) as LocationSearchResponse;
        let placeOptions: PlaceSearchOption[] = [];

        if (placeResponse.ok) {
          const placePayload =
            (await placeResponse.json()) as PlaceSearchResponse;
          placeOptions = Array.isArray(placePayload.data)
            ? placePayload.data
            : [];
          setIsPlaceSearchAvailable(true);
        } else {
          setIsPlaceSearchAvailable(false);
        }

        const combinedOptions = [
          ...locationPayload.data,
          ...placeOptions.filter(
            (place) =>
              !locationPayload.data.some(
                (location) =>
                  location.name.toLocaleLowerCase() ===
                  place.name.toLocaleLowerCase(),
              ),
          ),
        ];

        setOptions(combinedOptions);
        setStatus("success");
        setActiveIndex(
          hasActionOption
            ? actionOptionIndex
            : combinedOptions.length > 0
              ? 0
              : -1,
        );
        setIsOpen(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to search locations:", error);

        setOptions([]);
        setStatus("error");
        setActiveIndex(hasActionOption ? actionOptionIndex : -1);
        setIsOpen(true);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasActionOption, query, selectedLabel]);

  function selectLocation(location: SearchLocationOption) {
    onQueryChange(location.name);
    setOptions([]);
    setStatus("idle");
    setActiveIndex(-1);
    setIsOpen(false);
    onSelectionChange(location);
  }

  function selectActionOption() {
    if (!actionOption || actionOption.disabled) {
      return;
    }

    setIsOpen(false);
    setActiveIndex(-1);
    actionOption.onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (actionOption || (query.trim().length >= 2 && status !== "idle")) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex(
          actionOption
            ? actionOptionIndex
            : event.key === "ArrowUp"
              ? options.length - 1
              : 0,
        );
      }

      return;
    }

    if (!isOpen) {
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(hasActionOption ? actionOptionIndex : 0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(
        options.length > 0
          ? options.length - 1
          : hasActionOption
            ? actionOptionIndex
            : -1,
      );
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex((currentIndex) => {
        if (currentIndex === actionOptionIndex) {
          return options.length > 0 ? 0 : actionOptionIndex;
        }

        if (options.length === 0) {
          return hasActionOption ? actionOptionIndex : -1;
        }

        return currentIndex >= options.length - 1
          ? hasActionOption
            ? actionOptionIndex
            : 0
          : currentIndex + 1;
      });

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((currentIndex) => {
        if (currentIndex === actionOptionIndex) {
          return options.length > 0 ? options.length - 1 : actionOptionIndex;
        }

        if (currentIndex <= 0 && hasActionOption) {
          return actionOptionIndex;
        }

        return currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
      });

      return;
    }

    if (event.key === "Enter") {
      if (activeIndex === actionOptionIndex) {
        event.preventDefault();
        selectActionOption();
        return;
      }

      const activeOption = options[activeIndex];

      if (activeOption) {
        event.preventDefault();
        selectLocation(activeOption);
      }
    }
  }

  const activeOption = options[activeIndex];

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-slate-800"
      >
        {label}
      </label>

      <input
        id={id}
        type="text"
        value={query}
        placeholder={placeholder}
        maxLength={80}
        autoComplete="off"
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          activeIndex === actionOptionIndex && actionOption
            ? `${listboxId}-action`
            : activeOption
              ? `${listboxId}-${activeOption.id}`
              : undefined
        }
        aria-describedby={statusId}
        onChange={(event) => {
          onQueryChange(event.target.value);
          onSelectionChange(null);
          setOptions([]);
          setStatus("idle");
          setIsOpen(false);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (actionOption) {
            setActiveIndex(actionOptionIndex);
            setIsOpen(true);
          } else if (query.trim().length >= 2 && status !== "idle") {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
      />

      <input
        type="hidden"
        name={name}
        value={value && isSupportedLocationOption(value) ? value.slug : ""}
      />

      <div id={statusId} className="sr-only" role="status" aria-live="polite">
        {status === "loading" ? "Searching locations." : null}

        {status === "success" && options.length === 0
          ? isPlaceSearchAvailable
            ? "No supported locations or general places found."
            : "No supported locations found. General place search is unavailable."
          : null}

        {status === "success" && options.length > 0
          ? `${options.length} locations found.`
          : null}

        {status === "error" ? "Location search failed." : null}
      </div>

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          {actionOption ? (
            <li>
              <button
                id={`${listboxId}-action`}
                type="button"
                role="option"
                aria-selected={selectedLabel === actionOption.label}
                disabled={actionOption.disabled}
                tabIndex={-1}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={selectActionOption}
                className={`w-full rounded-lg px-3 py-3 text-left transition disabled:cursor-wait disabled:text-slate-500 ${
                  activeIndex === actionOptionIndex
                    ? "bg-blue-50 text-blue-950"
                    : "text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">{actionOption.label}</span>
                <span className="mt-1 block text-sm text-slate-500">
                  {actionOption.description}
                </span>
              </button>
            </li>
          ) : null}

          {status === "loading" ? (
            <li className="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">
              Searching…
            </li>
          ) : null}

          {status === "error" ? (
            <li className="px-3 py-3 text-sm text-red-700">
              We couldn’t search locations. Please try again.
            </li>
          ) : null}

          {status === "success" && options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              {isPlaceSearchAvailable
                ? "No supported locations or general places found."
                : "No supported locations found. General place search is not configured."}
            </li>
          ) : null}

          {status === "success"
            ? options.map((option, index) => (
                <li key={option.id}>
                  <button
                    id={`${listboxId}-${option.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      selectLocation(option);
                    }}
                    className={`w-full rounded-lg px-3 py-3 text-left transition ${
                      index === activeIndex
                        ? "bg-blue-50 text-blue-950"
                        : "text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{option.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isPlaceSearchOption(option)
                            ? "bg-violet-100 text-violet-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isPlaceSearchOption(option)
                          ? "Place"
                          : "Supported commute point"}
                      </span>
                    </span>

                    <span className="mt-1 block text-sm text-slate-500">
                      {isPlaceSearchOption(option)
                        ? option.label
                        : option.area
                          ? `${option.area}, ${option.city}`
                          : option.city}
                    </span>
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}

      {selectedLabel ? (
        <span className="sr-only" role="status" aria-live="polite">
          Selected: {selectedLabel}
        </span>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          Enter at least two characters, then select a location.
        </p>
      )}
    </div>
  );
}
