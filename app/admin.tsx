import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Chip, Dialog, Menu, Paragraph, Portal, SegmentedButtons, Text, TextInput, Title } from 'react-native-paper';
import type { Course, Reservation, RoomBlock } from '../src/lib/availability';
import { supabase } from '../src/lib/supabase';
import { findScheduleConflicts } from '../src/lib/scheduleConflicts';
import { getTimetableCell, getWeekDateKeys } from '../src/lib/timetable';
import { findRoomNumberDuplicate } from '../src/lib/roomValidation';

type AdminSection = 'reservations' | 'reports' | 'rooms' | 'accounts' | 'courses';
type RoomAction = 'classroom' | 'edit' | 'schedule' | 'closure' | 'exception';

interface AdminReservation {
  id: string;
  classroom_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

interface AdminReport {
  id: string;
  classroom_id: string | null;
  report_type: string;
  details: string;
  status: string;
}

interface AdminRoom {
  id: string;
  name: string;
  room_number: string;
  building: string;
  floor: string;
  capacity: number;
  description: string | null;
  amenities: string[];
  active: boolean;
}

interface AdminSchedule {
  id: string;
  classroom_id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_start: string;
  effective_end: string | null;
  enabled: boolean;
  course_id: string | null;
}

interface AdminException {
  id: string;
  classroom_id: string;
  schedule_id: string | null;
  exception_date: string;
  type: 'cancelled' | 'holiday' | 'modified' | 'special_appointment';
  notes: string | null;
}

interface AdminAccount {
  id: string;
  full_name: string;
  email: string;
  role: 'user' | 'admin';
  course_id: string | null;
  created_at: string;
}

function manilaDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminScreen() {
  const [section, setSection] = useState<AdminSection>('reservations');
  const [roomAction, setRoomAction] = useState<RoomAction>('classroom');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [exceptions, setExceptions] = useState<AdminException[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [approvedReservations, setApprovedReservations] = useState<Reservation[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [busyId, setBusyId] = useState('');
  const [schedulePendingDelete, setSchedulePendingDelete] = useState<AdminSchedule | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [editingAccountId, setEditingAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountRole, setAccountRole] = useState<'user' | 'admin'>('user');
  const [accountCourseId, setAccountCourseId] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseYear, setCourseYear] = useState('');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState('');
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false);

  const [roomName, setRoomName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [amenities, setAmenities] = useState('');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleCourseId, setScheduleCourseId] = useState('');
  const [weekday, setWeekday] = useState('1');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [effectiveStart, setEffectiveStart] = useState(manilaDate);
  const [effectiveEnd, setEffectiveEnd] = useState('');
  const [blockTitle, setBlockTitle] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockDate, setBlockDate] = useState(manilaDate);
  const [blockStart, setBlockStart] = useState('09:00');
  const [blockEnd, setBlockEnd] = useState('10:00');
  const [exceptionDate, setExceptionDate] = useState(manilaDate);
  const [exceptionType, setExceptionType] = useState<'cancelled' | 'holiday'>('cancelled');
  const [exceptionScheduleId, setExceptionScheduleId] = useState('');
  const [exceptionNotes, setExceptionNotes] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewWeekDates = useMemo(() => getWeekDateKeys(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Sign in with an administrator account to continue.');
      setCurrentUserId(userData.user.id);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (profile?.role !== 'admin') {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(true);

      const weekDates = getWeekDateKeys();
      const weekStart = new Date(`${weekDates[0]}T00:00:00+08:00`).toISOString();
      const previewEnd = new Date(`${weekDates[0]}T00:00:00+08:00`);
      previewEnd.setUTCDate(previewEnd.getUTCDate() + 14);
      const [reservationResult, reportResult, roomResult, blockResult, approvedResult, accountResult, courseResult] = await Promise.all([
        supabase.from('reservations').select('id,classroom_id,title,starts_at,ends_at,status').eq('status', 'pending').order('starts_at'),
        supabase.from('reports').select('id,classroom_id,report_type,details,status,created_at').in('status', ['new', 'in_review']).order('created_at'),
        supabase.from('classrooms').select('id,name,room_number,building,floor,capacity,description,amenities,active').order('building').order('room_number'),
        supabase.from('room_blocks').select('id,classroom_id,title,reason,starts_at,ends_at').gte('ends_at', weekStart).lt('starts_at', previewEnd.toISOString()),
        supabase.from('reservations').select('id,classroom_id,title,starts_at,ends_at,status').eq('status', 'approved').gte('ends_at', weekStart).lt('starts_at', previewEnd.toISOString()),
        supabase.from('profiles').select('id,full_name,email,role,course_id,created_at').order('created_at', { ascending: false }),
        supabase.from('courses').select('id,code,year,active').order('code').order('year'),
      ]);
      const [scheduleResult, exceptionResult] = await Promise.all([
        supabase.from('recurring_schedules').select('id,classroom_id,course_id,title,day_of_week,start_time,end_time,effective_start,effective_end,enabled'),
        supabase.from('schedule_exceptions').select('id,classroom_id,schedule_id,exception_date,type,notes').gte('exception_date', manilaDate()).order('exception_date'),
      ]);
      const dataError = reservationResult.error ?? reportResult.error ?? roomResult.error ?? blockResult.error ?? approvedResult.error ?? accountResult.error ?? courseResult.error ?? scheduleResult.error ?? exceptionResult.error;
      if (dataError) throw new Error(dataError.message);
      setReservations((reservationResult.data ?? []) as AdminReservation[]);
      setReports((reportResult.data ?? []) as AdminReport[]);
      setRooms((roomResult.data ?? []) as AdminRoom[]);
      setSchedules((scheduleResult.data ?? []) as AdminSchedule[]);
      setExceptions((exceptionResult.data ?? []) as AdminException[]);
      setBlocks((blockResult.data ?? []) as RoomBlock[]);
      setApprovedReservations((approvedResult.data ?? []) as Reservation[]);
      setAccounts((accountResult.data ?? []) as AdminAccount[]);
      setCourses((courseResult.data ?? []) as Course[]);
      setRoomId((current) => current || roomResult.data?.[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load administrator data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(), 250);
    };
    const channel = supabase
      .channel('admin-workflow-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_schedules' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_exceptions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_blocks' }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [refresh]));

  const updateReservation = async (id: string, status: 'approved' | 'rejected' | 'cancelled') => {
    setBusyId(id);
    setError('');
    try {
      const { error: updateError } = await supabase.from('reservations').update({ status }).eq('id', id);
      if (updateError) throw new Error(updateError.message);
      setNotice(status === 'cancelled' ? 'Approved reservation cancelled.' : `Reservation ${status}.`);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update reservation.');
    } finally {
      setBusyId('');
    }
  };

  const confirmCancelApprovedReservation = (reservation: Reservation) => {
    Alert.alert(
      'Cancel approved booking?',
      `${reservation.title} will be released so a new room request can be submitted.`,
      [
        { text: 'Keep booking', style: 'cancel' },
        { text: 'Cancel booking', style: 'destructive', onPress: () => void updateReservation(reservation.id, 'cancelled') },
      ]
    );
  };

  const updateReport = async (id: string, status: 'in_review' | 'resolved' | 'rejected') => {
    setBusyId(id);
    setError('');
    try {
      const { error: updateError } = await supabase.from('reports').update({ status }).eq('id', id);
      if (updateError) throw new Error(updateError.message);
      setNotice(`Report marked ${status.replace('_', ' ')}.`);
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not update report.');
    } finally {
      setBusyId('');
    }
  };

  const startAccountEdit = (account: AdminAccount) => {
    setEditingAccountId(account.id);
    setAccountName(account.full_name);
    setAccountRole(account.role);
    setAccountCourseId(account.course_id ?? '');
    setError('');
  };

  const updateAccount = async () => {
    if (!editingAccountId || !accountName.trim()) {
      setError('Enter the account holder name before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.rpc('update_admin_account', {
        target_user_id: editingAccountId,
        new_full_name: accountName.trim(),
        new_role: accountRole,
        new_course_id: accountCourseId || null,
      });
      if (updateError) throw new Error(updateError.message);
      setNotice('Account changes saved.');
      setEditingAccountId('');
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update account.');
    } finally {
      setSaving(false);
    }
  };

  const createCourse = async () => {
    const normalizedCode = courseCode.trim().toUpperCase();
    const year = Number(courseYear);
    if (!/^[A-Z0-9]+$/.test(normalizedCode) || !Number.isInteger(year) || year < 1 || year > 6) {
      setError('Enter a course code using letters/numbers and a year from 1 to 6.');
      return;
    }
    if (courses.some((course) => course.code === normalizedCode && course.year === year)) {
      setError('That course and year already exists.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('courses').insert({ code: normalizedCode, year, active: true });
      if (insertError) throw new Error(insertError.message);
      setCourseCode('');
      setCourseYear('');
      setNotice(`${normalizedCode}-${year} added.`);
      await refresh();
    } catch (courseError) {
      setError(courseError instanceof Error ? courseError.message : 'Could not add course and year.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCourse = async (course: Course) => {
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('courses').update({ active: !course.active }).eq('id', course.id);
      if (updateError) throw new Error(updateError.message);
      setNotice(course.active ? `${course.code}-${course.year} archived.` : `${course.code}-${course.year} restored.`);
      await refresh();
    } catch (courseError) {
      setError(courseError instanceof Error ? courseError.message : 'Could not change course status.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAccount = (account: AdminAccount) => {
    if (account.id === currentUserId) {
      setError('You cannot delete the administrator account currently in use.');
      return;
    }
    Alert.alert(
      'Delete account?',
      `${account.full_name} (${account.email}) will lose access. Booking history will be retained without personal ownership details.`,
      [
        { text: 'Keep account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void deleteAccount(account.id),
        },
      ]
    );
  };

  const deleteAccount = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const { error: deleteError } = await supabase.rpc('delete_admin_account', { target_user_id: id });
      if (deleteError) throw new Error(deleteError.message);
      setNotice('Account deleted.');
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete account.');
    } finally {
      setBusyId('');
    }
  };

  const createRoom = async () => {
    if (!roomName.trim() || !roomNumber.trim() || !building.trim() || !floor.trim() || !Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
      setError('Complete all classroom fields and enter a positive whole-number capacity.');
      return;
    }
    const duplicateRoom = findRoomNumberDuplicate(rooms, building, roomNumber);
    if (duplicateRoom) {
      setError(`Room ${duplicateRoom.room_number} already exists in ${duplicateRoom.building}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('classrooms').insert({
        name: roomName.trim(), room_number: roomNumber.trim(), building: building.trim(),
        floor: floor.trim(), capacity: Number(capacity), description: description.trim() || null,
        amenities: amenities.split(',').map((item) => item.trim()).filter(Boolean), active: true,
      });
      if (insertError) throw new Error(insertError.message);
      setRoomName(''); setRoomNumber(''); setBuilding(''); setFloor(''); setCapacity(''); setDescription(''); setAmenities('');
      setNotice('Classroom added.');
      await refresh();
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Could not add classroom.');
    } finally {
      setSaving(false);
    }
  };

  const selectRoomToEdit = (room: AdminRoom) => {
    setEditRoomId(room.id);
    setRoomName(room.name);
    setRoomNumber(room.room_number);
    setBuilding(room.building);
    setFloor(room.floor);
    setCapacity(String(room.capacity));
    setDescription(room.description ?? '');
    setAmenities(room.amenities.join(', '));
    setRoomMenuOpen(false);
    setError('');
  };

  const updateRoom = async () => {
    if (!editRoomId || !roomName.trim() || !roomNumber.trim() || !building.trim() || !floor.trim() || !Number.isInteger(Number(capacity)) || Number(capacity) < 1) {
      setError('Choose a classroom, complete all required fields, and enter a positive whole-number capacity.');
      return;
    }
    const duplicateRoom = findRoomNumberDuplicate(rooms, building, roomNumber, editRoomId);
    if (duplicateRoom) {
      setError(`Room ${duplicateRoom.room_number} already exists in ${duplicateRoom.building}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('classrooms').update({
        name: roomName.trim(),
        room_number: roomNumber.trim(),
        building: building.trim(),
        floor: floor.trim(),
        capacity: Number(capacity),
        description: description.trim() || null,
        amenities: amenities.split(',').map((item) => item.trim()).filter(Boolean),
      }).eq('id', editRoomId);
      if (updateError) throw new Error(updateError.message);
      setNotice('Classroom changes saved.');
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update classroom.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRoomActive = async (active: boolean) => {
    if (!editRoomId) return;
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('classrooms').update({ active }).eq('id', editRoomId);
      if (updateError) throw new Error(updateError.message);
      setNotice(active ? 'Classroom restored to the directory.' : 'Classroom archived from the directory.');
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not change classroom status.');
    } finally {
      setSaving(false);
    }
  };

  const editSchedule = (schedule: AdminSchedule) => {
    setRoomId(schedule.classroom_id);
    setEditingScheduleId(schedule.id);
    setScheduleTitle(schedule.title);
    setScheduleCourseId(schedule.course_id ?? '');
    setWeekday(String(schedule.day_of_week));
    setSelectedWeekdays([schedule.day_of_week]);
    setStartTime(schedule.start_time.slice(0, 5));
    setEndTime(schedule.end_time.slice(0, 5));
    setEffectiveStart(schedule.effective_start);
    setEffectiveEnd(schedule.effective_end ?? '');
    setError('');
  };

  const cancelScheduleEdit = () => {
    setEditingScheduleId('');
    setScheduleTitle('');
    setScheduleCourseId('');
    setWeekday('1');
    setSelectedWeekdays([1]);
    setStartTime('09:00');
    setEndTime('10:00');
    setEffectiveStart(manilaDate());
    setEffectiveEnd('');
    setError('');
  };

  const toggleWeekday = (day: number) => {
    if (editingScheduleId) {
      setWeekday(String(day));
      setSelectedWeekdays([day]);
      return;
    }
    setSelectedWeekdays((current) => current.includes(day)
      ? current.filter((selectedDay) => selectedDay !== day)
      : [...current, day].sort((left, right) => left - right));
  };

  const saveSchedule = async () => {
    if (!roomId || !scheduleCourseId || !scheduleTitle.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart) || (effectiveEnd && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveEnd)) || (!editingScheduleId && selectedWeekdays.length === 0)) {
      setError('Choose a room, course and year, title, valid 24-hour times, and effective start date.');
      return;
    }
    if (startTime >= endTime || (effectiveEnd && effectiveEnd < effectiveStart) || !/^[0-6]$/.test(weekday)) {
      setError('Check the time range, weekday (0–6), and effective date range.');
      return;
    }
    const weekdaysToSave = editingScheduleId ? [Number(weekday)] : selectedWeekdays;
    const proposed = weekdaysToSave.map((dayOfWeek) => ({
      dayOfWeek,
      startTime,
      endTime,
      effectiveStart,
      effectiveEnd: effectiveEnd || null,
    }));
    const recurringConflicts = findScheduleConflicts({
      classroomId: roomId,
      proposed,
      schedules,
      excludeScheduleId: editingScheduleId || undefined,
    });
    if (recurringConflicts.length) {
      setError(`Schedule overlaps ${weekdays[recurringConflicts[0].dayOfWeek]} ${recurringConflicts[0].startTime}-${recurringConflicts[0].endTime}: ${recurringConflicts[0].title}.`);
      return;
    }

    const today = manilaDate();
    const bookingConflicts = proposed.flatMap((candidate) => {
      const weekIndex = (candidate.dayOfWeek + 6) % 7;
      const currentDate = previewWeekDates[weekIndex];
      const [startHour, startMinute] = candidate.startTime.split(':').map(Number);
      const startIsPast = currentDate < today || (currentDate === today && candidate.startTime <= new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
      const occurrenceDate = currentDate >= effectiveStart && !startIsPast ? currentDate : (() => {
        const shifted = new Date(`${currentDate}T00:00:00Z`);
        shifted.setUTCDate(shifted.getUTCDate() + 7);
        return shifted.toISOString().slice(0, 10);
      })();
      const previewHorizon = new Date(`${previewWeekDates[6]}T00:00:00Z`);
      previewHorizon.setUTCDate(previewHorizon.getUTCDate() + 7);
      if (occurrenceDate < effectiveStart || occurrenceDate > previewHorizon.toISOString().slice(0, 10) || (effectiveEnd && occurrenceDate > effectiveEnd)) return [];
      const [endHour, endMinute] = candidate.endTime.split(':').map(Number);
      const occupancy = getTimetableCell({
        classroomId: roomId,
        date: occurrenceDate,
        startMinute: startHour * 60 + startMinute,
        endMinute: endHour * 60 + endMinute,
        schedules: schedules.filter((schedule) => schedule.id !== editingScheduleId),
        exceptions,
        reservations: approvedReservations,
        blocks,
      });
      return occupancy.available ? [] : [{ dayOfWeek: candidate.dayOfWeek, label: occupancy.label }];
    });
    if (bookingConflicts.length) {
      setError(`Room already has a booking or block on ${weekdays[bookingConflicts[0].dayOfWeek]}: ${bookingConflicts[0].label}.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const scheduleValues = {
        classroom_id: roomId,
        course_id: scheduleCourseId || null,
        title: scheduleTitle.trim(),
        start_time: startTime,
        end_time: endTime,
        effective_start: effectiveStart,
        effective_end: effectiveEnd || null,
      };
      const result = editingScheduleId
        ? await supabase.from('recurring_schedules').update({ ...scheduleValues, day_of_week: Number(weekday) }).eq('id', editingScheduleId)
        : await supabase.from('recurring_schedules').insert(selectedWeekdays.map((day) => ({ ...scheduleValues, day_of_week: day, enabled: true })));
      if (result.error) throw new Error(result.error.message);
      setNotice(editingScheduleId ? 'Weekly schedule updated.' : `Weekly schedule added for ${selectedWeekdays.map((day) => weekdays[day]).join(', ')}.`);
      cancelScheduleEdit();
      await refresh();
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSchedule = async (schedule: AdminSchedule) => {
    setBusyId(schedule.id);
    setError('');
    try {
      const { error: updateError } = await supabase.from('recurring_schedules').update({ enabled: !schedule.enabled }).eq('id', schedule.id);
      if (updateError) throw new Error(updateError.message);
      setNotice(schedule.enabled ? 'Schedule disabled.' : 'Schedule enabled.');
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not change schedule status.');
    } finally {
      setBusyId('');
    }
  };

  const deleteSchedule = async (schedule: AdminSchedule) => {
    setBusyId(schedule.id);
    setError('');
    try {
      const { error: deleteError } = await supabase.from('recurring_schedules').delete().eq('id', schedule.id);
      if (deleteError) throw new Error(deleteError.message);
      if (editingScheduleId === schedule.id) cancelScheduleEdit();
      setNotice('Schedule deleted.');
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete schedule.');
    } finally {
      setBusyId('');
    }
  };

  const confirmDeleteSchedule = (schedule: AdminSchedule) => setSchedulePendingDelete(schedule);

  const createClosure = async () => {
    if (!roomId || !blockTitle.trim() || !blockReason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(blockDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(blockStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(blockEnd)) {
      setError('Choose a room and complete the closure details and date.');
      return;
    }
    const startsAt = manilaDateTime(blockDate, blockStart);
    const endsAt = manilaDateTime(blockDate, blockEnd);
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('Closure end time must be after its start time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('room_blocks').insert({
        classroom_id: roomId, title: blockTitle.trim(), reason: blockReason.trim(), starts_at: startsAt, ends_at: endsAt,
      });
      if (insertError) throw new Error(insertError.message);
      setBlockTitle(''); setBlockReason('');
      setNotice('Room closure added.');
      await refresh();
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Could not add closure.');
    } finally {
      setSaving(false);
    }
  };

  const createException = async () => {
    if (!roomId || !/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
      setError('Choose a classroom and enter the exception date as YYYY-MM-DD.');
      return;
    }
    const selectedSchedule = schedules.find((schedule) => schedule.id === exceptionScheduleId);
    if (exceptionScheduleId && selectedSchedule?.classroom_id !== roomId) {
      setError('The selected schedule does not belong to this classroom.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('schedule_exceptions').insert({
        classroom_id: roomId,
        schedule_id: exceptionScheduleId || null,
        exception_date: exceptionDate,
        type: exceptionType,
        notes: exceptionNotes.trim() || null,
      });
      if (insertError) throw new Error(insertError.message);
      setExceptionNotes('');
      setExceptionScheduleId('');
      setNotice(exceptionType === 'holiday' ? 'Room holiday added.' : 'Schedule cancellation added.');
      await refresh();
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : 'Could not add schedule exception.');
    } finally {
      setSaving(false);
    }
  };

  const deleteException = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      const { error: deleteError } = await supabase.from('schedule_exceptions').delete().eq('id', id);
      if (deleteError) throw new Error(deleteError.message);
      setNotice('Schedule exception removed.');
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove exception.');
    } finally {
      setBusyId('');
    }
  };

  const selectedRoom = rooms.find((room) => room.id === roomId);
  const editingRoom = rooms.find((room) => room.id === editRoomId);
  const schedulePreview = useMemo(() => {
    if (!roomId || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) return [];
    const days = editingScheduleId ? [Number(weekday)] : selectedWeekdays;
    const recurringConflicts = findScheduleConflicts({
      classroomId: roomId,
      proposed: days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime, effectiveStart, effectiveEnd: effectiveEnd || null })),
      schedules,
      excludeScheduleId: editingScheduleId || undefined,
    });
    const now = new Date();
    const timeNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

    return days.map((dayOfWeek) => {
      const weekIndex = (dayOfWeek + 6) % 7;
      const thisDate = previewWeekDates[weekIndex];
      const occurrenceDate = thisDate >= effectiveStart && (thisDate > manilaDate() || (thisDate === manilaDate() && startTime > timeNow))
        ? thisDate
        : (() => {
          const next = new Date(`${thisDate}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + 7);
          return next.toISOString().slice(0, 10);
        })();
      if (occurrenceDate < effectiveStart || (effectiveEnd && occurrenceDate > effectiveEnd)) {
        return { dayOfWeek, date: occurrenceDate, busy: false, reason: 'Outside preview dates' };
      }
      const recurring = recurringConflicts.find((conflict) => conflict.dayOfWeek === dayOfWeek);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      const occupancy = recurring ? null : getTimetableCell({
        classroomId: roomId,
        date: occurrenceDate,
        startMinute: startHour * 60 + startMinute,
        endMinute: endHour * 60 + endMinute,
        schedules: schedules.filter((schedule) => schedule.id !== editingScheduleId),
        exceptions,
        reservations: approvedReservations,
        blocks,
      });
      return {
        dayOfWeek,
        date: occurrenceDate,
        busy: Boolean(recurring || (occupancy && !occupancy.available)),
        reason: recurring?.title ?? (occupancy && !occupancy.available ? occupancy.label : 'Available'),
      };
    });
  }, [roomId, startTime, endTime, editingScheduleId, weekday, selectedWeekdays, effectiveStart, effectiveEnd, schedules, exceptions, approvedReservations, blocks, previewWeekDates]);
  const hasScheduleConflict = schedulePreview.some((item) => item.busy);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>HCCCI · OPERATIONS</Text><Title>Administration</Title></View>
        <Link href="/(tabs)" asChild><Button compact icon="arrow-left">Home</Button></Link>
      </View>
      {loading ? <ActivityIndicator /> : null}
      {error ? <Card style={styles.noticeCard}><Card.Content><Text style={styles.error}>{error}</Text><Button onPress={() => void refresh()}>Retry</Button></Card.Content></Card> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {!loading && isAdmin === false ? <Card style={styles.noticeCard}><Card.Content><Text style={styles.heading}>Administrator access required</Text><Paragraph>This account does not have the admin role.</Paragraph></Card.Content></Card> : null}
      {isAdmin ? (
        <>
          <SegmentedButtons value={section} onValueChange={(value) => setSection(value as AdminSection)} buttons={[
            { value: 'reservations', label: `Bookings (${reservations.length})` },
            { value: 'reports', label: `Reports (${reports.length})` },
            { value: 'rooms', label: 'Room tools' },
            { value: 'accounts', label: `Accounts (${accounts.length})` },
            { value: 'courses', label: `Courses (${courses.filter((course) => course.active).length})` },
          ]} />

          {section === 'reservations' ? (
            <View style={styles.stack}>
              {reservations.length === 0 && approvedReservations.length === 0 ? <Text style={styles.empty}>No pending or approved reservations.</Text> : null}
              {reservations.map((item) => <Card key={item.id} style={styles.card}><Card.Content>
                <View style={styles.itemHeader}><Text style={styles.heading}>{item.title}</Text><Text style={styles.status}>Pending</Text></View>
                <Text>{rooms.find((room) => room.id === item.classroom_id)?.name ?? 'Classroom'}</Text>
                <Text style={styles.meta}>{new Date(item.starts_at).toLocaleString()} – {new Date(item.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                <View style={styles.actions}>
                  <Button mode="contained" loading={busyId === item.id} onPress={() => void updateReservation(item.id, 'approved')}>Approve</Button>
                  <Button mode="outlined" disabled={Boolean(busyId)} onPress={() => void updateReservation(item.id, 'rejected')}>Reject</Button>
                </View>
              </Card.Content></Card>)}
              {approvedReservations.length ? <Text style={styles.subheading}>Approved reservations</Text> : null}
              {approvedReservations.map((item) => <Card key={item.id} style={styles.card}><Card.Content>
                <View style={styles.itemHeader}><Text style={styles.heading}>{item.title}</Text><Text style={styles.approvedStatus}>Approved</Text></View>
                <Text>{rooms.find((room) => room.id === item.classroom_id)?.name ?? 'Classroom'}</Text>
                <Text style={styles.meta}>{new Date(item.starts_at).toLocaleString()} – {new Date(item.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                <View style={styles.actions}>
                  <Button mode="outlined" loading={busyId === item.id} disabled={Boolean(busyId)} onPress={() => confirmCancelApprovedReservation(item)}>Cancel approved booking</Button>
                </View>
              </Card.Content></Card>)}
            </View>
          ) : null}

          {section === 'reports' ? (
            <View style={styles.stack}>
              {reports.length === 0 ? <Text style={styles.empty}>No open reports.</Text> : null}
              {reports.map((item) => <Card key={item.id} style={styles.card}><Card.Content>
                <View style={styles.itemHeader}><Text style={styles.heading}>{item.report_type}</Text><Text style={styles.status}>{item.status.replace('_', ' ')}</Text></View>
                <Text>{item.classroom_id ? rooms.find((room) => room.id === item.classroom_id)?.name ?? 'Classroom' : 'Campus-wide'}</Text>
                <Paragraph style={styles.meta}>{item.details}</Paragraph>
                <View style={styles.actions}>
                  {item.status === 'new' ? <Button compact onPress={() => void updateReport(item.id, 'in_review')}>Review</Button> : null}
                  <Button compact mode="contained" loading={busyId === item.id} onPress={() => void updateReport(item.id, 'resolved')}>Resolve</Button>
                  <Button compact onPress={() => void updateReport(item.id, 'rejected')}>Reject</Button>
                </View>
              </Card.Content></Card>)}
            </View>
          ) : null}

          {section === 'accounts' ? (
            <View style={styles.stack}>
              <Text style={styles.meta}>Manage account names and roles. Email addresses are shown from the authentication profile.</Text>
              {accounts.map((account) => <Card key={account.id} style={styles.card}><Card.Content>
                <View style={styles.itemHeader}>
                  <View style={styles.accountIdentity}>
                    <Text style={styles.heading}>{account.full_name}</Text>
                    <Text style={styles.meta}>{account.email}</Text>
                  </View>
                  <Text style={account.role === 'admin' ? styles.approvedStatus : styles.status}>{account.role}</Text>
                </View>
                <Text style={styles.meta}>Course/year: {courses.find((course) => course.id === account.course_id)?.code ?? 'Not assigned'}{account.course_id ? `-${courses.find((course) => course.id === account.course_id)?.year ?? ''}` : ''}</Text>
                {editingAccountId === account.id ? <>
                  <TextInput label="Full name" mode="outlined" value={accountName} onChangeText={setAccountName} style={styles.input} />
                  <Menu visible={courseMenuOpen} onDismiss={() => setCourseMenuOpen(false)} anchor={<Button mode="outlined" onPress={() => setCourseMenuOpen(true)} style={styles.input}>
                    {accountCourseId ? `${courses.find((course) => course.id === accountCourseId)?.code}-${courses.find((course) => course.id === accountCourseId)?.year}` : 'No course/year assigned'}
                  </Button>}>
                    <Menu.Item title="No course/year assigned" onPress={() => { setAccountCourseId(''); setCourseMenuOpen(false); }} />
                    {courses.filter((course) => course.active).map((course) => <Menu.Item key={course.id} title={`${course.code}-${course.year}`} onPress={() => { setAccountCourseId(course.id); setCourseMenuOpen(false); }} />)}
                  </Menu>
                  <View style={styles.accountRoleRow}>
                    <Text style={styles.meta}>Role</Text>
                    <Chip selected={accountRole === 'user'} onPress={() => setAccountRole('user')}>User</Chip>
                    <Chip selected={accountRole === 'admin'} onPress={() => setAccountRole('admin')} disabled={account.id === currentUserId}>Admin</Chip>
                  </View>
                  <View style={styles.actions}>
                    <Button mode="contained" loading={saving} disabled={saving} onPress={() => void updateAccount()}>Save</Button>
                    <Button mode="text" disabled={saving} onPress={() => setEditingAccountId('')}>Cancel</Button>
                  </View>
                </> : <View style={styles.actions}>
                  <Button compact mode="outlined" onPress={() => startAccountEdit(account)}>Edit</Button>
                  <Button compact mode="text" textColor="#b3261e" disabled={account.id === currentUserId || Boolean(busyId)} loading={busyId === account.id} onPress={() => confirmDeleteAccount(account)}>Delete</Button>
                </View>}
              </Card.Content></Card>)}
              {accounts.length === 0 ? <Text style={styles.empty}>No accounts found.</Text> : null}
            </View>
          ) : null}

          {section === 'courses' ? (
            <View style={styles.stack}>
              <Card style={styles.card}><Card.Content>
                <Text style={styles.heading}>Add course and year</Text>
                <Text style={styles.meta}>Create groups such as BSIT-3 or BECED-3 for accounts and schedules.</Text>
                <View style={styles.actions}>
                  <TextInput label="Course code" mode="outlined" value={courseCode} onChangeText={setCourseCode} autoCapitalize="characters" style={styles.halfInput} />
                  <TextInput label="Year (1-6)" mode="outlined" value={courseYear} onChangeText={setCourseYear} keyboardType="number-pad" style={styles.halfInput} />
                </View>
                <Button mode="contained" loading={saving} disabled={saving} onPress={() => void createCourse()}>Add course</Button>
              </Card.Content></Card>
              {courses.map((course) => <Card key={course.id} style={styles.card}><Card.Content>
                <View style={styles.itemHeader}>
                  <Text style={styles.heading}>{course.code}-{course.year}</Text>
                  <Text style={course.active ? styles.approvedStatus : styles.status}>{course.active ? 'Active' : 'Archived'}</Text>
                </View>
                <Button compact mode="outlined" disabled={saving} onPress={() => void toggleCourse(course)}>{course.active ? 'Archive' : 'Restore'}</Button>
              </Card.Content></Card>)}
              {courses.length === 0 ? <Text style={styles.empty}>No courses have been added.</Text> : null}
            </View>
          ) : null}

          {section === 'rooms' ? (
            <View style={styles.stack}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolTabs}>
                {([
                  ['classroom', 'Add room'], ['edit', 'Edit room'], ['schedule', 'Schedule'], ['closure', 'Block'], ['exception', 'Exception'],
                ] as const).map(([value, label]) => <Chip key={value} selected={roomAction === value} onPress={() => { setRoomAction(value); setError(''); }} compact style={styles.toolTab}>{label}</Chip>)}
              </ScrollView>
              {roomAction === 'classroom' ? <Card style={styles.card}><Card.Content>
                <Text style={styles.heading}>Add classroom</Text>
                <TextInput label="Display name" mode="outlined" value={roomName} onChangeText={setRoomName} style={styles.input} />
                <TextInput label="Room number" mode="outlined" value={roomNumber} onChangeText={setRoomNumber} style={styles.input} />
                <TextInput label="Building" mode="outlined" value={building} onChangeText={setBuilding} style={styles.input} />
                <TextInput label="Floor" mode="outlined" value={floor} onChangeText={setFloor} style={styles.input} />
                <TextInput label="Capacity" mode="outlined" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} style={styles.input} />
                <TextInput label="Description (optional)" mode="outlined" value={description} onChangeText={setDescription} style={styles.input} />
                <TextInput label="Amenities, comma separated (optional)" mode="outlined" value={amenities} onChangeText={setAmenities} style={styles.input} />
                <Button mode="contained" loading={saving} onPress={() => void createRoom()}>Add classroom</Button>
              </Card.Content></Card> : null}

              {roomAction === 'edit' ? <Card style={styles.card}><Card.Content>
                <Text style={styles.heading}>Edit classroom</Text>
                <Menu visible={roomMenuOpen} onDismiss={() => setRoomMenuOpen(false)} anchor={<Button mode="outlined" onPress={() => setRoomMenuOpen(true)} style={styles.input}>{editingRoom?.name ?? 'Choose classroom'}</Button>}>
                  {rooms.map((room) => <Menu.Item key={room.id} title={`${room.name} · ${room.building}${room.active ? '' : ' · Archived'}`} onPress={() => selectRoomToEdit(room)} />)}
                </Menu>
                {editRoomId ? <>
                  <TextInput label="Display name" mode="outlined" value={roomName} onChangeText={setRoomName} style={styles.input} />
                  <View style={styles.actions}><TextInput label="Room number" mode="outlined" value={roomNumber} onChangeText={setRoomNumber} style={styles.halfInput} /><TextInput label="Capacity" mode="outlined" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} style={styles.halfInput} /></View>
                  <TextInput label="Building" mode="outlined" value={building} onChangeText={setBuilding} style={styles.input} />
                  <TextInput label="Floor" mode="outlined" value={floor} onChangeText={setFloor} style={styles.input} />
                  <TextInput label="Description" mode="outlined" multiline value={description} onChangeText={setDescription} style={styles.input} />
                  <TextInput label="Amenities (comma separated)" mode="outlined" value={amenities} onChangeText={setAmenities} style={styles.input} />
                  <View style={styles.actions}>
                    <Button mode="contained" loading={saving} disabled={saving || !editingRoom?.active} onPress={() => void updateRoom()}>Save changes</Button>
                    <Button mode="outlined" disabled={saving} onPress={() => void toggleRoomActive(!editingRoom?.active)}>{editingRoom?.active ? 'Archive room' : 'Restore room'}</Button>
                  </View>
                  <Text style={styles.meta}>Archiving hides a room from booking but preserves its schedule and booking history.</Text>
                </> : <Text style={styles.meta}>Select an existing classroom to edit.</Text>}
              </Card.Content></Card> : null}

              {roomAction !== 'classroom' && roomAction !== 'edit' ? <Card style={styles.card}><Card.Content>
                <Text style={styles.heading}>{roomAction === 'schedule' ? (editingScheduleId ? 'Edit weekly schedule' : 'Add weekly schedule') : roomAction === 'closure' ? 'Block a room' : 'Schedule exception'}</Text>
                <Menu visible={roomMenuOpen} onDismiss={() => setRoomMenuOpen(false)} anchor={<Button mode="outlined" onPress={() => setRoomMenuOpen(true)} style={styles.input}>{selectedRoom?.name ?? 'Choose classroom'}</Button>}>
                  {rooms.map((room) => <Menu.Item key={room.id} title={`${room.name} · ${room.building}`} onPress={() => { setRoomId(room.id); setRoomMenuOpen(false); }} />)}
                </Menu>
                {roomAction === 'schedule' ? <>
                  <Menu visible={courseMenuOpen} onDismiss={() => setCourseMenuOpen(false)} anchor={<Button mode="outlined" onPress={() => setCourseMenuOpen(true)} style={styles.input}>
                    {scheduleCourseId ? `${courses.find((course) => course.id === scheduleCourseId)?.code}-${courses.find((course) => course.id === scheduleCourseId)?.year}` : 'Choose course and year'}
                  </Button>}>
                    {courses.filter((course) => course.active).map((course) => <Menu.Item key={course.id} title={`${course.code}-${course.year}`} onPress={() => { setScheduleCourseId(course.id); setCourseMenuOpen(false); }} />)}
                  </Menu>
                  <TextInput label="Class / activity" mode="outlined" value={scheduleTitle} onChangeText={setScheduleTitle} style={styles.input} />
                  <Text style={styles.fieldLabel}>{editingScheduleId ? 'Change usage day' : 'Usage days (select one or more)'}</Text>
                  <View style={styles.weekdayPicker}>
                    {weekdays.map((day, index) => <Chip
                      key={day}
                      selected={editingScheduleId ? weekday === String(index) : selectedWeekdays.includes(index)}
                      onPress={() => toggleWeekday(index)}
                    >{day.slice(0, 3)}</Chip>)}
                  </View>
                  <View style={styles.actions}><TextInput label="Start HH:MM" mode="outlined" value={startTime} onChangeText={setStartTime} style={styles.halfInput} /><TextInput label="End HH:MM" mode="outlined" value={endTime} onChangeText={setEndTime} style={styles.halfInput} /></View>
                  <TextInput label="Effective start YYYY-MM-DD" mode="outlined" value={effectiveStart} onChangeText={setEffectiveStart} style={styles.input} />
                  <TextInput label="Effective end (optional)" mode="outlined" value={effectiveEnd} onChangeText={setEffectiveEnd} style={styles.input} />
                  <View style={styles.availabilityPanel}>
                    <View style={styles.previewHeading}>
                      <Text style={styles.heading}>Availability check</Text>
                      <Text style={styles.meta}>{schedulePreview[0]?.date ?? 'Choose a day'}</Text>
                    </View>
                    <Text style={styles.previewHint}>Preview checks existing schedules, confirmed bookings, and room blocks before saving.</Text>
                    <View style={styles.previewDays}>
                      {schedulePreview.map((item) => <View key={item.dayOfWeek} style={[styles.previewDay, item.busy ? styles.previewBusy : styles.previewFree]}>
                        <Text style={styles.previewDayName}>{weekdays[item.dayOfWeek].slice(0, 3)}</Text>
                        <Text style={styles.previewDate}>{item.date.slice(5)}</Text>
                        <Text numberOfLines={2} style={styles.previewStatus}>{item.busy ? `Busy · ${item.reason}` : item.reason}</Text>
                      </View>)}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Button mode="contained" loading={saving} disabled={saving || hasScheduleConflict} onPress={() => void saveSchedule()}>{editingScheduleId ? 'Save schedule' : 'Add schedule'}</Button>
                    {editingScheduleId ? <Button mode="text" disabled={saving} onPress={cancelScheduleEdit}>Cancel edit</Button> : null}
                  </View>
                  {hasScheduleConflict ? <Text style={styles.error}>Choose an available day or time. The schedule cannot be saved while it overlaps existing room use.</Text> : null}
                  <Text style={styles.heading}>Existing schedules for {selectedRoom?.name ?? 'this room'}</Text>
                  {schedules.filter((schedule) => schedule.classroom_id === roomId).length === 0 ? <Text style={styles.meta}>No schedules have been added for this room.</Text> : null}
                  {schedules.filter((schedule) => schedule.classroom_id === roomId).map((schedule) => <View key={schedule.id} style={styles.scheduleRow}>
                    <View style={styles.scheduleInfo}>
                      <Text style={styles.status}>{weekdays[schedule.day_of_week]} · {schedule.start_time.slice(0, 5)}-{schedule.end_time.slice(0, 5)}</Text>
                      <Text style={styles.meta}>{courses.find((course) => course.id === schedule.course_id)?.code ?? 'No course'}{schedule.course_id ? `-${courses.find((course) => course.id === schedule.course_id)?.year ?? ''}` : ''}</Text>
                      <Text style={styles.meta}>{schedule.title} · {schedule.enabled ? 'Enabled' : 'Disabled'}</Text>
                      <Text style={styles.meta}>{schedule.effective_start}{schedule.effective_end ? ` to ${schedule.effective_end}` : ' onward'}</Text>
                    </View>
                    <View style={styles.scheduleActions}>
                      <Button compact disabled={Boolean(busyId) || saving} onPress={() => editSchedule(schedule)}>Edit</Button>
                      <Button compact disabled={Boolean(busyId) || saving} loading={busyId === schedule.id} onPress={() => void toggleSchedule(schedule)}>{schedule.enabled ? 'Disable' : 'Enable'}</Button>
                      <Button compact mode="text" textColor="#b3261e" disabled={Boolean(busyId) || saving} loading={busyId === schedule.id} onPress={() => confirmDeleteSchedule(schedule)}>Delete</Button>
                    </View>
                  </View>)}
                </> : roomAction === 'closure' ? <>
                  <TextInput label="Closure title" mode="outlined" value={blockTitle} onChangeText={setBlockTitle} style={styles.input} />
                  <TextInput label="Reason" mode="outlined" value={blockReason} onChangeText={setBlockReason} style={styles.input} />
                  <TextInput label="Date YYYY-MM-DD (Manila time)" mode="outlined" value={blockDate} onChangeText={setBlockDate} style={styles.input} />
                  <View style={styles.actions}><TextInput label="Start HH:MM" mode="outlined" value={blockStart} onChangeText={setBlockStart} style={styles.halfInput} /><TextInput label="End HH:MM" mode="outlined" value={blockEnd} onChangeText={setBlockEnd} style={styles.halfInput} /></View>
                  <Button mode="contained" loading={saving} onPress={() => void createClosure()}>Add closure</Button>
                </> : <>
                  <Text style={styles.meta}>Cancel a class for one date or mark the room as a holiday.</Text>
                  <TextInput label="Date YYYY-MM-DD" mode="outlined" value={exceptionDate} onChangeText={setExceptionDate} style={styles.input} />
                  <SegmentedButtons value={exceptionType} onValueChange={(value) => setExceptionType(value as 'cancelled' | 'holiday')} buttons={[
                    { value: 'cancelled', label: 'Cancel class' }, { value: 'holiday', label: 'Room holiday' },
                  ]} />
                  <Menu visible={scheduleMenuOpen} onDismiss={() => setScheduleMenuOpen(false)} anchor={<Button mode="outlined" onPress={() => setScheduleMenuOpen(true)} style={styles.input}>
                    {exceptionScheduleId ? schedules.find((schedule) => schedule.id === exceptionScheduleId)?.title ?? 'Choose schedule' : 'All schedules for this room'}
                  </Button>}>
                    <Menu.Item title="All schedules for this room" onPress={() => { setExceptionScheduleId(''); setScheduleMenuOpen(false); }} />
                    {schedules.filter((schedule) => schedule.classroom_id === roomId).map((schedule) => <Menu.Item key={schedule.id} title={schedule.title} onPress={() => { setExceptionScheduleId(schedule.id); setScheduleMenuOpen(false); }} />)}
                  </Menu>
                  <TextInput label="Notes (optional)" mode="outlined" value={exceptionNotes} onChangeText={setExceptionNotes} style={styles.input} />
                  <Button mode="contained" loading={saving} disabled={saving} onPress={() => void createException()}>Add exception</Button>
                  <Text style={styles.heading}>Upcoming exceptions</Text>
                  {exceptions.filter((exception) => exception.classroom_id === roomId).length === 0 ? <Text style={styles.meta}>No future exceptions for this room.</Text> : null}
                  {exceptions.filter((exception) => exception.classroom_id === roomId).map((exception) => <View key={exception.id} style={styles.exceptionRow}>
                    <View style={styles.exceptionDetails}>
                      <Text style={styles.status}>{exception.exception_date} · {exception.type.replace('_', ' ')}</Text>
                      <Text style={styles.meta}>{exception.schedule_id ? schedules.find((schedule) => schedule.id === exception.schedule_id)?.title ?? 'Selected schedule' : 'All schedules'}</Text>
                      {exception.notes ? <Text style={styles.meta}>{exception.notes}</Text> : null}
                    </View>
                    <Button compact disabled={Boolean(busyId)} loading={busyId === exception.id} onPress={() => void deleteException(exception.id)}>Remove</Button>
                  </View>)}
                </>}
              </Card.Content></Card> : null}
              <Text style={styles.meta}>{rooms.length} classrooms in the directory.</Text>
            </View>
          ) : null}
          <Portal>
            <Dialog visible={Boolean(schedulePendingDelete)} onDismiss={() => setSchedulePendingDelete(null)}>
              <Dialog.Title>Delete schedule?</Dialog.Title>
              <Dialog.Content>
                <Paragraph>
                  {schedulePendingDelete
                    ? `${schedulePendingDelete.title} on ${weekdays[schedulePendingDelete.day_of_week]} will be permanently removed.`
                    : ''}
                </Paragraph>
              </Dialog.Content>
              <Dialog.Actions>
                <Button disabled={Boolean(busyId)} onPress={() => setSchedulePendingDelete(null)}>Keep schedule</Button>
                <Button
                  textColor="#b3261e"
                  loading={busyId === schedulePendingDelete?.id}
                  disabled={Boolean(busyId) || !schedulePendingDelete}
                  onPress={() => {
                    if (!schedulePendingDelete) return;
                    const schedule = schedulePendingDelete;
                    setSchedulePendingDelete(null);
                    void deleteSchedule(schedule);
                  }}
                >
                  Delete
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </>
      ) : null}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fb' },
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#1d4ed8', fontWeight: '700', fontSize: 11 },
  stack: {
    gap: 12,
  },
  card: {
    borderRadius: 8,
  },
  noticeCard: { borderRadius: 8 },
  heading: {
    fontSize: 16,
    fontWeight: '700',
  },
  subheading: { color: '#23353b', fontSize: 14, fontWeight: '700', marginTop: 8 },
  input: { marginVertical: 6 },
  toolTabs: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
  toolTab: { minHeight: 36, justifyContent: 'center' },
  fieldLabel: { marginTop: 8, color: '#475569', fontWeight: '600' },
  weekdayPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbd5e1', paddingVertical: 8 },
  scheduleInfo: { flex: 1, minWidth: 0 },
  scheduleActions: { flexDirection: 'row', alignItems: 'center' },
  availabilityPanel: { marginTop: 10, padding: 10, backgroundColor: '#e9eff0', borderRadius: 8, gap: 8 },
  previewHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  previewHint: { fontSize: 12, color: '#5b6472' },
  previewDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previewDay: { width: 76, minHeight: 54, padding: 6, borderRadius: 6, justifyContent: 'center' },
  previewBusy: { backgroundColor: '#f4d9d6' },
  previewFree: { backgroundColor: '#d9eee4' },
  previewDayName: { fontSize: 12, fontWeight: '700', color: '#23353b' },
  previewDate: { fontSize: 9, color: '#5b6472' },
  previewStatus: { fontSize: 10, color: '#35464c' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  accountIdentity: { flex: 1, minWidth: 0 },
  accountRoleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  status: { textTransform: 'capitalize', fontWeight: '700' },
  approvedStatus: { color: '#0b6d42', fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  halfInput: { flex: 1, minWidth: 130 },
  exceptionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#cbd5e1', paddingTop: 8 },
  exceptionDetails: { flex: 1, minWidth: 0 },
  meta: { color: '#5b6472', marginTop: 6 },
  empty: { color: '#5b6472', paddingVertical: 12 },
  error: { color: '#b3261e' },
  notice: { color: '#0b6d42' },
});
