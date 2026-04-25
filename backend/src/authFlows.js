import { randomInt, randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';
import { normalizePhone, phonesMatch } from './phone.js';
import { readInviteCodes, readOtpCodes, readUsers, writeInviteCodes, writeOtpCodes, writeUsers } from './store.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function nowIso() {
    return new Date().toISOString();
}

function isExpired(isoDate) {
    return new Date(isoDate).getTime() <= Date.now();
}

function generateOtp() {
    return String(randomInt(100000, 1000000));
}

function generateInviteCode() {
    return `ADM-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createOtpChallenge({ phone, purpose, payload }) {
    const otpCodes = await readOtpCodes();
    const normalizedPhone = normalizePhone(phone);
    const nextOtpCodes = otpCodes.filter((entry) => !(phonesMatch(entry.phone, normalizedPhone) && entry.purpose === purpose));
    const otp = generateOtp();

    nextOtpCodes.unshift({
        id: `otp-${randomUUID()}`,
        phone: normalizedPhone,
        purpose,
        otp,
        payload,
        expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        createdAt: nowIso(),
    });

    await writeOtpCodes(nextOtpCodes);
    return otp;
}

export async function consumeOtpChallenge({ phone, purpose, otp }) {
    const otpCodes = await readOtpCodes();
    const normalizedPhone = normalizePhone(phone);
    const match = otpCodes.find((entry) => phonesMatch(entry.phone, normalizedPhone) && entry.purpose === purpose && entry.otp === otp);

    if (!match || isExpired(match.expiresAt)) {
        await writeOtpCodes(otpCodes.filter((entry) => !isExpired(entry.expiresAt)));
        return null;
    }

    await writeOtpCodes(otpCodes.filter((entry) => entry.id !== match.id && !isExpired(entry.expiresAt)));
    return match;
}

export async function createCitizenFromOtp(otpEntry) {
    const users = await readUsers();
    const existingUser = users.find((user) => phonesMatch(user.phone, otpEntry.phone));

    if (existingUser) {
        throw new Error('Phone number is already registered');
    }

    const user = {
        id: `user-${randomUUID()}`,
        name: otpEntry.payload.name,
        phone: normalizePhone(otpEntry.phone),
        passwordHash: await hashPassword(otpEntry.payload.password),
        role: 'citizen',
        wardId: null,
        wardName: null,
        createdAt: nowIso(),
    };

    users.unshift(user);
    await writeUsers(users);
    return user;
}

export async function createAdminInvite(createdBy) {
    const invites = await readInviteCodes();
    const code = generateInviteCode();
    const invite = {
        id: `invite-${randomUUID()}`,
        code,
        role: 'admin',
        createdBy,
        usedBy: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        createdAt: nowIso(),
    };

    invites.unshift(invite);
    await writeInviteCodes(invites);
    return invite;
}

export async function listActiveAdminInvites() {
    const invites = await readInviteCodes();
    const activeInvites = invites.filter((invite) => !invite.usedAt && !isExpired(invite.expiresAt));
    const sanitized = invites.filter((invite) => !isExpired(invite.expiresAt) || invite.usedAt);

    if (sanitized.length !== invites.length) {
        await writeInviteCodes(sanitized);
    }

    return activeInvites;
}

export async function consumeAdminInvite(code, usedByPhone) {
    const invites = await readInviteCodes();
    const invite = invites.find((entry) => entry.code === code && !entry.usedAt);

    if (!invite || isExpired(invite.expiresAt)) {
        await writeInviteCodes(invites.filter((entry) => !isExpired(entry.expiresAt) || entry.usedAt));
        return null;
    }

    invite.usedBy = normalizePhone(usedByPhone);
    invite.usedAt = nowIso();
    await writeInviteCodes(invites);
    return invite;
}
