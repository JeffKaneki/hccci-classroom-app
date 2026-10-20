export interface RoomIdentifier {
  id: string;
  building: string;
  room_number: string;
}

export function findRoomNumberDuplicate<T extends RoomIdentifier>(
  rooms: T[],
  building: string,
  roomNumber: string,
  excludeRoomId?: string
): T | undefined {
  const normalizedBuilding = building.trim().toLocaleLowerCase();
  const normalizedNumber = roomNumber.trim().toLocaleLowerCase();

  return rooms.find((room) =>
    room.id !== excludeRoomId &&
    room.building.trim().toLocaleLowerCase() === normalizedBuilding &&
    room.room_number.trim().toLocaleLowerCase() === normalizedNumber
  );
}
