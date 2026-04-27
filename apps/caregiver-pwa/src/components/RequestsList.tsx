import React, { useEffect, useState, useCallback } from 'react';
import { Button, Spinner, Avatar, Modal, useToast } from '@pcs/ui';
import { Booking, ClientProfile, User } from '@pcs/types';
import { format, isFuture, parseISO } from 'date-fns';

interface RequestWithClient {
  booking: Booking;
  client: {
    user: User;
    profile: ClientProfile | null;
  };
}

type BookingStatus = Booking['status'];

// Simple API fetcher
async function fetchRequests(): Promise<RequestWithClient[]> {
  const res = await fetch('/api/caregiver/requests', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch requests');
  return res.json();
}

async function respondRequest(
  bookingId: string,
  status: Exclude<BookingStatus, 'pending' | 'completed'>
): Promise<void> {
  const res = await fetch(`/api/caregiver/requests/${bookingId}/respond`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || 'Request failed');
  }
}

// Human-readable label for each status
function statusLabel(status: BookingStatus) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function getCareNeedsDisplay(care_needs_json: string | undefined) {
  try {
    const arr = care_needs_json ? JSON.parse(care_needs_json) : [];
    if (Array.isArray(arr) && arr.length > 0) return arr.join(', ');
  } catch {
    /* noop */
  }
  return '';
}

function RequestItem({
  request,
  onRespond,
  loading,
}: {
  request: RequestWithClient;
  onRespond: (bookingId: string, status: BookingStatus) => void;
  loading: boolean;
}) {
  const { booking, client } = request;
  const scheduled = parseISO(booking.scheduled_date);
  const canRespond = booking.status === 'pending' && isFuture(scheduled);

  return (
    <div className="bg-white rounded shadow p-4 flex flex-col mb-4">
      <div className="flex items-center mb-3">
        <Avatar
          src={client.user.avatar_url || undefined}
          alt={client.user.full_name}
          className="w-12 h-12 mr-3"
        />
        <div>
          <div className="font-semibold">{client.user.full_name}</div>
          {client.profile && (
            <div className="text-sm text-gray-500">
              {client.profile.care_recipient_name} ({client.profile.care_recipient_age} yrs)
            </div>
          )}
          <div className="text-xs text-gray-400">{client.user.email}</div>
        </div>
      </div>
      <div className="mb-2">
        <div>
          <span className="font-medium">Date: </span>
          {format(scheduled, 'PPPPp')}
        </div>
        <div>
          <span className="font-medium">Status: </span>
          <span
            className={`inline-block px-2 rounded text-xs ${
              booking.status === 'pending'
                ? 'bg-yellow-100 text-yellow-700'
                : booking.status === 'accepted'
                ? 'bg-green-100 text-green-700'
                : booking.status === 'declined'
                ? 'bg-red-100 text-red-700'
                : booking.status === 'completed'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            {statusLabel(booking.status)}
          </span>
        </div>
        {client.profile && (
          <div>
            <span className="font-medium">Care needs: </span>
            {getCareNeedsDisplay(client.profile.care_needs)}
          </div>
        )}
        {booking.notes && (
          <div>
            <span className="font-medium">Notes: </span>
            <span className="text-gray-700">{booking.notes}</span>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-2">
        {canRespond && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRespond(booking.id, 'accepted')}
              disabled={loading}
            >
              {loading ? <Spinner size={18} /> : 'Accept'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onRespond(booking.id, 'declined')}
              disabled={loading}
            >
              {loading ? <Spinner size={18} /> : 'Decline'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function RequestsList() {
  const [requests, setRequests] = useState<RequestWithClient[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    bookingId: string;
    type: 'accept' | 'decline';
  } | null>(null);

  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = await fetchRequests();
      setRequests(reqs);
    } catch (e) {
      setRequests([]);
      toast.error('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRespond = useCallback(
    (bookingId: string, status: 'accepted' | 'declined') => {
      setModal({ bookingId, type: status === 'accepted' ? 'accept' : 'decline' });
    },
    []
  );

  const handleModalConfirm = async () => {
    if (!modal) return;
    setRespondingId(modal.bookingId);
    try {
      await respondRequest(modal.bookingId, modal.type === 'accept' ? 'accepted' : 'declined');
      toast.success(
        modal.type === 'accept'
          ? 'Request accepted successfully.'
          : 'Request declined successfully.'
      );
      setModal(null);
      await loadData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to respond.');
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-5">Incoming Requests</h2>
      {requests && requests.length === 0 && (
        <div className="text-center text-gray-400 mt-16">No requests at this time.</div>
      )}
      {requests &&
        requests.map((req) => (
          <RequestItem
            key={req.booking.id}
            request={req}
            loading={respondingId === req.booking.id}
            onRespond={handleRespond}
          />
        ))}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.type === 'accept' ? 'Accept Request' : 'Decline Request'}
      >
        <div className="mb-4">
          {modal?.type === 'accept'
            ? 'Are you sure you want to accept this request?'
            : 'Are you sure you want to decline this request?'}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setModal(null)}>
            Cancel
          </Button>
          <Button
            variant={modal?.type === 'accept' ? 'primary' : 'danger'}
            onClick={handleModalConfirm}
            disabled={!!respondingId}
          >
            {respondingId ? <Spinner size={18} /> : modal?.type === 'accept' ? 'Accept' : 'Decline'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}