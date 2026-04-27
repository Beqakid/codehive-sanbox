import React, { useEffect, useState, useCallback } from 'react';
import { CaregiverProfile, User } from 'packages/types'; // Assumes shared types package
import { Button, Card, Avatar, Spinner, Input, Select, Tag, Rating } from 'packages/ui'; // Example shared UI system imports
import { IoLocationOutline, IoSearchOutline, IoPersonOutline } from 'react-icons/io5';

type Filter = {
  search: string;
  location_city: string;
  location_state: string;
  specialties: string[];
  languages: string[];
  min_experience?: number;
  min_rating?: number;
  sort: 'best' | 'nearest' | 'experience' | 'rateLow' | 'rateHigh';
  onlyAvailable: boolean;
};

type CaregiverListItem = CaregiverProfile & {
  user: Pick<User, 'full_name' | 'avatar_url'>;
};

type Props = {
  // Optional: initial query/filter, e.g. for SSR or route preload
  initialFilter?: Partial<Filter>;
  onSelectCaregiver?: (caregiver: CaregiverListItem) => void;
};

const SPECIALTY_OPTIONS = [
  { value: 'elderly', label: 'Elderly' },
  { value: 'dementia', label: 'Dementia' },
  { value: 'pediatric', label: 'Pediatric' },
  // ...extend as needed
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  // ...extend as needed
];

