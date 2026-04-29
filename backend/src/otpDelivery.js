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

function assertTwilioSmsConfigured() {
    const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = config.otp.sms;

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
        throw new Error('SMS OTP is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM');
    }
}

async function sendTwilioSmsOtp(phone, otp) {
    assertTwilioSmsConfigured();

    const from = config.otp.sms.twilioFromNumber;
    const to = from.startsWith('whatsapp:')
        ? `whatsapp:${toIndianE164(phone)}`
        : toIndianE164(phone);

    const messageBody = `Your Pune Pulse OTP is ${otp}. It expires in 10 minutes. Do not share this code.`;
    const authHeader = Buffer.from(
        `${config.otp.sms.twilioAccountSid}:${config.otp.sms.twilioAuthToken}`
    ).toString('base64');

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.otp.sms.twilioAccountSid}/Messages.json`,
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
        const twilioCode = payload?.code ? ` (Twilio code ${payload.code})` : '';
        const normalizedMessage = String(twilioMessage).toLowerCase();

        if (normalizedMessage.includes('mismatch between the') && normalizedMessage.includes('from')) {
            throw new Error(
                `Twilio SMS configuration mismatch${twilioCode}: TWILIO_SMS_FROM does not belong to TWILIO_ACCOUNT_SID. Use a sender from the same Twilio account/subaccount.`
            );
        }

        throw new Error(`Twilio SMS OTP send failed${twilioCode}: ${twilioMessage}`);
    }
}

function assertResendConfigured() {
    const { resendApiKey, fromAddress } = config.otp.email;
    if (!resendApiKey || !fromAddress) {
        throw new Error('Email OTP is not configured. Set RESEND_API_KEY and EMAIL_OTP_FROM');
    }
}

async function sendResendEmailOtp(email, otp) {
    assertResendConfigured();
    const messageBody = `Your Pune Pulse OTP is ${otp}. It expires in 10 minutes. Do not share this code.`;

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.otp.email.resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: config.otp.email.fromAddress,
            to: [email],
            subject: 'Your Pune Pulse OTP',
            text: messageBody,
        }),
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const apiMessage = payload?.message || payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Resend email OTP send failed: ${apiMessage}`);
    }
}

async function sendSmsOtp(phone, otp) {
    if (!config.otp.sms.enabled) {
        throw new Error('SMS OTP is disabled');
    }

    if (config.otp.sms.provider === 'twilio') {
        await sendTwilioSmsOtp(phone, otp);
        return;
    }

    throw new Error(`Unsupported SMS OTP provider: ${config.otp.sms.provider}`);
}

async function sendEmailOtp(email, otp) {
    if (!config.otp.email.enabled) {
        throw new Error('Email OTP is disabled');
    }

    if (config.otp.email.provider === 'resend') {
        await sendResendEmailOtp(email, otp);
        return;
    }

    throw new Error(`Unsupported email OTP provider: ${config.otp.email.provider}`);
}

export async function sendOtp({ phone, email, otp }) {
    if (phone) {
        await sendSmsOtp(phone, otp);
        return { channel: 'sms' };
    }

    if (email) {
        await sendEmailOtp(email, otp);
        return { channel: 'email' };
    }

    throw new Error('Phone or email is required for OTP delivery');
}

