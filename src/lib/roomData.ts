import { supabase } from './supabase';
import type { Classroom, RecurringSchedule, Reservation, RoomBlock, ScheduleException } from './availability';
import { getWeekDateKeys } from './timetable';

export interface RoomSnapshot {
  classrooms: Classroom[];
  schedules: RecurringSchedule[];
  blocks: RoomBlock[];
  reservations: Reservation[];
  exceptions: ScheduleException[];
}

const snapshotCacheMs = 15_000;
let cachedSnapshot: RoomSnapshot | null = null;
let cachedAt = 0;
let pendingSnapshot: Promise<RoomSnapshot> | null = null;

export async function loadRoomSnapshot(forceRefresh = false): Promise<RoomSnapshot> {
  if (!forceRefresh && cachedSnapshot && Date.now() - cachedAt < snapshotCacheMs) return cachedSnapshot;
  if (pendingSnapshot) return pendingSnapshot;

  const weekStart = `${getWeekDateKeys()[0]}T00:00:00+08:00`;
  const weekStartIso = new Date(weekStart).toISOString();
  const weekStartDate = weekStart.slice(0, 10);
  pendingSnapshot = Promise.all([
    supabase.from('classrooms').select('id,name,room_number,building,floor,capacity,description,amenities,active').eq('active', true).order('building').order('room_number'),
    supabase.from('recurring_schedules').select('id,classroom_id,title,day_of_week,start_time,end_time,effective_start,effective_end,enabled,notes').eq('enabled', true),
    supabase.from('room_blocks').select('id,classroom_id,title,reason,starts_at,ends_at').gte('ends_at', weekStartIso),
    supabase.rpc('get_approved_reservations', { week_start: weekStartIso }),
    supabase.from('schedule_exceptions').select('id,classroom_id,schedule_id,exception_date,type,notes').gte('exception_date', weekStartDate),
  ]).then(([classrooms, schedules, blocks, reservations, exceptions]) => {
    const firstError = classrooms.error ?? schedules.error ?? blocks.error ?? reservations.error ?? exceptions.error;
    if (firstError) throw new Error(firstError.message);

    const snapshot = {
      classrooms: (classrooms.data ?? []) as Classroom[],
      schedules: (schedules.data ?? []) as RecurringSchedule[],
      blocks: (blocks.data ?? []) as RoomBlock[],
      reservations: (reservations.data ?? []) as Reservation[],
      exceptions: (exceptions.data ?? []) as ScheduleException[],
    };
    cachedSnapshot = snapshot;
    cachedAt = Date.now();
    return snapshot;
  }).finally(() => {
    pendingSnapshot = null;
  });

  return pendingSnapshot;
}

export function subscribeToRoomChanges(onChange: () => void) {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    cachedSnapshot = null;
    cachedAt = 0;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(onChange, 250);
  };
  const channel = supabase
    .channel('room-availability-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_schedules' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_exceptions' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_blocks' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, scheduleRefresh)
    .subscribe();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    void supabase.removeChannel(channel);
  };
}