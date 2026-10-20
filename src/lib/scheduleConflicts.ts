import type { RecurringSchedule } from './availability';

export interface ProposedSchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveStart: string;
  effectiveEnd: string | null;
}

export interface ScheduleConflict {
  dayOfWeek: number;
  title: string;
  startTime: string;
  endTime: string;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

export function findScheduleConflicts({
  classroomId,
  proposed,
  schedules,
  excludeScheduleId,
}: {
  classroomId: string;
  proposed: ProposedSchedule[];
  schedules: RecurringSchedule[];
  excludeScheduleId?: string;
}): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const candidate of proposed) {
    const candidateStart = timeToMinutes(candidate.startTime);
    let candidateEnd = timeToMinutes(candidate.endTime);
    if (candidateEnd <= candidateStart) candidateEnd += 24 * 60;

    for (const existing of schedules) {
      if (
        existing.classroom_id !== classroomId ||
        !existing.enabled ||
        existing.id === excludeScheduleId ||
        existing.day_of_week !== candidate.dayOfWeek
      ) continue;

      const effectiveStart = existing.effective_start > candidate.effectiveStart
        ? existing.effective_start
        : candidate.effectiveStart;
      const effectiveEnd = existing.effective_end && candidate.effectiveEnd
        ? (existing.effective_end < candidate.effectiveEnd ? existing.effective_end : candidate.effectiveEnd)
        : existing.effective_end ?? candidate.effectiveEnd;
      if (effectiveEnd && effectiveEnd < effectiveStart) continue;

      const existingStart = timeToMinutes(existing.start_time);
      let existingEnd = timeToMinutes(existing.end_time);
      if (existingEnd <= existingStart) existingEnd += 24 * 60;

      if (rangesOverlap(candidateStart, candidateEnd, existingStart, existingEnd)) {
        conflicts.push({
          dayOfWeek: candidate.dayOfWeek,
          title: existing.title,
          startTime: existing.start_time.slice(0, 5),
          endTime: existing.end_time.slice(0, 5),
        });
      }
    }
  }

  return conflicts;
}