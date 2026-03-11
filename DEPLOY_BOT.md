# Telegram Bot — Deploy Checklist

Project ref: `bitodtrjpebcqolpubgq`

## 1. Login to Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref bitodtrjpebcqolpubgq
```

## 2. Apply DB migration

Run `supabase/migrations/003_telegram_auth.sql` in the Supabase Dashboard SQL editor:
https://supabase.com/dashboard/project/bitodtrjpebcqolpubgq/sql/new

Or via CLI:
```bash
npx supabase db push
```

Also seed the single auth row (the app uses a fixed UUID):
```sql
INSERT INTO telegram_auth (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
```

## 3. Set secrets

```bash
npx supabase secrets set \
  TELEGRAM_BOT_TOKEN=8781931871:AAGZXi1yN6TbkbF4rqHntWrlD6k3FeOSHhI \
  ANTHROPIC_API_KEY=<your-anthropic-key> \
  TELEGRAM_WEBHOOK_SECRET=<generate-random-32-char-string> \
  CRON_SECRET=<generate-another-random-string>
```

Generate random strings: `openssl rand -hex 16`

## 4. Deploy Edge Functions

```bash
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy telegram-link --no-verify-jwt
npx supabase functions deploy telegram-cron --no-verify-jwt
```

After deploy, the function URLs will be:
```
https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-webhook
https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-link
https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-cron
```

## 5. Register Telegram webhook

Replace `<WEBHOOK_SECRET>` with the value you set above:
```bash
curl "https://api.telegram.org/bot8781931871:AAGZXi1yN6TbkbF4rqHntWrlD6k3FeOSHhI/setWebhook" \
  -d "url=https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

Verify:
```bash
curl "https://api.telegram.org/bot8781931871:AAGZXi1yN6TbkbF4rqHntWrlD6k3FeOSHhI/getWebhookInfo"
```

## 6. Set up cron (Supabase Dashboard)

In the Supabase Dashboard → Database → Extensions, enable `pg_cron`.

Then run in SQL editor:
```sql
-- Daily overdue check at 9am UTC
SELECT cron.schedule(
  'telegram-daily-overdue',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    'https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-cron',
    '{}',
    '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);

-- Monthly invoicing reminder on 2nd at 9am UTC
SELECT cron.schedule(
  'telegram-monthly-reminder',
  '0 9 2 * *',
  $$
  SELECT net.http_post(
    'https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-cron',
    '{}',
    '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
  );
  $$
);
```

## 7. Test

1. Open Settings in the app → Telegram Bot section
2. Click "Generate link code"
3. Send `/start <code>` to @nino_personal_bot in Telegram
4. Try: "list active projects"
5. Try: "create project TestCo, fixed 1000€"
6. Try: "show planned invoices for March"
7. Test cron manually:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" \
     https://bitodtrjpebcqolpubgq.supabase.co/functions/v1/telegram-cron
   ```
