import React, { useState, useEffect, useRef } from 'react';

type SearchBarProps = {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  onChange: (query: string, filters: SearchFilters) => void;
  loading?: boolean;
};

export type SearchFilters = {
  location?: string;
  specialties?: string[];
  availability?: 'now' | 'weekdays' | 'weekends' | null;
  minExperience?: number;
  minRating?: number;
};

const SPECIALTIES: { label: string; value: string }[] = [
  { label: 'Elderly', value: 'elderly' },
  { label: 'Dementia', value: 'dementia' },
  { label: 'Pediatric', value: 'pediatric' },
  { label: 'Respite', value: 'respite' },
  { label: 'Disability', value: 'disability' },
];

const AVAILABILITY_OPTIONS: { label: string; value: SearchFilters['availability'] }[] = [
  { label: "Any time", value: null },
  { label: "Available now", value: "now" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
];

function SearchBar({
  initialQuery = '',
  initialFilters = {},
  onChange,
  loading = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>({
    location: initialFilters.location || '',
    specialties: initialFilters.specialties || [],
    availability: initialFilters.availability ?? null,
    minExperience: initialFilters.minExperience || 0,
    minRating: initialFilters.minRating || 0,
  });

  // For showing/hiding filter panel on mobile
  const [filtersOpen, setFiltersOpen] = useState(false);
  const initialMount = useRef(true);

  // Debounce search
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      onChange(query, filters);
      return;
    }
    const timeout = setTimeout(() => {
      onChange(query, filters);
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line
  }, [query, filters]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(f => ({
      ...f,
      location: e.target.value,
    }));
  };

  const handleSpecialtyToggle = (spec: string) => {
    setFilters(f => {
      const arr = f.specialties || [];
      if (arr.includes(spec)) {
        return { ...f, specialties: arr.filter(s => s !== spec) };
      } else {
        return { ...f, specialties: [...arr, spec] };
      }
    });
  };

  const handleAvailabilityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'now' | 'weekdays' | 'weekends' | '';
    setFilters(f => ({
      ...f,
      availability: value === '' ? null : value,
    }));
  };

  const handleExperienceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 0) v = 0;
    setFilters(f => ({ ...f, minExperience: v }));
  };

  const handleRatingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 5) v = 5;
    setFilters(f => ({ ...f, minRating: v }));
  };

  const handleResetFilters = () => {
    setFilters({
      location: '',
      specialties: [],
      availability: null,
      minExperience: 0,
      minRating: 0,
    });
  };

  return (
    <form
      className="w-full max-w-3xl mx-auto flex flex-col gap-2 px-3 py-2"
      onSubmit={e => e.preventDefault()}
      aria-label="Search caregivers"
    >
      <div className="flex flex-row items-center gap-2">
        <input
          type="search"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
          placeholder="Find caregivers by name, city, or keyword"
          value={query}
          onChange={handleQueryChange}
          aria-label="Search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="text-gray-600 hover:text-blue-700 flex items-center px-2 py-2"
          aria-label="Show filters"
          onClick={() => setFiltersOpen(f => !f)}
        >
          <svg width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Show filters</span>
        </button>
      </div>
      <div
        className={`transition-[max-height] duration-300 overflow-hidden ${
          filtersOpen ? 'max-h-[2000px] pb-2 mt-1' : 'max-h-0'
        } bg-gray-50 rounded-md`}
        data-testid="advanced-filters"
      >
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 px-3 py-3">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label htmlFor="location-input" className="text-xs font-medium text-gray-500">
              Location
            </label>
            <input
              id="location-input"
              type="text"
              className="border border-gray-300 rounded px-2 py-1"
              value={filters.location}
              onChange={handleLocationChange}
              placeholder="e.g. Austin, TX"
              autoCapitalize="on"
              autoCorrect="on"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[150px]">
            <label className="text-xs font-medium text-gray-500">Specialties</label>
            <div className="flex flex-wrap gap-1">
              {SPECIALTIES.map(spec => (
                <label
                  key={spec.value}
                  className={`px-2 py-1 rounded text-sm cursor-pointer ${
                    filters.specialties && filters.specialties.includes(spec.value)
                      ? 'bg-blue-100 border border-blue-400 text-blue-800'
                      : 'bg-white border border-gray-300 text-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    value={spec.value}
                    checked={!!filters.specialties?.includes(spec.value)}
                    onChange={() => handleSpecialtyToggle(spec.value)}
                    className="hidden"
                  />
                  {spec.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label htmlFor="availability-select" className="text-xs font-medium text-gray-500">
              Availability
            </label>
            <select
              id="availability-select"
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={filters.availability ?? ''}
              onChange={handleAvailabilityChange}
            >
              {AVAILABILITY_OPTIONS.map(opt => (
                <option key={opt.value ?? 'any'} value={opt.value ?? ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[100px]">
            <label htmlFor="experience-input" className="text-xs font-medium text-gray-500">
              Min&nbsp;Experience
            </label>
            <div className="flex flex-row gap-1 items-center">
              <input
                id="experience-input"
                type="number"
                min={0}
                step={1}
                value={filters.minExperience || ''}
                onChange={handleExperienceChange}
                placeholder="0"
                className="w-14 border border-gray-300 rounded px-1 py-1 text-sm"
              />
              <span className="text-xs text-gray-700">yrs</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-[100px]">
            <label htmlFor="rating-input" className="text-xs font-medium text-gray-500">
              Min&nbsp;Rating
            </label>
            <div className="flex flex-row gap-1 items-center">
              <input
                id="rating-input"
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={filters.minRating || ''}
                onChange={handleRatingChange}
                placeholder="0"
                className="w-14 border border-gray-300 rounded px-1 py-1 text-sm"
              />
              <span className="text-xs text-gray-700">/5</span>
            </div>
          </div>
          <div className="flex flex-col justify-end">
            <button
              type="button"
              className="self-start mt-3 sm:mt-6 text-xs text-blue-600 hover:underline px-2"
              onClick={handleResetFilters}
              aria-label="Reset filters"
            >
              Reset filters
            </button>
          </div>
        </div>
      </div>
      {loading && (
        <div className="mt-3 flex items-center gap-2 text-blue-700 text-sm pl-1">
          <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            ></path>
          </svg>
          Loading caregivers...
        </div>
      )}
    </form>
  );
}

export default SearchBar;