import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function normalizeEnv(value) {
    const normalized = String(value ?? '').trim();

    if (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
        return normalized.slice(1, -1).trim();
    }

    return normalized;
}

function parseBooleanEnv(value, defaultValue = false) {
    const normalized = normalizeEnv(value).toLowerCase();

    if (!normalized) {
        return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export const config = {
    port: Number(process.env.PORT || 4000),
    adminBootstrapSecret: process.env.ADMIN_BOOTSTRAP_SECRET || 'change-this-admin-secret',
    otp: {
        exposeDevOtp: parseBooleanEnv(process.env.OTP_EXPOSE_DEV_CODE, false),
        whatsapp: {
            enabled: parseBooleanEnv(process.env.WHATSAPP_OTP_ENABLED, false),
            provider: normalizeEnv(process.env.WHATSAPP_OTP_PROVIDER || 'twilio').toLowerCase(),
            twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
            twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
            twilioFromNumber: process.env.TWILIO_WHATSAPP_FROM || '',
        },
    },
    webOrigins: (process.env.WEB_ORIGIN || 'http://localhost:5173,http://localhost:8080')
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    dataDir: path.join(rootDir, 'data'),
    uploadsDir: path.join(rootDir, 'uploads'),
    issuesFile: path.join(rootDir, 'data', 'issues.json'),
    usersFile: path.join(rootDir, 'data', 'users.json'),
    inviteCodesFile: path.join(rootDir, 'data', 'invite-codes.json'),
    otpCodesFile: path.join(rootDir, 'data', 'otp-codes.json'),
};
