import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, Menu, SegmentedButtons, Text, TextInput, Title } from 'react-native-paper';
import type { Classroom } from '../../src/lib/availability';
import { loadRoomSnapshot, type RoomSnapshot } from '../../src/lib/roomData';
import { cancelReservation, loadMyRequests, submitReport, submitReservation, type UserReport, type UserReservation } from '../../src/lib/requests';
import { supabase } from '../../src/lib/supabase';
import { findReservationConflict } from '../../src/lib/timetable';

function dateInManila(daysFromNow = 1) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function toManilaIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export default function RequestsScreen() {
  const params = useLocalSearchParams<{ roomId?: string; mode?: string; date?: string; startTime?: string; endTime?: string }>();
  const [mode, setMode] = useState<'reservation' | 'report'>(params.mode === 'report' ? 'report' : 'reservation');
  const [rooms, setRooms] = useState<Classroom[]>([]);
  const [reservations, setReservations] = useState<UserReservation[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomId, setRoomId] = useState('');
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState('Maintenance');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState(params.date ?? dateInManila());
  const [startTime, setStartTime] = useState(params.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(params.endTime ?? '10:00');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [snapshot, activity] = await Promise.all([loadRoomSnapshot(), loadMyRequests()]);
      setSnapshot(snapshot);
      setRooms(snapshot.classrooms);
      setReservations(activity.reservations);
      setReports(activity.reports);
      setRoomId((current) => current || params.roomId || snapshot.classrooms[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your requests.');
    } finally {
      setLoading(false);
    }
  }, [params.roomId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(), 250);
    };
    const channel = supabase
      .channel('my-request-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [refresh]));

  useEffect(() => {
    if (params.mode === 'report' || params.mode === 'reservation') setMode(params.mode);
    if (params.roomId) setRoomId(params.roomId);
    if (params.date) setDate(params.date);
    if (params.startTime) setStartTime(params.startTime);
    if (params.endTime) setEndTime(params.endTime);
  }, [params.date, params.endTime, params.mode, params.roomId, params.startTime]);

  const selectedRoom = rooms.find((room) => room.id === roomId);
  const validDate = isValidDateKey(date);
  const validTimes = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime);
  const startsAtPreview = validDate && validTimes ? toManilaIso(date, startTime) : '';
  const endsAtPreview = validDate && validTimes ? toManilaIso(date, endTime) : '';
  const reservationConflict = mode === 'reservation' && roomId && snapshot && startsAtPreview && endsAtPreview && new Date(endsAtPreview) > new Date(startsAtPreview)
    ? findReservationConflict({
      classroomId: roomId,
      startsAt: startsAtPreview,
      endsAt: endsAtPreview,
      schedules: snapshot.schedules,
      exceptions: snapshot.exceptions,
      reservations: snapshot.reservations,
      blocks: snapshot.blocks,
    })
    : null;

  const handleSubmit = async () => {
    setError('');
    setNotice('');
    if (mode === 'reservation') {
      if (!roomId || !title.trim()) {
        setError('Choose a room and enter a purpose.');
        return;
      }
      if (!isValidDateKey(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
        setError('Use date YYYY-MM-DD and 24-hour times HH:MM.');
        return;
      }
      const startsAt = toManilaIso(date, startTime);
      const endsAt = toManilaIso(date, endTime);
      if (new Date(startsAt) <= new Date() || new Date(endsAt) <= new Date(startsAt)) {
        setError('Choose a future start time and an end time after it.');
        return;
      }
      setSubmitting(true);
      try {
        await submitReservation({ classroomId: roomId, title, startsAt, endsAt });
        setTitle('');
        setNotice('Reservation request sent for administrator review.');
        await refresh();
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : 'Could not send reservation request.';
        setError(/request_room_reservation|PGRST202|function .* does not exist/i.test(message)
          ? 'Room booking safeguards are not installed on this Supabase project yet. Ask the administrator to run supabase/production_safeguards.sql, then retry.'
          : message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!details.trim()) {
      setError('Describe the issue so staff can follow up.');
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({ classroomId: roomId || null, reportType, details });
      setDetails('');
      setNotice('Report submitted.');
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (reservationId: string) => {
    setError('');
    try {
      await cancelReservation(reservationId);
      await refresh();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel reservation.');
    }
  };

  const roomName = (id: string | null) => rooms.find((room) => room.id === id)?.name ?? 'General campus report';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Title>Requests</Title>
      <SegmentedButtons
        value={mode}
        onValueChange={(value) => setMode(value as 'reservation' | 'report')}
        buttons={[
          { value: 'reservation', label: 'Reserve a room', icon: 'calendar-plus' },
          { value: 'report', label: 'Report an issue', icon: 'alert-circle' },
        ]}
      />

      <Card style={styles.form}>
        <Card.Content>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>{mode === 'reservation' ? 'New reservation request' : 'New room report'}</Text>
            <Button compact icon="refresh" onPress={() => void refresh()} accessibilityLabel="Refresh requests">Refresh</Button>
          </View>

          {mode === 'report' ? (
            <TextInput label="Issue type" mode="outlined" value={reportType} onChangeText={setReportType} style={styles.input} />
          ) : null}

          <Menu
            visible={roomMenuOpen}
            onDismiss={() => setRoomMenuOpen(false)}
            anchor={<Button mode="outlined" onPress={() => setRoomMenuOpen(true)} style={styles.input}>{selectedRoom?.name ?? 'Choose classroom'}</Button>}
          >
            {mode === 'report' ? <Menu.Item title="General campus report" onPress={() => { setRoomId(''); setRoomMenuOpen(false); }} /> : null}
            {rooms.map((room) => <Menu.Item key={room.id} title={`${room.name} · ${room.building}`} onPress={() => { setRoomId(room.id); setRoomMenuOpen(false); }} />)}
          </Menu>

          {mode === 'reservation' ? (
            <>
              <TextInput label="Purpose" mode="outlined" value={title} onChangeText={setTitle} style={styles.input} />
              <TextInput label="Date (YYYY-MM-DD, Manila time)" mode="outlined" value={date} onChangeText={setDate} style={styles.input} />
              <View style={styles.timeRow}>
                <TextInput label="Start (HH:MM)" mode="outlined" value={startTime} onChangeText={setStartTime} style={styles.timeInput} />
                <TextInput label="End (HH:MM)" mode="outlined" value={endTime} onChangeText={setEndTime} style={styles.timeInput} />
              </View>
              {reservationConflict ? <View style={styles.conflictNotice}>
                <Text style={styles.conflictTitle}>Room is already in use</Text>
                <Text style={styles.conflictText}>{reservationConflict.label}. Choose another time or room.</Text>
              </View> : null}
              {roomId && startsAtPreview && endsAtPreview && new Date(endsAtPreview) > new Date(startsAtPreview) && !reservationConflict
                ? <Text style={styles.availableNotice}>This room appears available. The server will check again when you submit.</Text>
                : null}
            </>
          ) : (
            <TextInput label="Issue details" mode="outlined" multiline numberOfLines={4} value={details} onChangeText={setDetails} style={styles.input} />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button mode="contained" loading={submitting} disabled={submitting || loading || Boolean(reservationConflict)} onPress={() => void handleSubmit()}>
            {mode === 'reservation' ? 'Send reservation request' : 'Submit report'}
          </Button>
        </Card.Content>
      </Card>

      <Title style={styles.listTitle}>My activity</Title>
      {loading ? <ActivityIndicator /> : null}
      {!loading && reservations.length === 0 && reports.length === 0 ? <Text style={styles.muted}>Your requests and reports will appear here.</Text> : null}
      {reservations.map((reservation) => (
        <Card key={reservation.id} style={styles.item}>
          <Card.Content>
            <View style={styles.row}>
              <Text style={styles.itemTitle}>{reservation.title}</Text>
              <Text style={styles.status}>{reservation.status}</Text>
            </View>
            <Text>{roomName(reservation.classroom_id)}</Text>
            <Text style={styles.muted}>{new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            {reservation.status === 'pending' ? <Button compact onPress={() => void handleCancel(reservation.id)}>Cancel request</Button> : null}
          </Card.Content>
        </Card>
      ))}
      {reports.map((report) => (
        <Card key={report.id} style={styles.item}>
          <Card.Content>
            <View style={styles.row}>
              <Text style={styles.itemTitle}>{report.report_type}</Text>
              <Text style={styles.status}>{report.status.replace('_', ' ')}</Text>
            </View>
            <Text>{roomName(report.classroom_id)}</Text>
            <Text style={styles.muted}>{report.details}</Text>
            <Divider style={styles.divider} />
            <Text style={styles.muted}>{new Date(report.created_at).toLocaleDateString()}</Text>
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 16, gap: 12 },
  form: { borderRadius: 8 },
  input: { marginTop: 10 },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeInput: { flex: 1, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  listTitle: { marginTop: 8 },
  item: { borderRadius: 8 },
  itemTitle: { fontWeight: '700', flexShrink: 1 },
  status: { textTransform: 'capitalize', fontWeight: '700' },
  muted: { color: '#5b6472', marginTop: 5 },
  error: { color: '#b3261e', marginVertical: 8 },
  notice: { color: '#0b6d42', marginVertical: 8 },
  conflictNotice: { padding: 10, marginVertical: 8, borderRadius: 6, backgroundColor: '#f7e0dc' },
  conflictTitle: { color: '#8e241b', fontWeight: '700' },
  conflictText: { color: '#6f302a', marginTop: 3 },
  availableNotice: { color: '#0b6d42', marginVertical: 8 },
  divider: { marginVertical: 8 },
});
