import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Button, Card, Spinner, Avatar, Badge } from '@pcs/ui'; // Assume design system
import { Booking, CaregiverProfile, User } from '@pcs/types'; // Shared types
import { useAuth } from '../hooks/useAuth'; // Custom hook for auth/user
import { Link } from 'react-router-dom';

interface BookingHistoryItem {
  booking: Booking;
  caregiver: {
    profile: CaregiverProfile;
    user: User;
  };
}

const bookingStatusMap: Record<
  Booking['status'],
  { label: string; color: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  pending:    { label: 'Pending',    color: 'info' },
  accepted:   { label: 'Accepted',   color: 'success' },
  declined:   { label: 'Declined',   color: 'danger' },
  completed:  { label: 'Completed',  color: 'success' },
  cancelled:  { label: 'Cancelled',  color: 'neutral' },
};

export function BookingHistory() {
  const { user, token } = useAuth();

  const [items, setItems] = useState<BookingHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBookings() {
      setLoading(true);
      setApiError(null);

      try {
        const res = await fetch('/api/client/bookings/history', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Failed to fetch booking history');
        }
        // Example shape: [{booking, caregiver: {profile, user}}]
        const data: BookingHistoryItem[] = await res.json();
        if (!cancelled) setItems(data);
      } catch (err: any) {
        if (!cancelled) setApiError('Unable to load booking history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (user) {
      fetchBookings();
    } else {
      setLoading(false);
      setItems([]);
    }

    return () => { cancelled = true; };
  }, [token, user]);

  function CaregiverCardContent({
    caregiver,
    booking,
  }: {
    caregiver: BookingHistoryItem['caregiver'];
    booking: Booking;
  }) {
    return (
      <div className="flex flex-row items-center gap-4">
        <Avatar size={56} src={caregiver.user.avatar_url ?? undefined}>
          {caregiver.user.full_name[0]}
        </Avatar>
        <div className="flex-1">
          <Link to={`/caregivers/${caregiver.profile.id}`} className="font-medium text-primary-700 hover:underline">
            {caregiver.user.full_name}
          </Link>
          <div className="text-gray-500 text-sm">
            {caregiver.profile.location_city}, {caregiver.profile.location_state}
          </div>
          <div className="mt-1 flex flex-row flex-wrap gap-2 text-xs">
            {JSON.parse(caregiver.profile.specialties || '[]').map((spec: string) => (
              <Badge color="info" key={spec}>
                {spec}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end min-w-[100px]">
          <Badge color={bookingStatusMap[booking.status].color}>
            {bookingStatusMap[booking.status].label}
          </Badge>
          <div className="text-xs text-gray-400 mt-1">
            {format(new Date(booking.scheduled_date), 'MMM d, yyyy')}
            <br />
            {format(new Date(booking.scheduled_date), 'hh:mm a')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-4 px-2">
      <h2 className="font-bold text-2xl mb-4">Booking History</h2>
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : apiError ? (
        <div className="bg-red-100 rounded text-red-700 py-2 px-4 mb-4">
          {apiError}
        </div>
      ) : items && items.length === 0 ? (
        <div className="text-center my-8 text-gray-500">
          <div className="mb-4">No bookings yet.</div>
          <Link to="/caregivers">
            <Button color="primary">Find a Caregiver</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items &&
            items
              .sort((a, b) =>
                new Date(b.booking.scheduled_date).getTime() - new Date(a.booking.scheduled_date).getTime()
              )
              .map(({ booking, caregiver }) => (
                <Card shadow key={booking.id} className="p-4">
                  <CaregiverCardContent caregiver={caregiver} booking={booking} />
                  <div className="mt-3 px-2">
                    <div className="flex flex-row gap-8 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Status:</span>{' '}
                        {bookingStatusMap[booking.status].label}
                      </div>
                      <div>
                        <span className="font-medium">Booked for:</span>{' '}
                        {format(new Date(booking.scheduled_date), 'PPPp')}
                      </div>
                    </div>
                    {booking.notes && (
                      <div className="mt-2 bg-gray-50 border rounded p-2 text-xs">
                        <span className="font-medium">Notes:</span> {booking.notes}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
        </div>
      )}
    </div>
  );
}

export default BookingHistory;