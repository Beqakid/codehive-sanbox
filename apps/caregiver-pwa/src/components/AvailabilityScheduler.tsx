import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { Add, Delete, Edit, Close } from '@mui/icons-material';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import { AvailabilitySlot } from '@pcs/types';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

type EditSlot = Omit<
  AvailabilitySlot,
  'id' | 'caregiver_id'
> & {
  id?: string;
  specific_date?: string | null;
};

interface AvailabilitySchedulerProps {
  caregiverId?: string;
  token?: string;
}

/** API helpers */
async function fetchSlots(
  caregiverId: string,
  token: string,
): Promise<AvailabilitySlot[]> {
  const res = await fetch(
    `/api/caregiver/availability?caregiver_id=${encodeURIComponent(
      caregiverId,
    )}`,
    {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) throw new Error('Failed to fetch availability.');
  return (await res.json()) as AvailabilitySlot[];
}

async function createSlot(
  caregiverId: string,
  slot: Omit<EditSlot, 'id'>,
  token: string,
): Promise<AvailabilitySlot> {
  const res = await fetch('/api/caregiver/availability', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ caregiver_id: caregiverId, ...slot }),
  });
  if (!res.ok) throw new Error('Failed to create slot.');
  return (await res.json()) as AvailabilitySlot;
}

