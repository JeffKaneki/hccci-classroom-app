import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecurringSchedule } from '../src/lib/availability';
import { findScheduleConflicts } from '../src/lib/scheduleConflicts';

const monday: RecurringSchedule = {
  id: 'existing-monday',
  classroom_id: 'room-1',
  title: 'English 101',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '10:30',
  effective_start: '2026-01-01',
  effective_end: null,
  enabled: true,
};

const propose = (overrides: Partial<Parameters<typeof findScheduleConflicts>[0]['proposed'][number]> = {}) => ({
  dayOfWeek: 1,
  startTime: '10:00',
  endTime: '11:00',
  effectiveStart: '2026-10-19',
  effectiveEnd: null,
  ...overrides,
});

test('detects overlapping weekly use for the same room and weekday', () => {
  assert.deepEqual(findScheduleConflicts({
    classroomId: 'room-1',
    proposed: [propose()],
    schedules: [monday],
  }), [{ dayOfWeek: 1, title: 'English 101', startTime: '09:00', endTime: '10:30' }]);
});

test('allows different days, adjacent times, expired rows, and the row being edited', () => {
  assert.deepEqual(findScheduleConflicts({
    classroomId: 'room-1',
    proposed: [propose({ dayOfWeek: 3, startTime: '10:30' })],
    schedules: [monday],
  }), []);
  assert.deepEqual(findScheduleConflicts({
    classroomId: 'room-1',
    proposed: [propose({ startTime: '10:30' })],
    schedules: [monday],
  }), []);
  assert.deepEqual(findScheduleConflicts({
    classroomId: 'room-1',
    proposed: [propose()],
    schedules: [{ ...monday, effective_end: '2026-10-18' }],
  }), []);
  assert.deepEqual(findScheduleConflicts({
    classroomId: 'room-1',
    proposed: [propose()],
    schedules: [monday],
    excludeScheduleId: monday.id,
  }), []);
});
