import { supabase } from './supabase';
import type { Reservation } from './availability';

export interface UserReport {
  id: string;
  classroom_id: string | null;
  report_type: string;
  details: string;
  status: 'new' | 'in_review' | 'resolved' | 'rejected';
  created_at: string;
}

export interface UserReservation extends Reservation {
  created_at: string;
  created_by: string;
}

async function requireCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Sign in to continue.');
  }
  return data.user;
}

export async function loadMyRequests() {
  const user = await requireCurrentUser();
  const [reservations, reports] = await Promise.all([
    supabase.from('reservations').select('id,classroom_id,title,starts_at,ends_at,status,created_at,created_by').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('reports').select('id,classroom_id,report_type,details,status,created_at').eq('created_by', user.id).order('created_at', { ascending: false }),
  ]);

  const error = reservations.error ?? reports.error;
  if (error) throw new Error(error.message);

  return {
    reservations: (reservations.data ?? []) as UserReservation[],
    reports: (reports.data ?? []) as UserReport[],
  };
}

export async function submitReservation(input: {
  classroomId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  await requireCurrentUser();
  const { error } = await supabase.rpc('request_room_reservation', {
    target_classroom_id: input.classroomId,
    request_title: input.title.trim(),
    requested_starts_at: input.startsAt,
    requested_ends_at: input.endsAt,
  });
  if (error) throw new Error(error.message);
}

export async function submitReport(input: {
  classroomId: string | null;
  reportType: string;
  details: string;
}) {
  const user = await requireCurrentUser();
  const { error } = await supabase.from('reports').insert({
    classroom_id: input.classroomId,
    report_type: input.reportType.trim(),
    details: input.details.trim(),
    created_by: user.id,
    status: 'new',
  });
  if (error) throw new Error(error.message);
}

export async function cancelReservation(reservationId: string) {
  const { error } = await supabase.rpc('cancel_own_reservation', {
    target_reservation_id: reservationId,
  });
  if (error) throw new Error(error.message);
}
