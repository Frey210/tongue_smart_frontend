# Monitoring updates — 2026-11-16

## Record an event marker

1. Open an active examination in Monitoring.
2. Select a condition card, or choose Catatan kustom and type a note.
3. At the actual event, press **Rekam marker sekarang**. Selecting a card alone
   does not save anything. The timestamp is captured when this button is pressed.
4. Wait for **Tersimpan: [label] · [time]** and check **Marker terakhir**.
   An error means save was not confirmed. Custom text is retained for retry.
   Do not repeat a successful click unless another event really occurred.
5. During export, keep **Sertakan event marker** checked. Use the Event Markers
   sheet in Excel or `row_type=event_marker` rows in CSV for the full timeline.
   Sensor rows can also show a nearby marker (within one second); its original
   timestamp is in `event_marker_timestamp`. These annotations are not extra events.

## Patient instruction timer

Timer instruksi pasien sits below the graph controls. Choose **Hitung mundur**
(default 10 seconds; whole seconds 1–3600) or **Stopwatch**, then use Mulai,
Jeda/Lanjutkan, and Reset timer. It measures elapsed time independently from
the data polling interval. A throttled browser catches up from monotonic time,
but a sleeping browser cannot guarantee a punctual visual notification.

Timer expiry gives a visible status only. It does not stop the device, create a
marker, change the examination stage, or persist timing in the exported data.
Use the actual measurement controls to pause/finish the device. Timer state
resets on session change, leaving Monitoring or reloading; it pauses if the
session becomes inactive. A running timer cannot change mode/duration until paused.

## Export names

New filenames contain the session name and a short session ID, e.g.
`tongue-smart-MASSETER_KANAN-12345678-20261116-100000-123456.xlsx`.
Older archived files retain their existing filenames; create a new export.

## Verification

Run `npm run build`. Run the isolated Playwright fixture with the installed
Playwright skill executor and this repository's `tests/monitoring-export.cjs`.
It covers timer modes, pause/resume/reset, invalid duration, session changes,
marker selection versus saving, failed save/retry, download filename and mobile
layout. No real device command is issued by this fixture.
