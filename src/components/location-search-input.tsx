"use client";

import { useEffect, useState, type KeyboardEvent } from "react";

export type LocationOption = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  city: string;
  area: string | null;
  longitude: number;
  latitude: number;
};

type LocationSearchResponse = {
  data: LocationOption[];
};

type SearchStatus = "idle" | "loading" | "success" | "error";

type LocationSearchInputProps = {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  query: string;
  value: LocationOption | null;
  onQueryChange: (query: string) => void;
  onSelectionChange: (location: LocationOption | null) => void;
};

export function LocationSearchInput({
  id,
  name,
  label,
  placeholder = "Search locations",
  query,
  value,
  onQueryChange,
  onSelectionChange,
}: LocationSearchInputProps) {
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = `${id}-listbox`;
  const statusId = `${id}-status`;

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (value && query === value.name) {
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

        const response = await fetch(
          `/api/locations?${searchParams.toString()}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Location search failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as LocationSearchResponse;

        setOptions(payload.data);
        setStatus("success");
        setActiveIndex(payload.data.length > 0 ? 0 : -1);
        setIsOpen(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to search locations:", error);

        setOptions([]);
        setStatus("error");
        setActiveIndex(-1);
        setIsOpen(true);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, value]);

  function selectLocation(location: LocationOption) {
    onQueryChange(location.name);
    setOptions([]);
    setStatus("idle");
    setActiveIndex(-1);
    setIsOpen(false);
    onSelectionChange(location);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || options.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex((currentIndex) =>
        currentIndex >= options.length - 1 ? 0 : currentIndex + 1,
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveIndex((currentIndex) =>
        currentIndex <= 0 ? options.length - 1 : currentIndex - 1,
      );

      return;
    }

    if (event.key === "Enter") {
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
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          activeOption ? `${listboxId}-${activeOption.id}` : undefined
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
          if (query.trim().length >= 2 && status !== "idle") {
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

      <input type="hidden" name={name} value={value?.slug ?? ""} />

      <div id={statusId} className="sr-only" role="status" aria-live="polite">
        {status === "loading" ? "Searching locations." : null}

        {status === "success" && options.length === 0
          ? "No active locations found."
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
          {status === "loading" ? (
            <li className="px-3 py-3 text-sm text-slate-500">Searching…</li>
          ) : null}

          {status === "error" ? (
            <li className="px-3 py-3 text-sm text-red-700">
              We couldn’t search locations. Please try again.
            </li>
          ) : null}

          {status === "success" && options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              No active locations found.
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
                    <span className="block font-medium">{option.name}</span>

                    <span className="mt-1 block text-sm text-slate-500">
                      {option.area
                        ? `${option.area}, ${option.city}`
                        : option.city}
                    </span>
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}

      {value ? (
        <span className="sr-only" role="status" aria-live="polite">
          Selected: {value.name}
        </span>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          Enter at least two characters, then select a location.
        </p>
      )}
    </div>
  );
}
