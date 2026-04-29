# civic-pune

## Real OTP Setup (SMS + Email)

Citizen OTP routes now support real delivery over SMS (Twilio) and email (Resend).

1. Create a Twilio account and buy/verify an SMS sender number.
2. Create a Resend account and verify your sender domain/email.
3. Set backend environment variables:
   - `SMS_OTP_ENABLED=true`
   - `SMS_OTP_PROVIDER=twilio`
   - `TWILIO_ACCOUNT_SID=...`
   - `TWILIO_AUTH_TOKEN=...`
   - `TWILIO_SMS_FROM=+1XXXXXXXXXX`
   - `EMAIL_OTP_ENABLED=true`
   - `EMAIL_OTP_PROVIDER=resend`
   - `RESEND_API_KEY=...`
   - `EMAIL_OTP_FROM=alerts@yourdomain.com`
   - `OTP_EXPOSE_DEV_CODE=false`

Behavior:
- If user logs in/registers with phone, OTP is delivered via SMS.
- If user logs in/registers with email, OTP is delivered via email.
- If delivery channel is disabled or misconfigured, API returns a clear error.

Backward compatibility:
- Legacy variables `WHATSAPP_OTP_ENABLED`, `WHATSAPP_OTP_PROVIDER`, and `TWILIO_WHATSAPP_FROM` are still read as fallback for SMS config.

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
