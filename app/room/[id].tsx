import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { State, PinchGestureHandler, type PinchGestureHandlerGestureEvent, type PinchGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text, Title } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomSnapshot } from '../../src/lib/roomData';
import { loadRoomSnapshot, subscribeToRoomChanges } from '../../src/lib/roomData';
import { getRoomUsageLabels } from '../../src/lib/availability';
import { getTimetableSegments, getWeekDateKeys } from '../../src/lib/timetable';

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const firstMinute = 7 * 60;
const lastMinute = 20 * 60;
const slotSize = 30;
const rowHeight = 21;
const timeColumnWidth = 48;
const dayColumnWidth = 62;
const baseTableWidth = timeColumnWidth * 2 + dayColumnWidth * 7;
const vacantColor = '#0b6d42';
const segmentColors = {
  schedule: '#b3261e',
  reservation: '#1769aa',
  block: '#a84d00',
  available: vacantColor,
} as const;

function formatDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export default function RoomTimetableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: viewportWidth } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const pinchStartZoom = useRef(1);
  const weekDates = useMemo(() => getWeekDateKeys(weekAnchor), [weekAnchor]);
  const fitZoom = Math.min(1, Math.max(0.55, (viewportWidth - 32) / baseTableWidth));
  const tableZoom = zoom === 0 ? fitZoom : zoom;
  const scaledRowHeight = rowHeight * tableZoom;
  const scaledTimeColumnWidth = timeColumnWidth * tableZoom;
  const scaledDayColumnWidth = dayColumnWidth * tableZoom;

  const handlePinchStart = () => {
    pinchStartZoom.current = tableZoom;
  };

  const handlePinch = (event: PinchGestureHandlerGestureEvent) => {
    setZoom(Math.min(1.5, Math.max(0.55, pinchStartZoom.current * event.nativeEvent.scale)));
  };

  const handlePinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      setZoom((currentZoom) => Math.min(1.5, Math.max(0.55, currentZoom)));
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSnapshot(await loadRoomSnapshot());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this room schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    return subscribeToRoomChanges(() => void refresh());
  }, [refresh]));

  const room = snapshot?.classrooms.find((item) => item.id === id);
  const usage = room ? getRoomUsageLabels(snapshot?.schedules ?? [], room.id) : [];
  const rowStarts = useMemo(() => {
    const rows: number[] = [];
    for (let minute = firstMinute; minute < lastMinute; minute += slotSize) rows.push(minute);
    return rows;
  }, []);
  const daySegments = useMemo(() => {
    if (!snapshot || !room) return [];
    return weekDates.map((date) => getTimetableSegments({
      classroomId: room.id,
      date,
      startMinute: firstMinute,
      endMinute: lastMinute,
      slotSize,
      schedules: snapshot.schedules,
      exceptions: snapshot.exceptions,
      reservations: snapshot.reservations,
      blocks: snapshot.blocks,
    }));
  }, [room, snapshot, weekDates]);

  const changeWeek = (amount: number) => {
    setWeekAnchor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: room?.name ?? 'Room timetable', headerShown: false }} />
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <View style={styles.topBar}>
          <Link href="/(tabs)/directory" asChild><Button icon="arrow-left">Directory</Button></Link>
          <Link href={{ pathname: '/(tabs)/requests', params: { roomId: id, mode: 'reservation' } }} asChild>
            <Button mode="contained" icon="calendar-plus">Request room</Button>
          </Link>
        </View>

        {loading ? <ActivityIndicator style={styles.loading} /> : null}
        {error ? <Card style={styles.message}><Card.Content><Text>{error}</Text><Button onPress={() => void refresh()}>Retry</Button></Card.Content></Card> : null}
        {!loading && !error && !room ? <Card style={styles.message}><Card.Content><Title>Room not found</Title><Text>This room may have been archived or removed.</Text></Card.Content></Card> : null}

        {room && snapshot ? <>
          <View style={styles.roomHeading}>
            <View style={styles.headingText}>
              <Text style={styles.eyebrow}>WEEKLY ROOM RECORD</Text>
              <Title style={styles.roomTitle}>{room.name}</Title>
              <Text style={styles.roomMeta}>{room.building} · {room.room_number} · {room.floor} · Capacity {room.capacity}</Text>
            </View>
          </View>

          <Card style={styles.scheduleCard}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Recurring usage</Text>
              {usage.length ? usage.map((item) => <Text key={item} style={styles.usageLine}>{item}</Text>) : <Text style={styles.muted}>No weekly recurring use is scheduled.</Text>}
            </Card.Content>
          </Card>

          <View style={styles.tableHeading}>
            <View>
              <Text style={styles.sectionTitle}>Date-time record</Text>
              <Text style={styles.muted}>{formatDate(weekDates[0])} – {formatDate(weekDates[6])} · Manila time · 07:00-20:00</Text>
            </View>
            <View style={styles.weekControls}>
              <Button compact icon="chevron-left" onPress={() => changeWeek(-1)} accessibilityLabel="Show previous week">Previous</Button>
              <Button compact icon="chevron-right" contentStyle={styles.nextWeekButton} onPress={() => changeWeek(1)} accessibilityLabel="Show next week">Next</Button>
            </View>
            <View style={styles.zoomControls}>
              <Button
                compact
                icon="fit-to-screen-outline"
                mode={zoom === 0 ? 'contained-tonal' : 'text'}
                onPress={() => setZoom(0)}
                accessibilityLabel="Fit timetable to screen"
              >
                Fit
              </Button>
              <Text style={styles.zoomLabel}>{Math.round(tableZoom * 100)}%</Text>
            </View>
            <View style={styles.legend}>
              <View style={[styles.legendSwatch, { backgroundColor: segmentColors.schedule }]} /><Text style={styles.legendText}>Class</Text>
              <View style={[styles.legendSwatch, { backgroundColor: segmentColors.reservation }]} /><Text style={styles.legendText}>Reserved</Text>
              <View style={[styles.legendSwatch, { backgroundColor: segmentColors.block }]} /><Text style={styles.legendText}>Blocked</Text>
              <View style={[styles.legendSwatch, { backgroundColor: segmentColors.available }]} /><Text style={styles.legendText}>Vacant</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableScrollContent}>
            <PinchGestureHandler
              onGestureEvent={handlePinch}
              onHandlerStateChange={handlePinchStateChange}
              onBegan={handlePinchStart}
            >
              <View style={[styles.table, { width: baseTableWidth * tableZoom }]}> 
              <View style={styles.headerRow}>
                <View style={[styles.timeHeader, { width: scaledTimeColumnWidth, height: 38 * tableZoom }]}><Text style={[styles.headerText, { fontSize: Math.max(7, 10 * tableZoom) }]}>Start</Text></View>
                <View style={[styles.timeHeader, styles.timeHeaderEnd, { width: scaledTimeColumnWidth, height: 38 * tableZoom }]}><Text style={[styles.headerText, { fontSize: Math.max(7, 10 * tableZoom) }]}>End</Text></View>
                {weekDates.map((dateKey, index) => <View key={dateKey} style={[styles.dayHeader, { width: scaledDayColumnWidth, height: 38 * tableZoom }]}>
                  <Text numberOfLines={1} style={[styles.headerText, { fontSize: Math.max(7, 10 * tableZoom) }]}>{dayNames[index].slice(0, 3)}</Text>
                  <Text style={[styles.headerDate, { fontSize: Math.max(7, 9 * tableZoom) }]}>{formatDate(dateKey)}</Text>
                </View>)}
              </View>
              <View style={styles.tableBody}>
                <View style={styles.timeColumn}>
                  {rowStarts.map((startMinute) => <View key={`start-${startMinute}`} style={[styles.timeCell, { width: scaledTimeColumnWidth, height: scaledRowHeight }]}>
                    <Text style={[styles.timeText, { fontSize: Math.max(7, 9 * tableZoom) }]}>{formatTime(startMinute)}</Text>
                  </View>)}
                </View>
                <View style={styles.timeColumn}>
                  {rowStarts.map((startMinute) => <View key={`end-${startMinute}`} style={[styles.timeCell, styles.endTimeCell, { width: scaledTimeColumnWidth, height: scaledRowHeight }]}>
                    <Text style={[styles.timeText, { fontSize: Math.max(7, 9 * tableZoom) }]}>{formatTime(startMinute + slotSize)}</Text>
                  </View>)}
                </View>
                {daySegments.map((segments, dayIndex) => <View
                  key={weekDates[dayIndex]}
                  accessibilityLabel={`${dayNames[dayIndex]} room usage`}
                  style={[styles.dayColumn, { width: scaledDayColumnWidth, height: rowStarts.length * scaledRowHeight }]}
                >
                  {segments.map((segment) => {
                    const height = (segment.durationMinutes / slotSize) * scaledRowHeight;
                    return <View
                      key={`${segment.startMinute}-${segment.kind}-${segment.label}`}
                      accessibilityLabel={`${weekDates[dayIndex]} ${formatTime(segment.startMinute)}-${formatTime(segment.startMinute + segment.durationMinutes)} ${segment.available ? 'vacant' : `in use: ${segment.label}`}`}
                      style={[
                        styles.segment,
                        {
                          height,
                          backgroundColor: segmentColors[segment.kind],
                        },
                      ]}
                    >
                      {!segment.available && (segment.durationMinutes >= 60 || segment.kind === 'reservation' || segment.kind === 'block') ? <Text numberOfLines={2} style={[styles.slotText, { fontSize: Math.max(7, 9 * tableZoom) }]}>{segment.label}</Text> : null}
                    </View>;
                  })}
                </View>)}
              </View>
              </View>
            </PinchGestureHandler>
          </ScrollView>
          <Text style={styles.footnote}>Class, reservation, and closure spans have separate colors. Green spans are vacant.</Text>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f6f8' },
  page: { flex: 1, backgroundColor: '#f3f6f8' },
  pageContent: { padding: 16, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  loading: { marginTop: 32 },
  message: { borderRadius: 8 },
  roomHeading: { flexDirection: 'row', alignItems: 'flex-start' },
  headingText: { flex: 1 },
  eyebrow: { color: '#176a64', fontSize: 11, fontWeight: '700' },
  roomTitle: { marginTop: 4 },
  roomMeta: { color: '#53616a', marginTop: 4 },
  scheduleCard: { borderRadius: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#17272d' },
  usageLine: { color: '#405258', marginTop: 6 },
  muted: { color: '#64737a', marginTop: 4 },
  tableHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  weekControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nextWeekButton: { flexDirection: 'row-reverse' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomLabel: { minWidth: 42, textAlign: 'center', color: '#43545b', fontSize: 12, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, marginLeft: 6 },
  legendText: { fontSize: 12, color: '#43545b' },
  tableScrollContent: { minWidth: '100%' },
  table: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#829197', backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row' },
  timeHeader: { height: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, backgroundColor: '#263e45' },
  timeHeaderEnd: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#9ba9ad' },
  dayHeader: { height: 38, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#9ba9ad', backgroundColor: '#263e45' },
  headerText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  headerDate: { color: '#d7e3e3', fontSize: 9, marginTop: 2 },
  tableBody: { flexDirection: 'row' },
  timeColumn: { flexDirection: 'column' },
  timeCell: { justifyContent: 'center', paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#c4ced0', backgroundColor: '#e5ebed' },
  endTimeCell: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#c4ced0' },
  timeText: { fontSize: 9, fontVariant: ['tabular-nums'], color: '#43545b', textAlign: 'center' },
  dayColumn: { overflow: 'hidden', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: '#ffffff88' },
  segment: { width: '100%', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ffffff66' },
  slotText: { color: '#fff', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  footnote: { color: '#64737a', fontSize: 12, marginBottom: 10 },
});
