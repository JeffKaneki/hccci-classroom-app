import assert from 'node:assert/strict';
import test from 'node:test';

import type { Classroom, RecurringSchedule, RoomBlock } from '../src/lib/availability';
import {
  getRoomEvaluation,
  getRoomUsageLabels,
  isNowInsideSchedule,
  isScheduleActiveOnDate,
} from '../src/lib/availability';

const room: Classroom = {
  id: 'room-101',
  name: 'Room 101',
  room_number: '101',
  building: 'Main Building',
  floor: '2',
  capacity: 40,
  description: 'Lecture room',
  amenities: ['projector'],
  active: true,
};

const mondaySchedule: RecurringSchedule = {
  id: 'sched-101',
  classroom_id: 'room-101',
  title: 'English 101',
  day_of_week: 1,
  start_time: '08:00',
  end_time: '10:00',
  effective_start: '2024-01-01',
  effective_end: '2030-12-31',
  enabled: true,
};

test('schedule is active within its valid range', () => {
  const monday = new Date('2026-10-19T09:00:00');
  assert.equal(isScheduleActiveOnDate(mondaySchedule, monday), true);
  assert.equal(isNowInsideSchedule(mondaySchedule, monday), true);
});

test('room becomes available at the scheduled end boundary', () => {
  const exactBoundary = new Date('2026-10-19T10:00:00');
  assert.equal(isNowInsideSchedule(mondaySchedule, exactBoundary), false);

  const evaluation = getRoomEvaluation({
    room,
    schedules: [mondaySchedule],
    blocks: [],
    reservations: [],
    date: exactBoundary,
  });

  assert.equal(evaluation.status, 'available');
  assert.equal(evaluation.reason, 'Available');
});

test('a disabled schedule does not affect availability', () => {
  const disabled: RecurringSchedule = { ...mondaySchedule, id: 'disabled', enabled: false };
  const evaluation = getRoomEvaluation({
    room,
    schedules: [disabled],
    blocks: [],
    reservations: [],
    date: new Date('2026-10-19T09:00:00'),
  });

  assert.equal(evaluation.status, 'available');
});

test('expired schedules no longer block the room', () => {
  const expired: RecurringSchedule = {
    ...mondaySchedule,
    id: 'expired',
    effective_end: '2025-12-31',
  };

  const evaluation = getRoomEvaluation({
    room,
    schedules: [expired],
    blocks: [],
    reservations: [],
    date: new Date('2026-10-19T09:00:00'),
  });

  assert.equal(evaluation.status, 'available');
});

test('room closures override ordinary class schedules', () => {
  const maintenance: RoomBlock = {
    id: 'block-1',
    classroom_id: 'room-101',
    title: 'Maintenance',
    reason: 'Electrical inspection',
    starts_at: '2026-10-19T08:30:00',
    ends_at: '2026-10-19T11:00:00',
  };

  const evaluation = getRoomEvaluation({
    room,
    schedules: [mondaySchedule],
    blocks: [maintenance],
    reservations: [],
    date: new Date('2026-10-19T09:00:00'),
  });

  assert.equal(evaluation.status, 'unavailable');
  assert.match(evaluation.reason, /Electrical inspection|Maintenance/);
});

test('cancelled class date makes the room available', () => {
  const evaluation = getRoomEvaluation({
    room,
    schedules: [mondaySchedule],
    blocks: [],
    reservations: [],
    exceptions: [{
      id: 'exception-1',
      classroom_id: room.id,
      schedule_id: mondaySchedule.id,
      exception_date: '2026-10-19',
      type: 'cancelled',
    }],
    date: new Date('2026-10-19T09:00:00'),
  });

  assert.equal(evaluation.status, 'available');
  assert.equal(evaluation.reason, 'Available');
});

test('dashboard finds the next weekday schedule when there is no class today', () => {
  const tuesdaySchedule: RecurringSchedule = {
    ...mondaySchedule,
    id: 'sched-tuesday',
    title: 'Biology 101',
    day_of_week: 2,
  };
  const evaluation = getRoomEvaluation({
    room,
    schedules: [tuesdaySchedule],
    blocks: [],
    reservations: [],
    date: new Date('2026-10-19T14:00:00'),
  });

  assert.equal(evaluation.status, 'upcoming');
  assert.equal(evaluation.nextEvent?.title, 'Biology 101');
});

test('room usage labels show multiple scheduled weekdays in order', () => {
  const wednesdaySchedule: RecurringSchedule = {
    ...mondaySchedule,
    id: 'sched-wednesday',
    title: 'Biology 101',
    day_of_week: 3,
    start_time: '13:00',
    end_time: '15:00',
  };

  assert.deepEqual(
    getRoomUsageLabels([wednesdaySchedule, mondaySchedule], room.id, new Date('2026-10-19T12:00:00')),
    ['Mon 08:00-10:00 · English 101', 'Wed 13:00-15:00 · Biology 101']
  );
});
