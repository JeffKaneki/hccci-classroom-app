import assert from 'node:assert/strict';
import test from 'node:test';

import { findRoomNumberDuplicate } from '../src/lib/roomValidation';

const rooms = [
  { id: 'room-a', name: 'Room 101', building: 'Main Building', room_number: '101' },
  { id: 'room-b', name: 'Room 101', building: 'Science Wing', room_number: '101' },
];

test('detects duplicate room numbers within the same building case-insensitively', () => {
  assert.equal(findRoomNumberDuplicate(rooms, ' main building ', ' 101 ')?.id, 'room-a');
});

test('allows the same room number in another building and excludes the edited row', () => {
  assert.equal(findRoomNumberDuplicate(rooms, 'Arts Building', '101'), undefined);
  assert.equal(findRoomNumberDuplicate(rooms, 'Main Building', '101', 'room-a'), undefined);
});
