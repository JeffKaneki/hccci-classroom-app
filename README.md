# HCCCI Room Availability

A React Native + Expo mobile app for HCCCI classroom availability, schedule monitoring, and administrator management.

## Project setup

1. Copy `.env.example` to `.env`.
2. Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npx expo start
```

5. Open the app in Expo Go on a device or use a simulator.

## Supabase setup

Use a Supabase project with PostgreSQL and Email authentication enabled.

### Registration email verification

- The app registration form only accepts addresses ending in `@hccci.edu.ph`; login remains open to any email so the Gmail administrator account can sign in.
- In Supabase **Authentication → Sign In / Providers → Email**, enable email confirmations. After registration, Supabase sends a confirmation link and the app directs the user to sign in after opening that link.
- Supabase sends the message to the submitted address. The HCCCI domain must have an active mailbox (for example, an Outlook-hosted school mailbox) to receive it. For reliable production delivery, configure a trusted custom SMTP provider in Supabase Auth settings and verify its sender domain.
- In **Authentication → URL Configuration → Redirect URLs**, allow `hccci-room-availability://reset-password` and the Expo development callback used during testing. Password recovery uses PKCE and returns to the app's password update screen.

### Required SQL schema

For a new Supabase project, run `supabase/schema.sql`, then `supabase/realtime.sql`, in the Supabase SQL Editor. For a project that already has the original schema, run these migrations in order:

1. `supabase/admin_assignment_fix.sql`
2. `supabase/workflow_access.sql`
3. `supabase/realtime.sql`
4. `supabase/production_safeguards.sql`
5. `supabase/account_management.sql`
6. `supabase/reservation_visibility.sql`

The workflow migration replaces the original recursive admin checks with a safe helper and adds owner-scoped policies plus the reservation cancellation RPC. The account migration enables admin account management, and the reservation visibility migration exposes only approved reservations to authenticated users. The Realtime migration publishes the tables used by live subscriptions. Production safeguards enforce the HCCCI email domain in the Auth profile trigger and serialize room requests, approvals, closures, and schedule changes against conflicting use. Do not rerun the base schema over a live project.

This script creates:

- `profiles`
- `classrooms`
- `recurring_schedules`
- `schedule_exceptions`
- `room_blocks`
- `reservations`
- `reports`
- `audit_logs`

It also enables RLS and configures role checks, including a secure admin assignment procedure.

### Create the first administrator

Register the account in the app first so it has a profile row. On an existing project, apply the migrations above first. Then look up the profile ID:

```sql
select id, email
from public.profiles
where email = 'admin@example.com';
```

Call the trusted one-time assignment function with that ID:

```sql
select public.assign_first_admin('PROFILE_UUID_HERE'::uuid);
```

Run this only from the Supabase SQL Editor or another trusted server-side context. It fails if an administrator is already assigned. Never grant admin privileges from the client or expose a service-role key in the app.

### Realtime configuration

After applying `supabase/realtime.sql`, the dashboard and directory refresh when room data changes; the requests and administration screens refresh when reservations or reports change.

## Current live workflows

- The dashboard and directory read active classrooms, schedules, approved reservations, and room closures from Supabase.
- Users can create room reservation requests, view their own requests, cancel pending requests, and submit issue reports.
- The booking form previews the selected room and time against classes, approved reservations, and room blocks. Submit uses a database RPC that rechecks availability atomically; if the RPC is missing, apply `supabase/production_safeguards.sql` to the hosted project.
- Administrators can approve or reject reservations, triage reports, create classrooms, add weekly schedules, and create room closures.
- Administration uses safe-area spacing and compact room-tool tabs on narrow screens. Room forms include description and amenities; rooms can be edited, archived, or restored. Archiving removes a room from booking while retaining its history.
- Schedule setup previews the selected days against recurring schedules, confirmed reservations, and room blocks. Overlapping schedules cannot be saved; existing schedules can be edited, enabled, disabled, or deleted after confirmation.
- Administrators can add or remove schedule cancellation/holiday exceptions.
- Reservation requests and approvals are checked in PostgreSQL against enabled schedules, room blocks, and approved bookings; per-room transaction locks prevent simultaneous double-bookings.
- Room numbers are unique within a building. Room names are not globally unique, so use the building and room number together to identify a classroom. Supabase Auth rejects duplicate account emails.
- To change a recurring usage day, open **Administration → Room tools → Schedule**, choose the room, then select **Edit** beside the schedule. Select the replacement weekday and save. Adding a new schedule allows multiple weekdays; the app stores a schedule row for each selected day.
- Add at least one classroom through the administrator's Room tools before expecting rooms to appear in the directory.

## Local development without Supabase

The app includes an offline-safe configuration layer. If the public environment variables are not present, the app will display clear setup guidance rather than pretending the cloud backend is configured.

## Testing

```bash
npm test
```

## Notes

This project is structured for real Supabase integration, but credentials and database setup still need to be configured in the external Supabase dashboard.
