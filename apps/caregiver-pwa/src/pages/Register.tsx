import React, { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { CaregiverRegistrationSchema } from '@pcs/types'; // import shared schema if exists
import { Button, Input, TextArea, Select, MultiSelect, AvatarUploader, Spinner, Alert } from '@pcs/ui'; // shared UI components
import { apiBaseUrl } from '../config';

// Fallback if shared schema import unavailable
const RegistrationSchema = CaregiverRegistrationSchema ?? z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  bio: z.string().min(20),
  years_experience: z.number().min(0).max(60),
  hourly_rate: z.number().min(10).max(1000),
  location_city: z.string().min(2),
  location_state: z.string().min(2),
  specialties: z.array(z.string()).min(1),
  certifications: z.array(z.string()).optional(),
  languages: z.array(z.string()).min(1),
  avatar: z.any().optional(),
});

const SPECIALTIES_OPTIONS = [
  { value: 'elderly', label: 'Elderly Care' },
  { value: 'dementia', label: 'Dementia' },
  { value: 'pediatric', label: 'Pediatric' },
  { value: 'disability', label: 'Disability Assistance' },
  { value: 'rehab', label: 'Rehabilitation' },
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Mandarin Chinese' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'other', label: 'Other' },
];

const STATE_OPTIONS = [
  { value: 'AL', label: 'AL' }, { value: 'AK', label: 'AK' }, { value: 'AZ', label: 'AZ' },
  { value: 'AR', label: 'AR' }, { value: 'CA', label: 'CA' }, { value: 'CO', label: 'CO' },
  { value: 'CT', label: 'CT' }, { value: 'DE', label: 'DE' }, { value: 'FL', label: 'FL' },
  { value: 'GA', label: 'GA' }, { value: 'HI', label: 'HI' }, { value: 'ID', label: 'ID' },
  { value: 'IL', label: 'IL' }, { value: 'IN', label: 'IN' }, { value: 'IA', label: 'IA' },
  { value: 'KS', label: 'KS' }, { value: 'KY', label: 'KY' }, { value: 'LA', label: 'LA' },
  { value: 'ME', label: 'ME' }, { value: 'MD', label: 'MD' }, { value: 'MA', label: 'MA' },
  { value: 'MI', label: 'MI' }, { value: 'MN', label: 'MN' }, { value: 'MS', label: 'MS' },
  { value: 'MO', label: 'MO' }, { value: 'MT', label: 'MT' }, { value: 'NE', label: 'NE' },
  { value: 'NV', label: 'NV' }, { value: 'NH', label: 'NH' }, { value: 'NJ', label: 'NJ' },
  { value: 'NM', label: 'NM' }, { value: 'NY', label: 'NY' }, { value: 'NC', label: 'NC' },
  { value: 'ND', label: 'ND' }, { value: 'OH', label: 'OH' }, { value: 'OK', label: 'OK' },
  { value: 'OR', label: 'OR' }, { value: 'PA', label: 'PA' }, { value: 'RI', label: 'RI' },
  { value: 'SC', label: 'SC' }, { value: 'SD', label: 'SD' }, { value: 'TN', label: 'TN' },
  { value: 'TX', label: 'TX' }, { value: 'UT', label: 'UT' }, { value: 'VT', label: 'VT' },
  { value: 'VA', label: 'VA' }, { value: 'WA', label: 'WA' }, { value: 'WV', label: 'WV' },
  { value: 'WI', label: 'WI' }, { value: 'WY', label: 'WY' },
];

function formatApiError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as any).message);
  return 'An error occurred. Please try again.';
}

const defaultFormState = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  bio: '',
  years_experience: '',
  hourly_rate: '',
  location_city: '',
  location_state: '',
  specialties: [] as string[],
  certifications: [] as string[],
  languages: [] as string[],
  avatar: undefined as File | undefined,
};

