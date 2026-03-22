# Calon Stage Browser Smoke Checklist

## Environment

| Service | URL |
|---------|-----|
| Web | https://stage.calon.com.tr |
| Booking | https://stage-book.calon.com.tr |
| API | https://stage-api.calon.com.tr |

## Credentials

- Email: `owner@demo-salon.com`
- Password: `Demo1234!`
- Tenant: `demo-salon`

## 1. Login → Calendar

- [ ] Open https://stage.calon.com.tr/login
- [ ] Enter credentials, click "Giriş Yap"
- [ ] Redirects to `/calendar` (NOT `/dashboard`)
- [ ] Shell renders: sidebar, topbar, tenant name "Demo Salon"
- [ ] Weekly calendar is primary surface
- [ ] Appointment blocks visible with correct day/time positioning
- [ ] No auth redirect loop
- [ ] No hydration error in console

## 2. Calendar Operations

- [ ] Click an appointment block → detail sheet opens
- [ ] Detail shows: date, time, service, customer (clickable), staff, price, status
- [ ] Lifecycle buttons match current status (Onayla/İptal/Geldi etc.)
- [ ] Perform at least one status change → UI updates
- [ ] Refresh page → status persists
- [ ] Week navigation (prev/next) works

## 3. Booking → Calendar Visibility

- [ ] Open https://stage-book.calon.com.tr/booking/demo-salon
- [ ] Complete booking flow: service → staff → slot → customer info → confirm
- [ ] Return to dashboard calendar
- [ ] New appointment visible in correct day/time slot
- [ ] Detail matches booking data (service, customer, time)

## 4. Calendar ↔ Customer

- [ ] In appointment detail, click customer name
- [ ] Navigates to `/customers?highlight=<id>`
- [ ] Customer profile sheet auto-opens
- [ ] Profile shows: contact, stats, upcoming/past appointments
- [ ] Same appointment visible in profile

## 5. Dashboard Summary

- [ ] Navigate to `/dashboard` (via sidebar "Özet")
- [ ] Summary cards show today's numbers
- [ ] Upcoming appointments list populated
- [ ] "Takvime Git" is primary action
- [ ] Quick actions work (Takvim, Müşteriler, Hizmetler)

## 6. Catalog

- [ ] Navigate to `/catalog`
- [ ] Services tab: list of services with name/duration/price
- [ ] Products tab: list of products (may be empty)
- [ ] Search filters correctly
- [ ] Create a test service → appears in list
- [ ] Edit test service → changes reflected
- [ ] Delete test service → removed from list

## 7. Customers

- [ ] Navigate to `/customers`
- [ ] Customer list with avatar, name, phone, visit count
- [ ] Search works (server-side)
- [ ] Click customer → profile sheet with appointments

## 8. Staff / Services

- [ ] `/staff` shows personnel cards
- [ ] `/services` shows service table
- [ ] No crashes or blank screens

## 9. Console / Network

- [ ] DevTools Console: no uncaught errors
- [ ] DevTools Network: no 500 responses
- [ ] No failed fetches to API
- [ ] No CORS errors
- [ ] No auth 401 after successful login

## 10. Polling / Realtime Regression

- [ ] Stay on calendar for 60s
- [ ] Network tab: no request spam (polling interval respected)
- [ ] Switch tabs and return: no flood of requests
- [ ] No duplicate API calls on visibility change

## Pass Criteria

ALL checkboxes must be checked for PASS.
Any unchecked item must be documented with reason.