async function updateSlot(
  slotId: string,
  slot: Omit<EditSlot, 'id'>,
  token: string,
): Promise<AvailabilitySlot> {
  const res = await fetch(`/api/caregiver/availability/${slotId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(slot),
  });
  if (!res.ok) throw new Error('Failed to update slot.');
  return (await res.json()) as AvailabilitySlot;
}

async function deleteSlot(slotId: string, token: string): Promise<void> {
  const res = await fetch(`/api/caregiver/availability/${slotId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to delete slot.');
}

/** Dialog for Add/Edit Slot */
interface SlotDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (slot: Omit<EditSlot, 'id'>, slotId?: string) => void;
  initial?: EditSlot | null;
}

function SlotDialog({ open, onClose, onSave, initial }: SlotDialogProps) {
  const [form, setForm] = useState<Omit<EditSlot, 'id'>>(
    initial
      ? {
          day_of_week: initial.day_of_week,
          start_time: initial.start_time,
          end_time: initial.end_time,
          is_recurring: initial.is_recurring,
          specific_date: initial.specific_date ?? null,
        }
      : {
          day_of_week: 1,
          start_time: '09:00',
          end_time: '17:00',
          is_recurring: true,
          specific_date: null,
        },
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setForm({
        day_of_week: initial.day_of_week,
        start_time: initial.start_time,
        end_time: initial.end_time,
        is_recurring: initial.is_recurring,
        specific_date: initial.specific_date ?? null,
      });
    } else {
      setForm({
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        is_recurring: true,
        specific_date: null,
      });
    }
    setError(null);
  }, [open, initial]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]:
        type === 'checkbox'
          ? checked
          : name === 'day_of_week'
          ? parseInt(value, 10)
          : value,
    }));
    // Clear specific date if is_recurring checked
    if (name === 'is_recurring' && checked) {
      setForm((f) => ({
        ...f,
        specific_date: null,
      }));
    }
    // Uncheck is_recurring if specific_date picked
    if (name === 'specific_date' && value) {
      setForm((f) => ({ ...f, is_recurring: false }));
    }
  };

  const validate = () => {
    if (!form.is_recurring && !form.specific_date) {
      setError('Please choose either recurring or specify a date.');
      return false;
    }
    if (form.start_time >= form.end_time) {
      setError('End time must be after start time.');
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(form, initial?.id);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{initial ? 'Edit Availability Slot' : 'Add Availability Slot'}</DialogTitle>
        <DialogContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            <label>
              <span>Day of Week</span>
              <select
                name="day_of_week"
                value={form.day_of_week}
                disabled={!form.is_recurring}
                onChange={handleChange}
                style={{ marginLeft: 12, marginTop: 6, padding: 8, borderRadius: 4 }}
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label>
                <span>Start Time</span>
                <input
                  type="time"
                  name="start_time"
                  value={form.start_time}
                  onChange={handleChange}
                  required
                  style={{ marginLeft: 10, marginTop: 6, padding: 6, borderRadius: 4 }}
                />
              </label>
              <label>
                <span>End Time</span>
                <input
                  type="time"
                  name="end_time"
                  value={form.end_time}
                  onChange={handleChange}
                  required
                  style={{ marginLeft: 10, marginTop: 6, padding: 6, borderRadius: 4 }}
                />
              </label>
            </div>
            <label>
              <input
                type="checkbox"
                name="is_recurring"
                checked={form.is_recurring}
                onChange={handleChange}
              />
              <span style={{ marginLeft: 8 }}>Recurring Slot</span>
            </label>
            <label>
              <span>Specific Date (optional)</span>
              <input
                type="date"
                name="specific_date"
                value={form.specific_date || ''}
                onChange={handleChange}
                disabled={!!form.is_recurring}
                style={{ marginLeft: 10, marginTop: 6, padding: 6, borderRadius: 4 }}
                min={dayjs().format('YYYY-MM-DD')}
              />
            </label>
            {error && (
              <div style={{ color: 'red', marginTop: 8, fontSize: 13 }}>{error}</div>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary" startIcon={<Close />}>
            Cancel
          </Button>
          <Button type="submit" color="primary" variant="contained">
            {initial ? 'Save Changes' : 'Add Slot'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Main component */
const AvailabilityScheduler: React.FC<AvailabilitySchedulerProps> = ({
  caregiverId,
  token,
}) => {
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<EditSlot | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const fetchAllSlots = useCallback(() => {
    if (!caregiverId || !token) return;
    setLoading(true);
    fetchSlots(caregiverId, token)
      .then((res) => {
        setSlots(res);
      })
      .catch(() => setApiError('Failed to load availability slots.'))
      .finally(() => setLoading(false));
  }, [caregiverId, token]);

  useEffect(() => {
    fetchAllSlots();
  }, [fetchAllSlots]);

  const handleAddClick = () => {
    setEditSlot(null);
    setDialogOpen(true);
  };

  const handleEdit = (s: AvailabilitySlot) => {
    setEditSlot({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      is_recurring: s.is_recurring,
      specific_date: s.specific_date ?? null,
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditSlot(null);
  };

  const handleSlotSave = async (
    form: Omit<EditSlot, 'id'>,
    slotId?: string,
  ) => {
    if (!caregiverId || !token) return;
    setLoading(true);
    try {
      if (slotId) {
        await updateSlot(slotId, form, token);
        setSnackbar('Slot updated.');
      } else {
        await createSlot(caregiverId, form, token);
        setSnackbar('Slot added.');
      }
      handleDialogClose();
      fetchAllSlots();
    } catch (e: any) {
      setApiError(e.message || 'Failed to save slot.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (slotId: string) => {
    if (!token) return;
    setLoading(true);
    try {
      await deleteSlot(slotId, token);
      setSnackbar('Slot deleted.');
      setDeleteConfirm(null);
      fetchAllSlots();
    } catch (e: any) {
      setApiError(e.message || 'Failed to delete slot.');
    } finally {
      setLoading(false);
    }
  };

  // Group recurring slots by day of week
  const recurringSlots = useMemo(
    () => slots?.filter((s) => s.is_recurring) || [],
    [slots],
  );
  const oneoffSlots = useMemo(
    () => slots?.filter((s) => !s.is_recurring && !!s.specific_date) || [],
    [slots],
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
        <h2 style={{ flex: 1, fontSize: 20, margin: 0 }}>My Availability</h2>
        <Button
          variant="contained"
          size="small"
          startIcon={<Add />}
          onClick={handleAddClick}
          disabled={loading}
        >
          Add Slot
        </Button>
      </div>

      {loading && (!slots || slots.length === 0) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <CircularProgress />
        </div>
      )}

      {slots && slots.length === 0 && (
        <div style={{ color: '#777', padding: '18px 0' }}>
          You have not set any availability yet.
        </div>
      )}

      {slots && slots.length > 0 && (
        <>
          {recurringSlots.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 16,
                  marginTop: 22,
                  marginBottom: 10,
                  fontWeight: 500,
                  color: '#154873',
                }}
              >
                Recurring Slots
              </h3>
              <table style={{ width: '100%', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: '#f5f8fa' }}>
                    <th style={{ fontWeight: 'bold', padding: 7 }}>Day</th>
                    <th style={{ fontWeight: 'bold', padding: 7 }}>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recurringSlots
                    .sort((a, b) =>
                      a.day_of_week === b.day_of_week
                        ? a.start_time.localeCompare(b.start_time)
                        : a.day_of_week - b.day_of_week,
                    )
                    .map((slot) => (
                      <tr key={slot.id}>
                        <td style={{ padding: 7 }}>
                          {DAYS_OF_WEEK.find((d) => d.value === slot.day_of_week)?.label}
                        </td>
                        <td style={{ padding: 7 }}>
                          {slot.start_time} - {slot.end_time}
                        </td>
                        <td style={{ padding: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(slot)}
                            aria-label="Edit Slot"
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteConfirm(slot.id)}
                            aria-label="Delete"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}

          {oneoffSlots.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 16,
                  marginTop: 30,
                  marginBottom: 10,
                  fontWeight: 500,
                  color: '#154873',
                }}
              >
                One-Time Slots
              </h3>
              <table style={{ width: '100%', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: '#f5f8fa' }}>
                    <th style={{ fontWeight: 'bold', padding: 7 }}>Date</th>
                    <th style={{ fontWeight: 'bold', padding: 7 }}>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {oneoffSlots
                    .sort((a, b) =>
                      (a.specific_date || '').localeCompare(b.specific_date || '') ||
                      a.start_time.localeCompare(b.start_time),
                    )
                    .map((slot) => (
                      <tr key={slot.id}>
                        <td style={{ padding: 7 }}>
                          {slot.specific_date
                            ? dayjs(slot.specific_date).format('MMM D, YYYY')
                            : null}
                        </td>
                        <td style={{ padding: 7 }}>
                          {slot.start_time} - {slot.end_time}
                        </td>
                        <td style={{ padding: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(slot)}
                            aria-label="Edit Slot"
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setDeleteConfirm(slot.id)}
                            aria-label="Delete"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      <SlotDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSave={handleSlotSave}
        initial={editSlot}
      />

      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        aria-labelledby="confirm-delete-slot"
      >
        <DialogTitle id="confirm-delete-slot">Delete Slot?</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this availability slot?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            color="error"
            variant="contained"
            disabled={loading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
      <Snackbar
        open={!!apiError}
        autoHideDuration={3500}
        onClose={() => setApiError(null)}
        message={apiError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}