# civic-pune

## WhatsApp OTP Setup (Real OTP)

Citizen OTP routes now support real WhatsApp delivery through Twilio.

1. Create a Twilio account with WhatsApp sender enabled (sandbox or approved sender).
2. Set backend environment variables:
   - `WHATSAPP_OTP_ENABLED=true`
   - `WHATSAPP_OTP_PROVIDER=twilio`
   - `TWILIO_ACCOUNT_SID=...`
   - `TWILIO_AUTH_TOKEN=...`
   - `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (or your approved WhatsApp sender)
3. Keep `OTP_EXPOSE_DEV_CODE=false` in production.

When `WHATSAPP_OTP_ENABLED=false`, OTP request APIs will fail with a clear error instead of returning mock OTPs.
`WHATSAPP_OTP_ENABLED` also accepts `TRUE`, `1`, `yes`, and quoted values like `"true"`.

## Docker Containerization

Run the full stack (`frontend` + `backend` + `mongo`):

```bash
docker compose up --build
```

App URLs:

- Frontend: `http://localhost:8080`
- API health: `http://localhost:4000/api/health`

Stop containers:

```bash
docker compose down
```

Stop and remove volumes (fresh DB + uploads):

```bash
docker compose down -v
```
