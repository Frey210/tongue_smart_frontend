# Frontend Plan

## Tujuan

Menerapkan prototype `tongue-smart-research-dashboard` sebagai aplikasi riset yang dapat diuji dan dihubungkan ke API nyata. Prototype adalah referensi visual; data hard-coded dan runtime `dc` tidak dibawa ke produksi.

## Stack awal

- React + TypeScript + Vite
- CSS biasa dengan design tokens; tambah library komponen hanya jika pola berulang sudah nyata
- Native `fetch` untuk bootstrap; TanStack Query ditambahkan saat endpoint asynchronous pertama terhubung
- Router ditambahkan saat halaman kedua mulai diimplementasikan
- Library chart dipilih setelah bentuk payload realtime disepakati

## Struktur target

```text
src/
  app/          routing, providers, layout
  features/     auth, subjects, examinations, monitoring, results, exports, devices
  components/   komponen UI lintas fitur yang benar-benar dipakai ulang
  lib/          API client dan utilitas kecil
  styles/       tokens dan global styles
```

## Milestone

### F0 — Foundation

- Vite/React/TypeScript berjalan.
- Token warna dan tipografi desain tersedia.
- Shell aplikasi menampilkan status inisialisasi dan tautan ke PRD.
- Lint, typecheck, dan build lolos.

### F1 — Navigation and auth

- Login, session expiry, role-aware navigation.
- Layout sidebar/header responsif.
- Empty/loading/error/disconnected states.

### F2 — Research workflow

- Dashboard ringkasan.
- CRUD subjek terkode dan status consent.
- Wizard lima langkah dengan validasi capability perangkat.

### F3 — Live monitoring

- WebSocket lifecycle dan reconnect.
- Buffer grafik terbatas; UI tidak menyimpan seluruh raw session dalam memory.
- Tab EMG/tekanan/gaya/gabungan mengikuti capability.
- Pause view tidak menghentikan akuisisi perangkat.

### F4 — Results and export

- Ringkasan hasil, kualitas data, event marker, notes.
- Riwayat/filter/pagination.
- Request ekspor dan download CSV/XLSX.

## Kontrak awal frontend

- Semua DTO berasal dari schema OpenAPI backend.
- Timestamp ISO 8601 UTC.
- Nilai pengukuran: `{ value, unit, valid, quality }`.
- Frontend tidak mengubah raw value; formatting dilakukan hanya untuk display.
- Kanal yang tidak ada pada `device.capabilities` tidak dirender.

## Definition of done

- `npm run build` dan `npm run typecheck` lolos.
- Tidak ada data mock di production build tanpa label eksplisit.
- Keyboard focus, label form, contrast, dan reduced motion diperiksa.
- Disconnect/reconnect dan session expiry memiliki perilaku deterministik.
