import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecurringSchedule } from '../src/lib/availability';
import { findReservationConflict, getTimetableCell, getTimetableSegments, getWeekDateKeys } from '../src/lib/timetable';

const roomId = 'room-a';
const wednesdaySchedule: RecurringSchedule = {
  id: 'schedule-wednesday',
  classroom_id: roomId,
  title: 'Biology 101',
  day_of_week: 3,
  start_time: '09:00',
  end_time: '10:30',
  effective_start: '2026-01-01',
  effective_end: null,
  enabled: true,
};

function getCell(date: string, startMinute: number, schedules = [wednesdaySchedule], exceptions: Parameters<typeof getTimetableCell>[0]['exceptions'] = []) {
  return getTimetableCell({
    classroomId: roomId,
    date,
    startMinute,
    endMinute: startMinute + 30,
    schedules,
    exceptions,
    reservations: [],
    blocks: [],
  });
}

test('weekly date keys run Monday through Sunday in Manila time', () => {
  assert.deepEqual(
    getWeekDateKeys(new Date('2026-10-21T12:00:00+08:00')),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
  );
});

test('weekly timetable marks the scheduled Wednesday slots occupied', () => {
  assert.deepEqual(getCell('2026-10-21', 9 * 60), {
    available: false,
    label: 'Biology 101',
    kind: 'schedule',
  });
  assert.equal(getCell('2026-10-21', 10 * 60).available, false);
  assert.equal(getCell('2026-10-21', 10 * 60 + 30).available, true);
});

test('weekly timetable leaves other weekdays vacant and honors cancellations', () => {
  assert.equal(getCell('2026-10-22', 9 * 60).available, true);
  const cancelled = getCell('2026-10-21', 9 * 60, [wednesdaySchedule], [{
    id: 'exception-1',
    classroom_id: roomId,
    schedule_id: wednesdaySchedule.id,
    exception_date: '2026-10-21',
    type: 'cancelled',
  }]);
  assert.deepEqual(cancelled, { available: true, label: 'Vacant', kind: 'available' });
});

test('approved reservations and room blocks mark intersecting slots occupied', () => {
  const reservationCell = getTimetableCell({
    classroomId: roomId,
    date: '2026-10-20',
    startMinute: 9 * 60,
    endMinute: 9 * 60 + 30,
    schedules: [],
    exceptions: [],
    reservations: [{
      id: 'reservation-1',
      classroom_id: roomId,
      title: 'Faculty meeting',
      starts_at: '2026-10-20T01:15:00.000Z',
      ends_at: '2026-10-20T02:15:00.000Z',
      status: 'approved',
    }],
    blocks: [],
  });
  assert.deepEqual(reservationCell, { available: false, label: 'Faculty meeting', kind: 'reservation' });

  const blockCell = getTimetableCell({
    classroomId: roomId,
    date: '2026-10-20',
    startMinute: 9 * 60,
    endMinute: 9 * 60 + 30,
    schedules: [],
    exceptions: [],
    reservations: [],
    blocks: [{
      id: 'block-1',
      classroom_id: roomId,
      title: 'Maintenance',
      reason: 'Electrical work',
      starts_at: '2026-10-20T01:15:00.000Z',
      ends_at: '2026-10-20T02:15:00.000Z',
    }],
  });
  assert.deepEqual(blockCell, { available: false, label: 'Maintenance', kind: 'block' });
});

test('adjacent half-hour timetable cells merge into compact vertical spans', () => {
  const segments = getTimetableSegments({
    classroomId: roomId,
    date: '2026-10-21',
    startMinute: 8 * 60,
    endMinute: 11 * 60,
    slotSize: 30,
    schedules: [wednesdaySchedule],
    exceptions: [],
    reservations: [],
    blocks: [],
  });

  assert.deepEqual(segments.map(({ startMinute, durationMinutes, kind, label }) => ({
    startMinute,
    durationMinutes,
    kind,
    label,
  })), [
    { startMinute: 8 * 60, durationMinutes: 60, kind: 'available', label: 'Vacant' },
    { startMinute: 9 * 60, durationMinutes: 90, kind: 'schedule', label: 'Biology 101' },
    { startMinute: 10 * 60 + 30, durationMinutes: 30, kind: 'available', label: 'Vacant' },
  ]);
});

test('reservation conflict preview distinguishes schedule, reservation, and room block conflicts', () => {
  const input = {
    classroomId: roomId,
    startsAt: '2026-10-21T01:00:00.000Z',
    endsAt: '2026-10-21T01:30:00.000Z',
    schedules: [wednesdaySchedule],
    exceptions: [],
    reservations: [],
    blocks: [],
  };
  assert.deepEqual(findReservationConflict(input), {
    available: false,
    label: 'Biology 101',
    kind: 'schedule',
  });

  assert.deepEqual(findReservationConflict({
    ...input,
    schedules: [],
    reservations: [{
      id: 'approved-1', classroom_id: roomId, title: 'Approved booking',
      starts_at: '2026-10-21T01:15:00.000Z', ends_at: '2026-10-21T02:00:00.000Z', status: 'approved',
    }],
  }), { available: false, label: 'Approved booking', kind: 'reservation' });

  assert.deepEqual(findReservationConflict({
    ...input,
    schedules: [],
    blocks: [{
      id: 'block-1', classroom_id: roomId, title: 'Maintenance', reason: 'Repair',
      starts_at: '2026-10-21T01:15:00.000Z', ends_at: '2026-10-21T02:00:00.000Z',
    }],
  }), { available: false, label: 'Maintenance', kind: 'block' });
});

test('reservation conflict preview recognizes overnight recurring schedules', () => {
  const overnight: RecurringSchedule = {
    ...wednesdaySchedule,
    day_of_week: 2,
    start_time: '23:00',
    end_time: '01:00',
  };
  assert.deepEqual(findReservationConflict({
    classroomId: roomId,
    startsAt: '2026-10-20T16:15:00.000Z',
    endsAt: '2026-10-20T16:45:00.000Z',
    schedules: [overnight],
    exceptions: [],
    reservations: [],
    blocks: [],
  }), { available: false, label: 'Biology 101', kind: 'schedule' });
});
