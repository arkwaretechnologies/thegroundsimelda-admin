# Deployment Guide — The Grounds Admin

## 1. Supabase

1. Use the **same Supabase project** as [The Grounds member PWA](https://github.com/arkwaretechnologies/thegroundsimelda).
2. Apply any additive admin migrations your project still needs (audit logs, TV displays, promo codes, `admin_role` on `profiles`, court/inventory extras, wallet approval, etc.). Do **not** recreate member PWA tables.
3. Confirm Realtime is enabled for:
   - `open_play_queue`
   - `rfid_scan_logs`
   - `attendance_logs` / attendance records
   - `bookings` / reservations
   - `wallet_transactions`
   - `open_play_matches`
   - `tv_displays`
   - `notification_campaigns`
   - `courts`
4. Create Storage buckets (optional): `avatars`, `court-images`, `branding`.
5. Create a staff user in Supabase Auth, then ensure a matching `profiles` row (same `id` as the auth user):

```sql
-- After signing up the user in Auth (or creating via dashboard), e.g. branch from The Grounds seed (20261102000001_the_grounds_seed.sql):
insert into public.profiles (
  id,
  full_name,
  role,
  admin_role,
  branch_id,
  status
)
values (
  '<auth-user-uuid>',
  'Alex Rivera',
  'admin',
  'super_admin',
  '39ff10ae-f2c4-42e8-9548-54c25a8af434',
  'active'
)
on conflict (id) do update set
  role = excluded.role,
  admin_role = excluded.admin_role,
  branch_id = excluded.branch_id,
  status = excluded.status;
```

Staff sign-in requires `profiles.role` in (`staff`, `admin`) and a non-null `admin_role` for permission mapping.

## 2. Vercel

1. Connect the GitHub repo.
2. Framework preset: **Next.js**.
3. Environment variables:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `NEXT_PUBLIC_APP_URL` | `https://your-admin.vercel.app` |

4. Deploy Production.
5. Add a custom admin domain if needed (e.g. `admin.yourdomain.com`).

## 3. Post-deploy checklist

- [ ] Login with staff account
- [ ] Role permissions hide unauthorized nav items
- [ ] Dashboard widgets load
- [ ] Queue + RFID realtime updates
- [ ] TV display `/tv/display/[id]` opens fullscreen
- [ ] Wallet approve/reject writes audit trail
- [ ] Branch filter ready for multi-site rollout

## 4. Multi-branch rollout

1. Insert additional rows in `branches`.
2. Assign `profiles.branch_id` for staff accounts.
3. Scope module queries by `branch_id` (schema + RLS).
4. Add consolidated reporting views that union branches for Super Admin.

## 5. Reservations calendar (member Book a court sync)

Apply member migrations on the shared project (if not already):

1. `supabase/migrations/20261109120000_court_schedule_blocks.sql` (from member repo or admin copy)
2. `supabase/migrations/20261110140000_create_booking_debit_after_insert.sql` (FCFS: booking insert before wallet debit)

Admin **Reservations** reads `bookings`, `court_schedule_blocks`, and `branch_settings.exclusive_open_hour` / `exclusive_close_hour`. Closures block member booking; paid `confirmed` bookings show as booked.

## 6. Hybrid court (exclusive by day, open play at night)

For a single court used for **hourly exclusive booking until 6 PM** and **open play sessions** in the evening:

1. **Settings → Pricing → Exclusive booking window:** set open `6`, close `18` (Manila hours; last exclusive slot 5–6 PM).
2. **Settings → Courts:** set **Court 1** to **Hybrid (exclusive + open play)** and save.
3. **Open Play Schedule:** create 6–9 PM and 9 PM–12 AM sessions; check **Court 1** under assigned courts (or edit existing sessions).
4. Member app **Book a court:** Exclusive tab shows hourly slots until 6 PM; Open Play tab lists evening sessions with court names.

## 7. Observability

- Enable Vercel Analytics
- Forward edge logs
- Optionally add Sentry via `SENTRY_DSN`
