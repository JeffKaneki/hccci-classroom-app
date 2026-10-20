import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Chip, Paragraph, Searchbar, Text, TextInput, Title } from 'react-native-paper';
import { getRoomEvaluation, getRoomUsageLabels, type RoomStatus } from '../../src/lib/availability';
import { loadRoomSnapshot, subscribeToRoomChanges, type RoomSnapshot } from '../../src/lib/roomData';
import { supabase } from '../../src/lib/supabase';
import { findReservationConflict } from '../../src/lib/timetable';

const statusColors: Record<RoomStatus, string> = {
  available: '#0b6d42',
  occupied: '#b3261e',
  upcoming: '#c77d00',
  unavailable: '#4b5563',
};

function manilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toManilaIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<RoomStatus | 'all'>('all');
  const [availabilityDate, setAvailabilityDate] = useState(manilaDateKey);
  const [availabilityStart, setAvailabilityStart] = useState('09:00');
  const [availabilityEnd, setAvailabilityEnd] = useState('10:00');
  const [availabilitySearched, setAvailabilitySearched] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roomSnapshot, userResult] = await Promise.all([
        loadRoomSnapshot(),
        supabase.auth.getUser(),
      ]);
      if (userResult.error || !userResult.data.user) throw new Error(userResult.error?.message ?? 'Sign in to view room availability.');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userResult.data.user.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      setSnapshot(roomSnapshot);
      setIsAdmin(profile?.role === 'admin');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load room availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return subscribeToRoomChanges(() => void refresh());
    }, [refresh])
  );

  const rooms = useMemo(
    () =>
      (snapshot?.classrooms ?? []).map((room) => ({
        ...room,
        evaluation: getRoomEvaluation({
          room,
          schedules: snapshot?.schedules ?? [],
          blocks: snapshot?.blocks ?? [],
          reservations: snapshot?.reservations ?? [],
          exceptions: snapshot?.exceptions ?? [],
          date: new Date(),
        }),
      })),
    [snapshot]
  );

  const summary = useMemo(() => {
    const counts = { available: 0, occupied: 0, upcoming: 0, unavailable: 0 };
    rooms.forEach((room) => {
      counts[room.evaluation.status] += 1;
    });
    return counts;
  }, [rooms]);

  const visibleRooms = rooms.filter((room) => {
    const matchesSearch = `${room.name} ${room.room_number} ${room.building}`.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && (selectedStatus === 'all' || room.evaluation.status === selectedStatus);
  });

  const availabilityResults = useMemo(() => {
    if (!availabilitySearched || !snapshot || !validDateKey(availabilityDate) || !validTime(availabilityStart) || !validTime(availabilityEnd)) return [];
    const startsAt = toManilaIso(availabilityDate, availabilityStart);
    const endsAt = toManilaIso(availabilityDate, availabilityEnd);
    if (new Date(endsAt) <= new Date(startsAt)) return [];
    return snapshot.classrooms.filter((room) => !findReservationConflict({
      classroomId: room.id,
      startsAt,
      endsAt,
      schedules: snapshot.schedules,
      exceptions: snapshot.exceptions,
      reservations: snapshot.reservations,
      blocks: snapshot.blocks,
    })).map((room) => ({
      ...room,
      startsAt,
      endsAt,
    }));
  }, [availabilityDate, availabilityEnd, availabilitySearched, availabilityStart, snapshot]);

  const findAvailableRooms = () => {
    setAvailabilityError('');
    if (!validDateKey(availabilityDate) || !validTime(availabilityStart) || !validTime(availabilityEnd)) {
      setAvailabilitySearched(false);
      setAvailabilityError('Use date YYYY-MM-DD and 24-hour times HH:MM.');
      return;
    }
    if (toManilaIso(availabilityDate, availabilityEnd) <= toManilaIso(availabilityDate, availabilityStart)) {
      setAvailabilitySearched(false);
      setAvailabilityError('The end time must be after the start time.');
      return;
    }
    setAvailabilitySearched(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Good day</Text>
          <Title>HCCCI Campus Overview</Title>
        </View>
        {isAdmin ? <Link href="/admin" asChild><Button mode="outlined">Admin</Button></Link> : null}
      </View>

      <Searchbar
        placeholder="Search classrooms"
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.search}
      />

      <Card style={styles.finderCard}>
        <Card.Content>
          <Text style={styles.finderTitle}>Find a free room</Text>
          <Text style={styles.finderHint}>See only rooms available for your meeting time.</Text>
          <View style={styles.finderInputs}>
            <TextInput label="Date (YYYY-MM-DD)" mode="outlined" value={availabilityDate} onChangeText={setAvailabilityDate} style={styles.dateInput} />
            <View style={styles.timeInputRow}>
              <TextInput label="Start (HH:MM)" mode="outlined" value={availabilityStart} onChangeText={setAvailabilityStart} style={styles.timeInput} />
              <TextInput label="End (HH:MM)" mode="outlined" value={availabilityEnd} onChangeText={setAvailabilityEnd} style={styles.timeInput} />
            </View>
          </View>
          {availabilityError ? <Text style={styles.error}>{availabilityError}</Text> : null}
          <Button style={styles.finderButton} mode="contained" icon="magnify" onPress={findAvailableRooms}>Find available rooms</Button>
          {availabilitySearched ? (
            availabilityResults.length ? <>
              <Text style={styles.resultSummary}>{availabilityResults.length} room{availabilityResults.length === 1 ? '' : 's'} available</Text>
              {availabilityResults.map((room) => <View key={room.id} style={styles.resultRow}>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultTitle}>{room.name}</Text>
                  <Text style={styles.metaText}>{room.building} · {room.room_number} · Capacity {room.capacity}</Text>
                </View>
                <Link href={{ pathname: '/(tabs)/requests', params: { roomId: room.id, mode: 'reservation', date: availabilityDate, startTime: availabilityStart, endTime: availabilityEnd } }} asChild>
                  <Button compact mode="outlined">Request</Button>
                </Link>
              </View>)}
            </> : <Text style={styles.emptyResult}>No rooms are available for that time.</Text>
          ) : null}
        </Card.Content>
      </Card>

      <View style={styles.cardGrid}>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text>{snapshot?.classrooms.length ?? 0}</Text>
            <Paragraph>Total active rooms</Paragraph>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text>{summary.available}</Text>
            <Paragraph>Available</Paragraph>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text>{summary.occupied}</Text>
            <Paragraph>Occupied</Paragraph>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text>{summary.unavailable}</Text>
            <Paragraph>Unavailable</Paragraph>
          </Card.Content>
        </Card>
      </View>

      <View style={styles.pillRow}>
        <Chip selected={selectedStatus === 'all'} onPress={() => setSelectedStatus('all')}>All</Chip>
        <Chip selected={selectedStatus === 'available'} onPress={() => setSelectedStatus('available')}>Available</Chip>
        <Chip selected={selectedStatus === 'occupied'} onPress={() => setSelectedStatus('occupied')}>Occupied</Chip>
        <Chip selected={selectedStatus === 'upcoming'} onPress={() => setSelectedStatus('upcoming')}>Upcoming</Chip>
        <Chip selected={selectedStatus === 'unavailable'} onPress={() => setSelectedStatus('unavailable')}>Unavailable</Chip>
      </View>

      {loading ? <ActivityIndicator style={styles.state} /> : null}
      {error ? <Card style={styles.roomCard}><Card.Content><Text>{error}</Text><Button onPress={() => void refresh()}>Retry</Button></Card.Content></Card> : null}
      {!loading && !error && visibleRooms.length === 0 ? <Text style={styles.state}>No matching active classrooms.</Text> : null}

      {visibleRooms.map((room) => (
        <Card key={room.id} style={styles.roomCard}>
          <Card.Content>
            <Link href={{ pathname: '/room/[id]', params: { id: room.id } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`Open weekly timetable for ${room.name}`} style={styles.roomHeader}>
                <View>
                  <Text style={styles.roomTitle}>{room.name}</Text>
                  <Text>{room.building} • Floor {room.floor}</Text>
                  <Text style={styles.timetableLink}>Open weekly timetable</Text>
                </View>
                <Text style={[styles.statusLabel, { color: statusColors[room.evaluation.status] }]}>{room.evaluation.status}</Text>
              </Pressable>
            </Link>
            <Paragraph>{room.evaluation.reason}</Paragraph>
            <Paragraph style={styles.metaText}>Weekly use: {getRoomUsageLabels(snapshot?.schedules ?? [], room.id).join(' · ') || 'No recurring schedule'}</Paragraph>
            <Paragraph style={styles.metaText}>Next: {room.evaluation.nextAvailableAt ? new Date(room.evaluation.nextAvailableAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No upcoming event'}</Paragraph>
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  search: {
    marginTop: 8,
  },
  finderCard: { borderRadius: 14, backgroundColor: '#eef6f3' },
  finderTitle: { color: '#17272d', fontSize: 18, fontWeight: '700' },
  finderHint: { color: '#53616a', marginTop: 4, marginBottom: 10 },
  finderInputs: { gap: 8, marginBottom: 4 },
  dateInput: { width: '100%' },
  timeInputRow: { flexDirection: 'row', gap: 8 },
  timeInput: { flex: 1, minWidth: 0 },
  finderButton: { marginTop: 4 },
  error: { color: '#b3261e', marginBottom: 8 },
  resultSummary: { color: '#0b6d42', fontWeight: '700', marginTop: 14 },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c8d9d4', paddingVertical: 10 },
  resultInfo: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#17272d', fontWeight: '700' },
  emptyResult: { color: '#53616a', marginTop: 14 },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    borderRadius: 14,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomCard: {
    borderRadius: 16,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  timetableLink: {
    marginTop: 4,
    color: '#176a64',
    fontSize: 12,
    fontWeight: '600',
  },
  statusLabel: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  metaText: {
    marginTop: 8,
    color: '#475569',
  },
  state: {
    marginTop: 12,
  },
});