const STATE_OPTIONS = [
  { value: '', label: 'All States' },
  { value: 'CA', label: 'California' },
  { value: 'TX', label: 'Texas' },
  { value: 'FL', label: 'Florida' },
  // ...extend as needed
];

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export const CaregiverList: React.FC<Props> = ({
  initialFilter,
  onSelectCaregiver,
}) => {
  const [caregivers, setCaregivers] = useState<CaregiverListItem[]>([]);
  const [filter, setFilter] = useState<Filter>({
    search: '',
    location_city: '',
    location_state: '',
    specialties: [],
    languages: [],
    min_experience: undefined,
    min_rating: undefined,
    sort: 'best',
    onlyAvailable: false,
    ...initialFilter,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [endReached, setEndReached] = useState(false);

  // Fetch caregivers from API
  const fetchCaregivers = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    try {
      // Compose query params for search/filter
      const query: Record<string, string> = {
        page: page.toString(),
        limit: '20',
        search: filter.search.trim(),
        onlyAvailable: filter.onlyAvailable ? 'true' : '',
        sort: filter.sort,
      };
      if (filter.location_city) query.location_city = filter.location_city;
      if (filter.location_state) query.location_state = filter.location_state;
      if (filter.specialties.length)
        query.specialties = filter.specialties.join(',');
      if (filter.languages.length)
        query.languages = filter.languages.join(',');
      if (filter.min_experience !== undefined)
        query.min_experience = String(filter.min_experience);
      if (filter.min_rating !== undefined)
        query.min_rating = String(filter.min_rating);

      // Remove empty keys
      Object.keys(query).forEach(
        (k) => query[k] === '' && delete query[k]
      );

      // Assumes /api/caregiver-profiles/list returns:
      // { data: CaregiverListItem[], nextPage: boolean }
      const url = `/api/caregiver-profiles/list?${new URLSearchParams(query)}`;
      const res = await fetch(url, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`API error (${res.status})`);
      }
      const json = await res.json();
      setCaregivers((prev) =>
        append ? dedupe([...prev, ...json.data]) : json.data
      );
      setEndReached(!json.nextPage);
    } catch (e: any) {
      setError(e.message || 'Failed to load caregivers');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  // Fetch caregivers when filter/page changes
  useEffect(() => {
    fetchCaregivers(page > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  // Reset to first page on filter changes
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleChange = <K extends keyof Filter, V extends Filter[K]>(
    key: K,
    value: V
  ) => {
    setFilter((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSearchInput = (ev: React.ChangeEvent<HTMLInputElement>) => {
    handleChange('search', ev.target.value);
  };

  const handleSpecialtyChange = (values: string[]) => {
    handleChange('specialties', values);
  };

  const handleLanguageChange = (values: string[]) => {
    handleChange('languages', values);
  };

  const handleStateChange = (value: string) => {
    handleChange('location_state', value);
  };

  const handleSortChange = (ev: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange('sort', ev.target.value as Filter['sort']);
  };

  const handleAvailableToggle = () => {
    handleChange('onlyAvailable', !filter.onlyAvailable);
  };

  const handleMinExpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    handleChange('min_experience', isNaN(v) ? undefined : v);
  };

  const handleMinRatingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    handleChange('min_rating', isNaN(v) ? undefined : v);
  };

  const handleLoadMore = () => {
    if (!endReached && !loading) setPage((p) => p + 1);
  };

  // Utilities for tag label
  function humanizeSpecialty(key: string) {
    return (
      SPECIALTY_OPTIONS.find((o) => o.value === key)?.label ||
      key.charAt(0).toUpperCase() + key.slice(1)
    );
  }

  function humanizeLanguage(key: string) {
    return (
      LANGUAGE_OPTIONS.find((o) => o.value === key)?.label ||
      key.toUpperCase()
    );
  }

  // Main
  return (
    <div className="caregiver-list">
      <section className="filter-bar" style={{ padding: '1rem', background: '#fff', borderRadius: 12, marginBottom: 12 }}>
        <form
          className="filter-form"
          onSubmit={(e) => { e.preventDefault(); fetchCaregivers(); }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <Input
              type="search"
              value={filter.search}
              onChange={handleSearchInput}
              placeholder="Search caregivers (name, skills, etc)"
              prefixIcon={<IoSearchOutline />}
            />
          </div>
          <div>
            <Select
              options={STATE_OPTIONS}
              value={filter.location_state}
              onChange={handleStateChange}
              placeholder="State"
              style={{ width: 120 }}
            />
          </div>
          <div>
            <Input
              type="text"
              value={filter.location_city}
              onChange={(e) => handleChange('location_city', e.target.value)}
              placeholder="City"
            />
          </div>
          <div>
            <Select
              options={SPECIALTY_OPTIONS}
              value={filter.specialties}
              onChange={handleSpecialtyChange}
              multiple
              placeholder="Specialties"
              style={{ minWidth: 120 }}
            />
          </div>
          <div>
            <Select
              options={LANGUAGE_OPTIONS}
              value={filter.languages}
              onChange={handleLanguageChange}
              multiple
              placeholder="Languages"
              style={{ minWidth: 120 }}
            />
          </div>
          <div>
            <Input
              type="number"
              min={0}
              value={
                filter.min_experience !== undefined
                  ? filter.min_experience
                  : ''
              }
              onChange={handleMinExpChange}
              placeholder="Min Yrs Exp"
              style={{ width: 80 }}
            />
          </div>
          <div>
            <Input
              type="number"
              min={0}
              max={5}
              step={0.5}
              value={
                filter.min_rating !== undefined
                  ? filter.min_rating
                  : ''
              }
              onChange={handleMinRatingChange}
              placeholder="Min Rating"
              style={{ width: 80 }}
            />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={filter.onlyAvailable}
                onChange={handleAvailableToggle}
              />
              Available Now
            </label>
          </div>
          <div>
            <select
              value={filter.sort}
              onChange={handleSortChange}
              style={{ padding: '6px 12px', borderRadius: 6 }}
            >
              <option value="best">Best Rated</option>
              <option value="nearest">Nearest</option>
              <option value="experience">Most Experienced</option>
              <option value="rateLow">Lowest Rate</option>
              <option value="rateHigh">Highest Rate</option>
            </select>
          </div>
          <div>
            <Button type="submit" size="sm">Apply</Button>
          </div>
        </form>
      </section>
      <section className="list-results" style={{ minHeight: 200 }}>
        {loading && caregivers.length === 0 && (
          <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        )}
        {error && (
          <div style={{ color: '#d00', margin: 24, textAlign: 'center' }}>
            {error}
          </div>
        )}
        {!loading && caregivers.length === 0 && !error && (
          <div style={{ color: '#444', margin: 32, textAlign: 'center' }}>
            <IoPersonOutline size={32} />
            <div>No caregivers found. Try adjusting your search filters.</div>
          </div>
        )}
        <div style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          marginTop: 10,
        }}>
          {caregivers.map((cg) => (
            <Card
              key={cg.id}
              style={{
                boxShadow: '0 1px 12px rgba(0,0,0,0.06)',
                borderRadius: 14,
                cursor: onSelectCaregiver ? 'pointer' : 'default',
                background: '#fafcff',
                transition: 'box-shadow .15s',
                display: 'flex', flexDirection: 'column'
              }}
              onClick={onSelectCaregiver ? () => onSelectCaregiver(cg) : undefined}
              tabIndex={0}
              aria-label={`View details for ${cg.user.full_name}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar
                  src={cg.user.avatar_url || undefined}
                  alt={cg.user.full_name}
                  size={54}
                  style={{ borderRadius: 12 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 18, color: '#153a55', marginBottom: 1 }}>
                    {cg.user.full_name}
                  </div>
                  <div style={{ color: '#669', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IoLocationOutline />{cg.location_city}, {cg.location_state}
                  </div>
                  <div style={{ margin: '4px 0', color: '#888', fontSize: 13 }}>
                    {cg.years_experience} yrs experience · {cg.review_count} reviews
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontWeight: 600, color: '#289355', fontSize: 16 }}>
                    ${(cg.hourly_rate / 100).toFixed(0)}<span style={{ fontWeight: 400, fontSize: 13 }}>/hr</span>
                  </div>
                  <Rating value={cg.rating_avg} readOnly count={5} size={18} />
                </div>
              </div>
              <div style={{
                marginTop: 10,
                color: '#323',
                fontSize: 15,
                minHeight: 48,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {cg.bio}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Array.isArray(cg.specialties)
                  ? cg.specialties.map(humanizeSpecialty).map((label) => (
                      <Tag key={label} color="green" size="sm">{label}</Tag>
                    ))
                  : JSON.parse(cg.specialties || '[]').map(humanizeSpecialty).map((label: string) => (
                      <Tag key={label} color="green" size="sm">{label}</Tag>
                    ))}
                {Array.isArray(cg.languages)
                  ? cg.languages.map(humanizeLanguage).map((label) => (
                      <Tag key={label} color="blue" size="sm">{label}</Tag>
                    ))
                  : JSON.parse(cg.languages || '[]').map(humanizeLanguage).map((label: string) => (
                      <Tag key={label} color="blue" size="sm">{label}</Tag>
                    ))}
                {cg.is_available &&
                  <Tag color="cyan" size="sm" style={{ fontWeight: 500 }}>
                    Available Now
                  </Tag>
                }
              </div>
            </Card>
          ))}
        </div>
        {caregivers.length > 0 && !endReached && !loading && (
          <div style={{ margin: 32, display: 'flex', justifyContent: 'center' }}>
            <Button onClick={handleLoadMore} size="md">Load more</Button>
          </div>
        )}
        {loading && caregivers.length > 0 && (
          <div style={{ margin: 16, display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        )}
      </section>
    </div>
  );
};

export default CaregiverList;