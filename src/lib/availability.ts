export type RoomStatus = 'available' | 'occupied' | 'upcoming' | 'unavailable';

export interface Course {
  id: string;
  code: string;
  year: number;
  active: boolean;
}

export interface Classroom {
  id: string;
  name: string;
  room_number: string;
  building: string;
  floor: string;
  capacity: number;
  description?: string;
  amenities: string[];
  active: boolean;
}

export interface RecurringSchedule {
  id: string;
  classroom_id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_start: string;
  effective_end?: string | null;
  enabled: boolean;
  course_id?: string | null;
  notes?: string | null;
}

export interface RoomBlock {
  id: string;
  classroom_id: string;
  title: string;
  reason: string;
  starts_at: string;
  ends_at: string;
}

export interface ScheduleException {
  id: string;
  classroom_id: string;
  schedule_id?: string | null;
  exception_date: string;
  type: 'cancelled' | 'modified' | 'holiday' | 'special_appointment';
  notes?: string | null;
}

export interface Reservation {
  id: string;
  classroom_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

export interface RoomEvaluation {
  status: RoomStatus;
  reason: string;
  currentClass?: string;
  nextAvailableAt?: Date | null;
  nextEvent?: {
    title: string;
    start: Date;
    end: Date;
    kind: 'schedule' | 'reservation' | 'block';
  };
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function normalizeDate(date: Date): Date {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return copy;
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function dateInManila(date: Date = new Date()): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
}

export function getRoomUsageLabels(
  schedules: RecurringSchedule[],
  classroomId: string,
  date: Date = new Date()
): string[] {
  const localDate = dateInManila(date);
  const dateKey = [
    localDate.getFullYear(),
    String(localDate.getMonth() + 1).padStart(2, '0'),
    String(localDate.getDate()).padStart(2, '0'),
  ].join('-');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return schedules
    .filter((schedule) =>
      schedule.classroom_id === classroomId &&
      schedule.enabled &&
      (!schedule.effective_end || schedule.effective_end >= dateKey)
    )
    .sort((left, right) => left.day_of_week - right.day_of_week || left.start_time.localeCompare(right.start_time))
    .map((schedule) => {
      const start = schedule.start_time.padStart(5, '0');
      const end = schedule.end_time.padStart(5, '0');
      return `${dayNames[schedule.day_of_week]} ${start}-${end} · ${schedule.title}`;
    });
}

export function isScheduleActiveOnDate(schedule: RecurringSchedule, date: Date): boolean {
  if (!schedule.enabled) {
    return false;
  }

  const day = date.getDay();
  if (schedule.day_of_week !== day) {
    return false;
  }

  const startDate = new Date(`${schedule.effective_start}T00:00:00`);
  const endDate = schedule.effective_end ? new Date(`${schedule.effective_end}T23:59:59`) : null;

  if (date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

export function isNowInsideSchedule(schedule: RecurringSchedule, date: Date): boolean {
  if (!isScheduleActiveOnDate(schedule, date)) {
    return false;
  }

  const startMinutes = minutesFromTime(schedule.start_time);
  let endMinutes = minutesFromTime(schedule.end_time);
  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const adjustedNow = nowMinutes >= startMinutes ? nowMinutes : nowMinutes + 24 * 60;
  const adjustedStart = startMinutes;

  return adjustedNow >= adjustedStart && adjustedNow < endMinutes;
}

export function getNextScheduleEvent(
  schedules: RecurringSchedule[],
  date: Date,
  exceptions: ScheduleException[] = []
): { title: string; start: Date; end: Date } | null {
  const localDate = dateInManila(date);

  let nextEvent: { title: string; start: Date; end: Date } | null = null;

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;

    const startDate = new Date(`${schedule.effective_start}T00:00:00`);
    const endDate = schedule.effective_end ? new Date(`${schedule.effective_end}T23:59:59`) : null;

    for (let offset = 0; offset <= 7; offset += 1) {
      const candidateDate = addDays(localDate, offset);
      if (candidateDate < startDate || (endDate && candidateDate > endDate)) continue;
      if (candidateDate.getDay() !== schedule.day_of_week) continue;
      const exceptionDate = [
        candidateDate.getFullYear(),
        String(candidateDate.getMonth() + 1).padStart(2, '0'),
        String(candidateDate.getDate()).padStart(2, '0'),
      ].join('-');
      const isExcepted = exceptions.some((exception) =>
        exception.exception_date === exceptionDate &&
        (exception.schedule_id == null || exception.schedule_id === schedule.id) &&
        (exception.type === 'cancelled' || exception.type === 'holiday')
      );
      if (isExcepted) continue;

      const candidateStart = new Date(candidateDate);
      const [startHour, startMinute] = schedule.start_time.split(':').map(Number);
      candidateStart.setHours(startHour, startMinute, 0, 0);

      const [endHour, endMinute] = schedule.end_time.split(':').map(Number);
      const candidateEnd = new Date(candidateDate);
      candidateEnd.setHours(endHour, endMinute, 0, 0);
      if (candidateEnd <= candidateStart) candidateEnd.setDate(candidateEnd.getDate() + 1);

      const withinWindow = candidateStart > localDate && candidateStart.getTime() - localDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
      if (!withinWindow) continue;

      if (!nextEvent || candidateStart < nextEvent.start) {
        nextEvent = { title: schedule.title, start: candidateStart, end: candidateEnd };
      }
    }
  }

  return nextEvent;
}

export function getRoomEvaluation({
  room,
  schedules,
  blocks,
  reservations,
  exceptions = [],
  date = new Date(),
}: {
  room: Classroom;
  schedules: RecurringSchedule[];
  blocks: RoomBlock[];
  reservations: Reservation[];
  exceptions?: ScheduleException[];
  date?: Date;
}): RoomEvaluation {
  const localDate = dateInManila(date);
  const roomBlocks = blocks.filter((block) => block.classroom_id === room.id);

  const activeBlock = roomBlocks.find((block) => {
    const start = new Date(block.starts_at);
    const end = new Date(block.ends_at);
    return localDate >= start && localDate < end;
  });

  if (activeBlock) {
    return {
      status: 'unavailable',
      reason: `Blocked: ${activeBlock.reason || activeBlock.title}`,
      currentClass: activeBlock.title,
      nextAvailableAt: new Date(activeBlock.ends_at),
    };
  }

  const roomReservations = reservations.filter((reservation) => reservation.classroom_id === room.id && reservation.status === 'approved');
  const activeReservation = roomReservations.find((reservation) => {
    const start = new Date(reservation.starts_at);
    const end = new Date(reservation.ends_at);
    return localDate >= start && localDate < end;
  });

  if (activeReservation) {
    return {
      status: 'occupied',
      reason: `Reserved: ${activeReservation.title}`,
      currentClass: activeReservation.title,
      nextAvailableAt: new Date(activeReservation.ends_at),
    };
  }

  const roomExceptions = exceptions.filter((exception) => exception.classroom_id === room.id);
  const roomSchedules = schedules.filter((schedule) => schedule.classroom_id === room.id);
  const relevantSchedules = roomSchedules.filter((schedule) => {
    if (!isScheduleActiveOnDate(schedule, localDate)) return false;
    const today = [
      localDate.getFullYear(),
      String(localDate.getMonth() + 1).padStart(2, '0'),
      String(localDate.getDate()).padStart(2, '0'),
    ].join('-');
    return !roomExceptions.some((exception) =>
      exception.exception_date === today &&
      (exception.schedule_id == null || exception.schedule_id === schedule.id) &&
      (exception.type === 'cancelled' || exception.type === 'holiday')
    );
  });

  const activeSchedule = relevantSchedules.find((schedule) => isNowInsideSchedule(schedule, localDate));
  if (activeSchedule) {
    const [endHour, endMinute] = activeSchedule.end_time.split(':').map(Number);
    const endDate = new Date(localDate);
    endDate.setHours(endHour, endMinute, 0, 0);

    return {
      status: 'occupied',
      reason: `${activeSchedule.title} in progress`,
      currentClass: activeSchedule.title,
      nextAvailableAt: endDate,
    };
  }

  const nextEvent = getNextScheduleEvent(roomSchedules, localDate, roomExceptions);
  if (nextEvent && nextEvent.start.getTime() - localDate.getTime() <= 24 * 60 * 60 * 1000) {
    return {
      status: 'upcoming',
      reason: `Upcoming: ${nextEvent.title}`,
      currentClass: nextEvent.title,
      nextAvailableAt: nextEvent.start,
      nextEvent: {
        title: nextEvent.title,
        start: nextEvent.start,
        end: nextEvent.end,
        kind: 'schedule',
      },
    };
  }

  return {
    status: 'available',
    reason: 'Available',
    nextAvailableAt: nextEvent?.start ?? null,
  };
}
