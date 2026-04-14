## Eventix

Точка входа: **`eventix.html`** + **`eventix.js`** + **`eventix.css`**. Данные — в **Supabase** (афиша, типы билетов, покупка через RPC `purchase_tickets`). Вход и регистрация — отдельная страница **«Вход»** в шапке.

- SQL: `supabase/migrations/001_purchase_rls.sql`
- Демо-афиша (рэп/хип-хоп): `supabase/seed_demo_rap_events.sql` — описание в `supabase/DEMO_DATA.txt`

### Быстрый старт (Windows)

1. Создай `.env` по примеру `.env.example` и заполни:
   - `EVENTIX_SUPABASE_URL`
   - `EVENTIX_SUPABASE_ANON_KEY` (только anon/publishable)
2. Запуск статики и API:

```bash
npm run dev
```

3. Открой: `http://127.0.0.1:5173/eventix.html` (корень `/` тоже ведёт на `eventix.html`).

### Что уже добавлено

- Конфиг Supabase подгружается на фронт с `GET /api/config`, поэтому ключи не нужно держать в `eventix.html`.
- Валидация форм: email/телефон, обязательное место, дата события только в будущем.
- В «Мои билеты» рендерится реальный QR по `ticket.code`.
