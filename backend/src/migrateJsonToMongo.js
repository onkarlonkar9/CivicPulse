import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { getCollection } from './mongo.js';
import { writeIssues, writeUsers, writeInviteCodes, writeOtpCodes } from './store.js';

async function readArrayFile(filePath) {
    if (!existsSync(filePath)) {
        return [];
    }

    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function migrateLegacyJsonData() {
    const usersCollection = await getCollection('users');
    const issuesCollection = await getCollection('issues');
    const inviteCodesCollection = await getCollection('inviteCodes');
    const otpCodesCollection = await getCollection('otpCodes');

    const [
        existingUsers,
        existingIssues,
        existingInvites,
        existingOtps,
        legacyUsers,
        legacyIssues,
        legacyInvites,
        legacyOtps,
    ] = await Promise.all([
        usersCollection.countDocuments(),
        issuesCollection.countDocuments(),
        inviteCodesCollection.countDocuments(),
        otpCodesCollection.countDocuments(),
        readArrayFile(config.usersFile),
        readArrayFile(config.issuesFile),
        readArrayFile(config.inviteCodesFile),
        readArrayFile(config.otpCodesFile),
    ]);

    if (existingUsers === 0 && legacyUsers.length > 0) {
        await writeUsers(legacyUsers);
    }

    if (existingIssues === 0 && legacyIssues.length > 0) {
        await writeIssues(legacyIssues);
    }

    if (existingInvites === 0 && legacyInvites.length > 0) {
        await writeInviteCodes(legacyInvites);
    }

    if (existingOtps === 0 && legacyOtps.length > 0) {
        await writeOtpCodes(legacyOtps);
    }
}
