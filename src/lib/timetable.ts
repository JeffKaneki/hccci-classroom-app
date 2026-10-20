import type { Reservation, RoomBlock, RecurringSchedule, ScheduleException } from './availability';

export interface TimetableCell {
  available: boolean;
  label: string;
  kind: 'available' | 'schedule' | 'reservation' | 'block';
}

export interface TimetableSegment extends TimetableCell {
  startMinute: number;
  durationMinutes: number;
}

function dateKeyInManila(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function timeMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function weekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function occursDuringSlot(
  eventDate: string,
  startTime: string,
  endTime: string,
  slotDate: string,
  slotStartMinute: number,
  slotEndMinute: number
): boolean {
  const eventStartMinute = timeMinutes(startTime);
  let eventEndMinute = timeMinutes(endTime);
  if (eventEndMinute <= eventStartMinute) eventEndMinute += 24 * 60;

  const slotDateOffset = Math.round(
    (new Date(`${slotDate}T00:00:00Z`).getTime() - new Date(`${eventDate}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000)
  );
  const absoluteSlotStart = slotDateOffset * 24 * 60 + slotStartMinute;
  const absoluteSlotEnd = slotDateOffset * 24 * 60 + slotEndMinute;
  return absoluteSlotStart < eventEndMinute && absoluteSlotEnd > eventStartMinute;
}

export function getWeekDateKeys(anchor: Date = new Date()): string[] {
  const today = dateKeyInManila(anchor);
  const dayOfWeek = weekday(today);
  const monday = shiftDateKey(today, -((dayOfWeek + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index));
}

export function getTimetableCell({
  classroomId,
  date,
  startMinute,
  endMinute,
  schedules,
  exceptions,
  reservations,
  blocks,
}: {
  classroomId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  schedules: RecurringSchedule[];
  exceptions: ScheduleException[];
  reservations: Reservation[];
  blocks: RoomBlock[];
}): TimetableCell {
  const slotStart = new Date(`${date}T${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}:00+08:00`);
  const slotEnd = new Date(`${date}T${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}:00+08:00`);

  const block = blocks.find((item) =>
    item.classroom_id === classroomId &&
    new Date(item.starts_at) < slotEnd &&
    new Date(item.ends_at) > slotStart
  );
  if (block) return { available: false, label: block.title, kind: 'block' };

  const reservation = reservations.find((item) =>
    item.classroom_id === classroomId &&
    item.status === 'approved' &&
    new Date(item.starts_at) < slotEnd &&
    new Date(item.ends_at) > slotStart
  );
  if (reservation) return { available: false, label: reservation.title, kind: 'reservation' };

  const schedule = schedules.find((item) => {
    if (item.classroom_id !== classroomId || !item.enabled) return false;

    return [date, shiftDateKey(date, -1)].some((eventDate) => {
      const eventWeekday = weekday(eventDate);
      if (item.day_of_week !== eventWeekday) return false;
      if (eventDate < item.effective_start || (item.effective_end && eventDate > item.effective_end)) return false;
      const hasCancellation = exceptions.some((exception) =>
        exception.classroom_id === classroomId &&
        exception.exception_date === eventDate &&
        (exception.schedule_id == null || exception.schedule_id === item.id) &&
        (exception.type === 'cancelled' || exception.type === 'holiday')
      );
      return !hasCancellation && occursDuringSlot(eventDate, item.start_time, item.end_time, date, startMinute, endMinute);
    });
  });
  if (schedule) return { available: false, label: schedule.title, kind: 'schedule' };

  return { available: true, label: 'Vacant', kind: 'available' };
}

export function findReservationConflict({
  classroomId,
  startsAt,
  endsAt,
  schedules,
  exceptions,
  reservations,
  blocks,
}: {
  classroomId: string;
  startsAt: string;
  endsAt: string;
  schedules: RecurringSchedule[];
  exceptions: ScheduleException[];
  reservations: Reservation[];
  blocks: RoomBlock[];
}): TimetableCell | null {
  const proposedStart = new Date(startsAt);
  const proposedEnd = new Date(endsAt);
  if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime()) || proposedEnd <= proposedStart) return null;

  const block = blocks.find((item) =>
    item.classroom_id === classroomId &&
    new Date(item.starts_at) < proposedEnd &&
    new Date(item.ends_at) > proposedStart
  );
  if (block) return { available: false, label: block.title, kind: 'block' };

  const reservation = reservations.find((item) =>
    item.classroom_id === classroomId &&
    item.status === 'approved' &&
    new Date(item.starts_at) < proposedEnd &&
    new Date(item.ends_at) > proposedStart
  );
  if (reservation) return { available: false, label: reservation.title, kind: 'reservation' };

  const firstDate = shiftDateKey(dateKeyInManila(proposedStart), -1);
  const lastDate = dateKeyInManila(new Date(proposedEnd.getTime() - 1));
  const dayCount = Math.round((new Date(`${lastDate}T00:00:00Z`).getTime() - new Date(`${firstDate}T00:00:00Z`).getTime()) / 86_400_000);

  for (let offset = 0; offset <= dayCount; offset += 1) {
    const eventDate = shiftDateKey(firstDate, offset);
    const eventDay = weekday(eventDate);
    for (const schedule of schedules) {
      if (
        schedule.classroom_id !== classroomId ||
        !schedule.enabled ||
        schedule.day_of_week !== eventDay ||
        eventDate < schedule.effective_start ||
        (schedule.effective_end && eventDate > schedule.effective_end)
      ) continue;

      const cancelled = exceptions.some((exception) =>
        exception.classroom_id === classroomId &&
        exception.exception_date === eventDate &&
        (exception.schedule_id == null || exception.schedule_id === schedule.id) &&
        (exception.type === 'cancelled' || exception.type === 'holiday')
      );
      if (cancelled) continue;

      const scheduleStart = new Date(`${eventDate}T${schedule.start_time.slice(0, 5)}:00+08:00`);
      const scheduleEndDate = timeMinutes(schedule.end_time) <= timeMinutes(schedule.start_time)
        ? shiftDateKey(eventDate, 1)
        : eventDate;
      const scheduleEnd = new Date(`${scheduleEndDate}T${schedule.end_time.slice(0, 5)}:00+08:00`);
      if (scheduleStart < proposedEnd && scheduleEnd > proposedStart) {
        return { available: false, label: schedule.title, kind: 'schedule' };
      }
    }
  }

  return null;
}

export function getTimetableSegments({
  classroomId,
  date,
  startMinute,
  endMinute,
  slotSize,
  schedules,
  exceptions,
  reservations,
  blocks,
}: {
  classroomId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  slotSize: number;
  schedules: RecurringSchedule[];
  exceptions: ScheduleException[];
  reservations: Reservation[];
  blocks: RoomBlock[];
}): TimetableSegment[] {
  const segments: TimetableSegment[] = [];
  for (let minute = startMinute; minute < endMinute; minute += slotSize) {
    const cell = getTimetableCell({
      classroomId,
      date,
      startMinute: minute,
      endMinute: minute + slotSize,
      schedules,
      exceptions,
      reservations,
      blocks,
    });
    const previous = segments.at(-1);
    if (previous && previous.available === cell.available && previous.label === cell.label && previous.kind === cell.kind) {
      previous.durationMinutes += slotSize;
    } else {
      segments.push({ ...cell, startMinute: minute, durationMinutes: slotSize });
    }
  }
  return segments;
}
