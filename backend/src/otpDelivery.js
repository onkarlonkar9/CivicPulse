import { config } from './config.js';

function toIndianE164(phone) {
    const digits = String(phone || '').replace(/\D/g, '');

    if (digits.length === 10) {
        return `+91${digits}`;
    }

    if (digits.length === 12 && digits.startsWith('91')) {
        return `+${digits}`;
    }

    throw new Error('Phone number must be a valid Indian mobile number');
}

function assertTwilioConfigured() {
    const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = config.otp.whatsapp;

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
        throw new Error('WhatsApp OTP is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM');
    }
}

async function sendTwilioWhatsAppOtp(phone, otp) {
    assertTwilioConfigured();

    const to = `whatsapp:${toIndianE164(phone)}`;
    const from = config.otp.whatsapp.twilioFromNumber.startsWith('whatsapp:')
        ? config.otp.whatsapp.twilioFromNumber
        : `whatsapp:${config.otp.whatsapp.twilioFromNumber}`;

    const messageBody = `Your Pune Pulse OTP is ${otp}. It expires in 10 minutes. Do not share this code.`;
    const authHeader = Buffer.from(
        `${config.otp.whatsapp.twilioAccountSid}:${config.otp.whatsapp.twilioAuthToken}`
    ).toString('base64');

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.otp.whatsapp.twilioAccountSid}/Messages.json`,
        {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: to,
                From: from,
                Body: messageBody,
            }),
        }
    );

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const twilioMessage = payload?.message || `HTTP ${response.status}`;
        throw new Error(`Twilio WhatsApp OTP send failed: ${twilioMessage}`);
    }
}

export async function sendWhatsappOtp({ phone, otp }) {
    if (!config.otp.whatsapp.enabled) {
        throw new Error('WhatsApp OTP is disabled');
    }

    if (config.otp.whatsapp.provider === 'twilio') {
        await sendTwilioWhatsAppOtp(phone, otp);
        return;
    }

    throw new Error(`Unsupported WhatsApp OTP provider: ${config.otp.whatsapp.provider}`);
}

