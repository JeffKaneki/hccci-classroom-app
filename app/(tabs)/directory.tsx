import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Searchbar, Text, Title } from 'react-native-paper';
import { getRoomEvaluation, getRoomUsageLabels } from '../../src/lib/availability';
import { loadRoomSnapshot, subscribeToRoomChanges, type RoomSnapshot } from '../../src/lib/roomData';

export default function DirectoryScreen() {
  const [query, setQuery] = useState('');
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(await loadRoomSnapshot());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load classrooms.');
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

  const rooms = useMemo(() => {
    const filtered = (snapshot?.classrooms ?? []).filter((room) => {
      const text = `${room.name} ${room.room_number} ${room.building}`.toLowerCase();
      return text.includes(query.toLowerCase());
    });

    return filtered.map((room) => ({
      ...room,
      evaluation: getRoomEvaluation({
        room,
        schedules: snapshot?.schedules ?? [],
        blocks: snapshot?.blocks ?? [],
        reservations: snapshot?.reservations ?? [],
        exceptions: snapshot?.exceptions ?? [],
      }),
    }));
  }, [query, snapshot]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Title>Classroom Directory</Title>
      <Searchbar placeholder="Search by room name or building" value={query} onChangeText={setQuery} />

      {loading ? <ActivityIndicator style={styles.state} /> : null}
      {error ? (
        <Card style={styles.stateCard}>
          <Card.Content>
            <Text>{error}</Text>
            <Button onPress={() => void refresh()}>Retry</Button>
          </Card.Content>
        </Card>
      ) : null}
      {!loading && !error && rooms.length === 0 ? <Text style={styles.state}>No active classrooms found.</Text> : null}

      {rooms.map((room) => (
        <Card key={room.id} style={styles.card}>
          <Card.Content>
            <Link href={{ pathname: '/room/[id]', params: { id: room.id } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`Open weekly timetable for ${room.name}`} style={styles.row}>
                <View>
                  <Text style={styles.title}>{room.name}</Text>
                  <Text>{room.building} • {room.floor}</Text>
                  <Text style={styles.timetableLink}>Open weekly timetable</Text>
                </View>
                <Text style={styles.status}>{room.evaluation.status}</Text>
              </Pressable>
            </Link>
            <Text style={styles.meta}>Capacity: {room.capacity}</Text>
            <Text style={styles.meta}>Reason: {room.evaluation.reason}</Text>
            <Text style={styles.meta}>Next available: {room.evaluation.nextAvailableAt ? new Date(room.evaluation.nextAvailableAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}</Text>
            <Text style={styles.meta}>Weekly use: {getRoomUsageLabels(snapshot?.schedules ?? [], room.id).join(' · ') || 'No recurring schedule'}</Text>
            {room.description ? <Text style={styles.meta}>{room.description}</Text> : null}
            <Link href={{ pathname: '/(tabs)/requests', params: { roomId: room.id, mode: 'reservation' } }} asChild>
              <Button mode="contained" style={styles.action}>Request this room</Button>
            </Link>
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
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  status: {
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  timetableLink: {
    marginTop: 4,
    color: '#176a64',
    fontSize: 12,
    fontWeight: '600',
  },
  meta: {
    marginTop: 6,
    color: '#475569',
  },
  state: {
    marginTop: 12,
  },
  stateCard: {
    marginTop: 12,
  },
  action: {
    marginTop: 12,
  },
});
