import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { z } from 'zod';
import { registerClient } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  TextField,
  FormLabel,
  Alert,
  Spinner,
} from '@pcs/ui';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  phone: z
    .string()
    .min(10, 'Please enter a valid phone number')
    .max(20)
    .optional()
    .or(z.literal('')),
  careRecipientName: z.string().min(2, 'Care recipient name is required'),
  careRecipientAge: z.coerce.number().min(0, 'Enter a valid age'),
  locationCity: z.string().min(2, 'City required'),
  locationState: z.string().min(2, 'State required'),
  careNeeds: z
    .string()
    .min(2, 'Describe care needs')
    .max(250, 'Too long'),
});

type RegisterForm = z.input<typeof registerSchema>;

export default function Register() {
  const [form, setForm] = useState<RegisterForm>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    careRecipientName: '',
    careRecipientAge: 0,
    locationCity: '',
    locationState: '',
    careNeeds: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const auth = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrors((prev) => ({
      ...prev,
      [name]: undefined,
    }));
  };

  const validateForm = useCallback(() => {
    let parsed = registerSchema.safeParse(form);
    const errMap: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        // zod flattens nested fields as dot notation, here all flat
        const k = issue.path[0] as keyof RegisterForm;
        if (!errMap[k]) errMap[k] = issue.message;
      }
    }
    if (form.password !== form.confirmPassword) {
      errMap.confirmPassword = 'Passwords do not match';
    }
    setErrors(errMap);
    return Object.keys(errMap).length === 0;
  }, [form]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        full_name: form.fullName,
        email: form.email,
        password: form.password,
        phone: form.phone || null,
        role: 'client',
        client_profile: {
          care_recipient_name: form.careRecipientName,
          care_recipient_age: Number(form.careRecipientAge),
          location_city: form.locationCity,
          location_state: form.locationState,
          care_needs: [form.careNeeds],
          notes: null,
        },
      };
      const { user, token, error } = await registerClient(payload);
      if (error) {
        setFormError(error);
        setLoading(false);
        return;
      }
      await auth.setSession(token, user);
      navigate('/dashboard');
    } catch (err: any) {
      setFormError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 px-2">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h2 className="text-xl font-semibold mb-1">Create your client account</h2>
          <p className="text-gray-500 text-sm mb-3">
            Register as a client to find, book, and manage caregivers.
          </p>
        </CardHeader>
        <CardContent>
          {formError && <Alert type="error" className="mb-4">{formError}</Alert>}
          <form onSubmit={onSubmit} autoComplete="off" noValidate>
            <div className="space-y-3">
              <div>
                <FormLabel htmlFor="fullName" required>
                  Full name
                </FormLabel>
                <TextField
                  id="fullName"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  error={errors.fullName}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="email" required>
                  Email address
                </FormLabel>
                <TextField
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={handleChange}
                  error={errors.email}
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="phone">Phone number</FormLabel>
                <TextField
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={handleChange}
                  error={errors.phone}
                  autoComplete="tel"
                  placeholder="(optional)"
                />
              </div>
              <div>
                <FormLabel htmlFor="password" required>
                  Password
                </FormLabel>
                <TextField
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  error={errors.password}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div>
                <FormLabel htmlFor="confirmPassword" required>
                  Confirm password
                </FormLabel>
                <TextField
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  error={errors.confirmPassword}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="mt-5 mb-2 font-semibold text-gray-700 text-sm">
                Care Recipient Details
              </div>
              <div>
                <FormLabel htmlFor="careRecipientName" required>
                  Care recipient name
                </FormLabel>
                <TextField
                  id="careRecipientName"
                  name="careRecipientName"
                  value={form.careRecipientName}
                  onChange={handleChange}
                  error={errors.careRecipientName}
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <FormLabel htmlFor="careRecipientAge" required>
                  Care recipient age
                </FormLabel>
                <TextField
                  id="careRecipientAge"
                  name="careRecipientAge"
                  type="number"
                  min={0}
                  value={form.careRecipientAge}
                  onChange={handleChange}
                  error={errors.careRecipientAge}
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="locationCity" required>
                  City
                </FormLabel>
                <TextField
                  id="locationCity"
                  name="locationCity"
                  value={form.locationCity}
                  onChange={handleChange}
                  error={errors.locationCity}
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="locationState" required>
                  State
                </FormLabel>
                <TextField
                  id="locationState"
                  name="locationState"
                  value={form.locationState}
                  onChange={handleChange}
                  error={errors.locationState}
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="careNeeds" required>
                  Briefly describe care needs
                </FormLabel>
                <TextField
                  as="textarea"
                  id="careNeeds"
                  name="careNeeds"
                  value={form.careNeeds}
                  onChange={handleChange}
                  error={errors.careNeeds}
                  required
                  rows={2}
                />
              </div>
              <div className="pt-3">
                <Button
                  type="submit"
                  size="lg"
                  color="primary"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? <Spinner size="sm" /> : 'Register'}
                </Button>
              </div>
            </div>
          </form>
          <div className="text-center text-gray-600 mt-5 text-sm">
            Already have an account?{' '}
            <Link
              className="text-blue-600 hover:underline"
              to="/login"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}