import { 
  createUser, 
  getUserByEmail, 
  createCaregiverProfile, 
  searchCaregivers, 
  createBooking, 
  getBookingsForClient, 
  updateCaregiverAvailability, 
  handleCaregiverResponseToRequest 
} from '../implementation';
import * as db from '../db';
import * as auth from '../../packages/auth';
import { CaregiverProfile, Booking, User } from '../../packages/types';

jest.mock('../db');
jest.mock('../../packages/auth');

describe('PCS App Core Functions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    it('should hash password, store user, and return user without password', async () => {
      const mockHash = 'xxx123hash';
      const userToCreate = {
        email: 'test@test.com',
        password: 's3cr3t!',
        role: 'client' as const,
        full_name: 'Test Person',
        phone: '1234567890'
      };

      (auth.hashPassword as jest.Mock).mockResolvedValue(mockHash);
      (db.insertUser as jest.Mock).mockResolvedValue({
        id: 'u-1',
        ...userToCreate,
        password_hash: mockHash,
        avatar_url: null,
        is_verified: false,
        created_at: '2024-04-25T12:00:00Z',
        updated_at: '2024-04-25T12:00:00Z'
      });

      const user = await createUser(userToCreate);

      expect(auth.hashPassword).toHaveBeenCalledWith(userToCreate.password);
      expect(db.insertUser).toHaveBeenCalledWith(expect.objectContaining({
        email: userToCreate.email,
        password_hash: mockHash
      }));
      expect(user).toMatchObject({
        id: 'u-1',
        email: userToCreate.email,
        role: 'client',
        full_name: 'Test Person'
      });
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('password_hash');
    });
  });

  describe('getUserByEmail', () => {
    it('should return user for valid email', async () => {
      (db.findUserByEmail as jest.Mock).mockResolvedValue({
        id: 'u-1',
        email: 'foo@bar.com',
        password_hash: 'xxxhash',
        role: 'caregiver',
        full_name: 'Jen Foo',
        phone: null,
        avatar_url: null,
        is_verified: true,
        created_at: '2024-01-01T12:00:00Z',
        updated_at: '2024-01-01T12:00:00Z'
      });

      const user = await getUserByEmail('foo@bar.com');
      expect(db.findUserByEmail).toHaveBeenCalledWith('foo@bar.com');
      expect(user).toBeDefined();
      expect(user?.email).toBe('foo@bar.com');
      expect(user?.role).toBe('caregiver');
    });

    it('should return null for nonexistent email', async () => {
      (db.findUserByEmail as jest.Mock).mockResolvedValue(null);
      const user = await getUserByEmail('nomatch@test.com');
      expect(user).toBeNull();
    });
  });

  describe('createCaregiverProfile', () => {
    it('should store caregiver profile and return profile', async () => {
      const input = {
        user_id: 'u-care-1',
        bio: '20 years in elder care',
        years_experience: 20,
        hourly_rate: 4000,
        location_city: 'Springfield',
        location_state: 'IL',
        specialties: ['elderly', 'dementia'],
        certifications: ['cpr'],
        languages: ['en', 'es'],
        is_available: true
      };
      (db.insertCaregiverProfile as jest.Mock).mockResolvedValue({
        id: 'c-1',
        ...input,
        specialties: JSON.stringify(input.specialties),
        certifications: JSON.stringify(input.certifications),
        languages: JSON.stringify(input.languages),
        latitude: null,
        longitude: null,
        rating_avg: 0,
        review_count: 0,
        created_at: '2024-05-06T10:00Z',
        updated_at: '2024-05-06T10:00Z'
      });

      const profile = await createCaregiverProfile(input);

      expect(db.insertCaregiverProfile).toHaveBeenCalledWith(expect.objectContaining({
        user_id: input.user_id,
        bio: input.bio,
        specialties: expect.any(String)
      }));
      expect(profile.id).toBe('c-1');
      expect(profile.years_experience).toBe(20);
      expect(Array.isArray(profile.specialties)).toBe(true);
      expect(profile.specialties).toContain('elderly');
    });
  });

  describe('searchCaregivers', () => {
    it('should call db with correct filters and return mapped caregivers', async () => {
      (db.queryCaregiversWithFilters as jest.Mock).mockResolvedValue([
        {
          id: 'c-123',
          user_id: 'u-12',
          bio: 'Caring for elderly',
          years_experience: 7,
          hourly_rate: 3200,
          location_city: 'Denver',
          location_state: 'CO',
          latitude: 39.7,
          longitude: -104.9,
          specialties: JSON.stringify(['elderly']),
          certifications: JSON.stringify(['cna']),
          languages: JSON.stringify(['en']),
          is_available: true,
          rating_avg: 4.7,
          review_count: 12,
          created_at: '2024-04-01T10:00:00Z',
          updated_at: '2024-04-20T10:00:00Z'
        }
      ]);
      const filters = { location_state: 'CO', is_available: true };
      const caregivers = await searchCaregivers(filters);

      expect(db.queryCaregiversWithFilters).toHaveBeenCalledWith(filters);
      expect(Array.isArray(caregivers)).toBe(true);
      expect(caregivers[0]).toMatchObject({
        bio: 'Caring for elderly',
        years_experience: 7,
        location_state: 'CO'
      });
      expect(caregivers[0].specialties).toContain('elderly');
    });
  });

  describe('createBooking', () => {
    it('should store booking and return booking object', async () => {
      const bookingInput = {
        client_id: 'u-client-11',
        caregiver_id: 'u-care-22',
        scheduled_date: '2025-07-06',
        status: 'pending' as const
      };
      (db.insertBooking as jest.Mock).mockResolvedValue({
        ...bookingInput,
        id: 'b-101',
        created_at: '2025-06-06T13:00:00Z',
        updated_at: '2025-06-06T13:00:00Z'
      });

      const booking = await createBooking(bookingInput);

      expect(db.insertBooking).toHaveBeenCalledWith(expect.objectContaining({
        client_id: bookingInput.client_id,
        caregiver_id: bookingInput.caregiver_id,
        scheduled_date: bookingInput.scheduled_date
      }));
      expect(booking.id).toBe('b-101');
      expect(booking.status).toBe('pending');
      expect(booking.client_id).toBe('u-client-11');
    });
  });

  describe('getBookingsForClient', () => {
    it('should return bookings for the given client', async () => {
      const mockBookings: Booking[] = [
        {
          id: 'b-50',
          client_id: 'u-client-99',
          caregiver_id: 'u-c-30',
          status: 'accepted',
          scheduled_date: '2026-04-01',
          created_at: '2026-03-29T09:01Z',
          updated_at: '2026-03-29T09:01Z'
        }
      ];
      (db.listBookingsForClient as jest.Mock).mockResolvedValue(mockBookings);

      const bookings = await getBookingsForClient('u-client-99');
      expect(db.listBookingsForClient).toHaveBeenCalledWith('u-client-99');
      expect(bookings).toHaveLength(1);
      expect(bookings[0].status).toBe('accepted');
    });
  });

  describe('updateCaregiverAvailability', () => {
    it('should update slot and return updated slot', async () => {
      const slot = {
        id: 'av-22',
        caregiver_id: 'c-11',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '13:00',
        is_recurring: false,
        specific_date: '2025-12-12'
      };
      (db.updateAvailabilitySlot as jest.Mock).mockResolvedValue(slot);

      const updated = await updateCaregiverAvailability(slot);

      expect(db.updateAvailabilitySlot).toHaveBeenCalledWith(slot);
      expect(updated.id).toBe('av-22');
      expect(updated.start_time).toBe('09:00');
    });
  });

  describe('handleCaregiverResponseToRequest', () => {
    it('should update booking status and return booking', async () => {
      const booking = {
        id: 'b-150',
        client_id: 'u-cl-44',
        caregiver_id: 'u-care-33',
        status: 'pending',
        scheduled_date: '2026-04-12',
        created_at: '2026-03-20T04:00Z',
        updated_at: '2026-03-20T04:00Z'
      };
      const update = { bookingId: 'b-150', newStatus: 'accepted' as const };
      (db.updateBookingStatus as jest.Mock).mockResolvedValue({
        ...booking,
        status: 'accepted'
      });

      const result = await handleCaregiverResponseToRequest(update);

      expect(db.updateBookingStatus).toHaveBeenCalledWith('b-150', 'accepted');
      expect(result.status).toBe('accepted');
      expect(result.id).toBe('b-150');
    });
  });
});