const Register: React.FC = () => {
  const [form, setForm] = useState(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function onInputChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function onNumberChange(name: string, value: string) {
    setForm(f => ({ ...f, [name]: value.replace(/[^0-9.]/g, '') }));
  }

  function onMultiChange(name: string, values: string[]) {
    setForm(f => ({ ...f, [name]: values }));
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setForm(f => ({ ...f, avatar: file }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGeneralError(null);
    setErrors({});
    setLoading(true);

    // numeric conversion
    let prepared = {
      ...form,
      years_experience: Number(form.years_experience),
      hourly_rate: Number(form.hourly_rate),
    };

    // zod validation
    const result = RegistrationSchema.safeParse({
      ...prepared,
      specialties: form.specialties,
      certifications: form.certifications || [],
      languages: form.languages,
      avatar: form.avatar,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        if (issue.path[0]) fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    try {
      // Avatar upload first (if present)
      let avatarUrl: string | undefined;
      if (form.avatar) {
        const fd = new FormData();
        fd.append('file', form.avatar);
        const upRes = await fetch(`${apiBaseUrl}/uploads/avatar`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!upRes.ok) throw new Error('Avatar upload failed');
        const up = await upRes.json();
        avatarUrl = up.url;
      }

      // Register caregiver
      const res = await fetch(`${apiBaseUrl}/auth/caregiver/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          phone: form.phone || null,
          avatar_url: avatarUrl || null,
          // Profile
          bio: form.bio,
          years_experience: Number(form.years_experience),
          hourly_rate: Math.round(Number(form.hourly_rate) * 100),
          location_city: form.location_city,
          location_state: form.location_state,
          specialties: form.specialties,
          certifications: form.certifications || [],
          languages: form.languages,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setGeneralError(formatApiError(errText));
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setGeneralError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-center mb-2">Caregiver Registration</h1>
      <p className="text-center mb-4 text-sm text-gray-600">
        Create your caregiver profile to connect with clients needing your expertise.
      </p>
      {generalError && <Alert type="error" className="mb-4">{generalError}</Alert>}
      {success && <Alert type="success" className="mb-4">Registration successful! Redirecting...</Alert>}

      <form className="space-y-5" onSubmit={handleSubmit} autoComplete="off">
        <div>
          <AvatarUploader
            name="avatar"
            label="Profile Photo"
            onFileSelect={file => setForm(f => ({ ...f, avatar: file }))}
            initial={form.avatar}
            inputRef={avatarInputRef}
            error={errors.avatar}
          />
        </div>

        <Input
          label="Full Name"
          name="full_name"
          value={form.full_name}
          onChange={onInputChange}
          autoComplete="name"
          error={errors.full_name}
          required
        />

        <Input
          label="Email"
          name="email"
          type="email"
          value={form.email}
          onChange={onInputChange}
          autoComplete="email"
          error={errors.email}
          required
        />

        <Input
          label="Password"
          name="password"
          type="password"
          value={form.password}
          onChange={onInputChange}
          autoComplete="new-password"
          error={errors.password}
          required
          minLength={8}
        />

        <Input
          label="Phone Number"
          name="phone"
          type="tel"
          value={form.phone}
          onChange={onInputChange}
          autoComplete="tel"
          error={errors.phone}
        />

        <TextArea
          label="Bio"
          name="bio"
          value={form.bio}
          onChange={onInputChange}
          error={errors.bio}
          required
          minLength={20}
          placeholder="Describe your caregiving experience and approach (min 20 chars)"
        />

        <Input
          label="Years of Experience"
          name="years_experience"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          value={form.years_experience}
          onChange={e => onNumberChange('years_experience', e.target.value)}
          error={errors.years_experience}
          required
        />

        <Input
          label="Hourly Rate ($)"
          name="hourly_rate"
          type="number"
          inputMode="decimal"
          min={10}
          max={1000}
          value={form.hourly_rate}
          onChange={e => onNumberChange('hourly_rate', e.target.value)}
          error={errors.hourly_rate}
          required
        />

        <Input
          label="City"
          name="location_city"
          value={form.location_city}
          onChange={onInputChange}
          error={errors.location_city}
          required
        />

        <Select
          label="State"
          name="location_state"
          value={form.location_state}
          options={STATE_OPTIONS}
          onChange={v => setForm(f => ({ ...f, location_state: v as string }))}
          error={errors.location_state}
          required
        />

        <MultiSelect
          label="Specialties"
          name="specialties"
          options={SPECIALTIES_OPTIONS}
          values={form.specialties}
          onChange={vals => onMultiChange('specialties', vals)}
          error={errors.specialties}
          required
        />

        <MultiSelect
          label="Certifications"
          name="certifications"
          values={form.certifications}
          onChange={vals => onMultiChange('certifications', vals)}
          allowCustom
          placeholder="Type and press enter"
        />

        <MultiSelect
          label="Languages"
          name="languages"
          options={LANGUAGE_OPTIONS}
          values={form.languages}
          onChange={vals => onMultiChange('languages', vals)}
          error={errors.languages}
          required
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'Register'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link to="/login" className="text-blue-600 underline">Log in</Link>
      </div>
    </div>
  );
};

export default Register;