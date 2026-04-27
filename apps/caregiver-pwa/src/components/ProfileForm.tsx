import React, { useRef, useState, useEffect } from 'react';
import {
  CaregiverProfile,
  User,
} from '@pcs/types'; // Assumed to be a shared types package
import { useAuth } from '../hooks/useAuth'; // Custom hook to get authenticated user/session
import { uploadProfilePhoto } from '../utils/uploadProfilePhoto'; // Helper for uploading to R2
import { getCaregiverProfile, updateCaregiverProfile, createCaregiverProfile } from '../api/caregiver';
import { specialtiesOptions, certificationsOptions, languagesOptions, usStates } from '../constants/profileOptions';
import { Button, Input, TextArea, MultiSelect, Select, Switch, AvatarUploader } from '@pcs/ui';

type ProfileFormProps = {
  onSave?: (profile: CaregiverProfile) => void;
};

export const ProfileForm: React.FC<ProfileFormProps> = ({ onSave }) => {
  const { user } = useAuth() as { user: User | null };
  const [profile, setProfile] = useState<CaregiverProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [hourlyRate, setHourlyRate] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationState, setLocationState] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getCaregiverProfile(user.id)
      .then((data) => {
        if (!active) return;
        if (data) {
          setProfile(data);
          setFullName(user.full_name);
          setPhone(user.phone ?? '');
          setBio(data.bio ?? '');
          setYearsExperience(data.years_experience ?? 0);
          setHourlyRate(
            (data.hourly_rate !== undefined ? (data.hourly_rate / 100).toString() : '')
          );
          setLocationCity(data.location_city ?? '');
          setLocationState(data.location_state ?? '');
          setSpecialties(
            data.specialties ? (JSON.parse(data.specialties) as string[]) : []
          );
          setCertifications(
            data.certifications ? (JSON.parse(data.certifications) as string[]) : []
          );
          setLanguages(
            data.languages ? (JSON.parse(data.languages) as string[]) : []
          );
          setIsAvailable(data.is_available ?? true);
        } else {
          setFullName(user.full_name);
          setPhone(user.phone ?? '');
          setIsAvailable(true);
        }
      })
      .catch((err) => {
        setError('Failed to load your profile.');
      })
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [user]);

  // Avatar preview handling
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(
        user?.avatar_url
          ? `${import.meta.env.VITE_PUBLIC_R2_URL}/${user.avatar_url}`
          : null
      );
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line
  }, [avatarFile, user?.avatar_url]);

  const handleFileChange = (file: File | null) => {
    setAvatarFile(file);
  };

  const validate = () => {
    if (!fullName.trim()) return 'Full name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!bio.trim()) return 'Professional bio is required.';
    if (!locationCity.trim() || !locationState) return 'Location is required.';
    if (!yearsExperience || yearsExperience < 0)
      return 'Enter a valid number of years of experience.';
    if (!hourlyRate || isNaN(Number(hourlyRate)) || Number(hourlyRate) <= 0)
      return 'Hourly rate must be a positive number.';
    if (specialties.length === 0) return 'Select at least one specialty.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);

      // Upload avatar if changed
      let avatar_url: string | null = user?.avatar_url ?? null;
      if (avatarFile && avatarFile instanceof File) {
        const uploaded = await uploadProfilePhoto(avatarFile, user!.id);
        if (uploaded && uploaded.url) {
          avatar_url = uploaded.key;
        }
      }

      // Update user fields
      // (Assume there is an endpoint/api to patch these, or we can pass as part of profile API)
      // For now, we include these in the profile update payload

      const profilePayload: CaregiverProfile = {
        id: profile?.id ?? '',
        user_id: user!.id,
        bio: bio.trim(),
        years_experience: Number(yearsExperience),
        hourly_rate: Math.round(Number(hourlyRate) * 100),
        location_city: locationCity.trim(),
        location_state: locationState,
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        specialties: JSON.stringify(specialties),
        certifications: JSON.stringify(certifications),
        languages: JSON.stringify(languages),
        is_available: isAvailable,
        rating_avg: profile?.rating_avg ?? 0,
        review_count: profile?.review_count ?? 0,
        created_at: profile?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let savedProfile: CaregiverProfile;
      if (profile?.id) {
        savedProfile = await updateCaregiverProfile(user!.id, profilePayload, {
          full_name: fullName.trim(),
          phone: phone.trim(),
          avatar_url,
        });
      } else {
        savedProfile = await createCaregiverProfile(user!.id, profilePayload, {
          full_name: fullName.trim(),
          phone: phone.trim(),
          avatar_url,
        });
      }

      setProfile(savedProfile);
      if (onSave) onSave(savedProfile);
    } catch (err: any) {
      setError(
        err?.message ||
          'There was a problem saving your profile. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-36 text-gray-500">
        Loading profile...
      </div>
    );
  }

  return (
    <form className="max-w-2xl w-full mx-auto p-4 bg-white rounded shadow" onSubmit={handleSubmit} autoComplete="off">
      <h2 className="text-2xl font-bold mb-4">Your Caregiver Profile</h2>
      {error && (
        <div className="bg-red-100 text-red-700 rounded px-4 py-2 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center mb-6">
        <AvatarUploader
          label="Profile Photo"
          value={avatarPreview}
          onChange={handleFileChange}
          className="mb-2"
          name="avatar"
        />
        <div className="text-xs text-gray-500">PNG/JPG, up to 2MB</div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Input
          label="Full Name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          required
          name="fullName"
          autoComplete="name"
        />
        <Input
          label="Phone"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
          name="phone"
          autoComplete="tel"
          type="tel"
        />
      </div>

      <TextArea
        label="Professional Bio"
        value={bio}
        onChange={e => setBio(e.target.value)}
        required
        rows={4}
        name="bio"
        maxLength={800}
        className="mb-4"
        placeholder="Briefly describe your caregiving experience and personality."
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Input
          label="Years of Experience"
          type="number"
          min={0}
          max={100}
          value={yearsExperience}
          onChange={e => setYearsExperience(Number(e.target.value))}
          required
          name="yearsExperience"
        />
        <Input
          label="Hourly Rate (USD)"
          type="number"
          min={0}
          step="1"
          value={hourlyRate}
          onChange={e => setHourlyRate(e.target.value)}
          required
          name="hourlyRate"
        />
        <Switch
          label="Currently Accepting Clients"
          checked={isAvailable}
          onChange={setIsAvailable}
          name="isAvailable"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Input
          label="City"
          value={locationCity}
          onChange={e => setLocationCity(e.target.value)}
          required
          name="locationCity"
        />
        <Select
          label="State"
          value={locationState}
          onChange={v => setLocationState(v as string)}
          options={usStates.map(s => ({ label: s, value: s }))}
          required
          name="locationState"
        />
      </div>

      <MultiSelect
        label="Specialties"
        options={specialtiesOptions}
        value={specialties}
        onChange={setSpecialties}
        required
        name="specialties"
        placeholder="Select your specialties"
        className="mb-4"
      />

      <MultiSelect
        label="Certifications (optional)"
        options={certificationsOptions}
        value={certifications}
        onChange={setCertifications}
        name="certifications"
        placeholder="e.g. CNA, CPR, LPN"
        className="mb-4"
      />

      <MultiSelect
        label="Languages Spoken"
        options={languagesOptions}
        value={languages}
        onChange={setLanguages}
        name="languages"
        placeholder="Add all you can speak"
        className="mb-6"
      />

      <Button
        type="submit"
        loading={submitting}
        disabled={submitting}
        className="w-full"
        variant="primary"
      >
        {profile ? 'Update Profile' : 'Create Profile'}
      </Button>
    </form>
  );
};

export default ProfileForm;