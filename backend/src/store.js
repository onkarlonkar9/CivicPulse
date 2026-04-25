import { getCollection, ensureMongoIndexes } from './mongo.js';

const demoUserIds = new Set(['user-citizen-demo', 'user-admin-demo']);

function stripSeedIssues(issues) {
    return issues.filter((issue) => issue?.source !== 'seed');
}

function stripDemoUsers(users) {
    return users.filter((user) => !demoUserIds.has(user?.id));
}

function withoutMongoId(document) {
    if (!document) {
        return document;
    }

    const { _id, ...rest } = document;
    return rest;
}

function dedupeById(documents, label) {
    const seen = new Set();
    const deduped = [];
    let duplicates = 0;

    for (const document of documents) {
        if (!document || typeof document !== 'object') {
            continue;
        }

        const id = document.id;
        if (!id) {
            deduped.push(document);
            continue;
        }

        if (seen.has(id)) {
            duplicates += 1;
            continue;
        }

        seen.add(id);
        deduped.push(document);
    }

    if (duplicates > 0) {
        console.warn(`[store] Removed ${duplicates} duplicate ${label} record(s) by id`);
    }

    return deduped;
}

async function readCollection(name) {
    await ensureStorage();
    const collection = await getCollection(name);
    const documents = await collection.find({}).toArray();
    return documents.map(withoutMongoId);
}

async function replaceCollection(name, documents) {
    await ensureStorage();
    const collection = await getCollection(name);

    await collection.deleteMany({});

    if (documents.length > 0) {
        await collection.insertMany(documents);
    }
}

async function ensureUserReputationRecords(users) {
    const reputations = await getCollection('userReputations');

    await Promise.all(users.map((user) => reputations.updateOne(
        { userId: user.id },
        {
            $setOnInsert: {
                id: `rep-${user.id}`,
                userId: user.id,
                reputationScore: 0,
                issuesReported: 0,
                commentsAdded: 0,
                helpfulCount: 0,
                badges: [],
                createdAt: new Date().toISOString(),
            },
            $set: {
                updatedAt: new Date().toISOString(),
            },
        },
        { upsert: true }
    )));
}

async function syncIssueCounts(issues) {
    const reputations = await getCollection('userReputations');
    const counts = new Map();

    for (const issue of issues) {
        if (issue?.reporterId) {
            counts.set(issue.reporterId, (counts.get(issue.reporterId) || 0) + 1);
        }
    }

    const existing = await reputations.find({}).toArray();
    await Promise.all(existing.map((reputation) => reputations.updateOne(
        { userId: reputation.userId },
        {
            $set: {
                issuesReported: counts.get(reputation.userId) || 0,
                updatedAt: new Date().toISOString(),
            },
        }
    )));
}

export async function ensureStorage() {
    await ensureMongoIndexes();
}

export async function readIssues() {
    const issues = await readCollection('issues');
    return stripSeedIssues(issues);
}

export async function writeIssues(issues) {
    const sanitized = dedupeById(stripSeedIssues(issues), 'issue');
    await replaceCollection('issues', sanitized);
    await syncIssueCounts(sanitized);
}

export async function readUsers() {
    const users = await readCollection('users');
    return stripDemoUsers(users);
}

export async function writeUsers(users) {
    const sanitized = dedupeById(stripDemoUsers(users), 'user');
    await replaceCollection('users', sanitized);
    await ensureUserReputationRecords(sanitized);
}

export async function readInviteCodes() {
    return readCollection('inviteCodes');
}

export async function writeInviteCodes(invites) {
    await replaceCollection('inviteCodes', dedupeById(invites, 'invite'));
}

export async function readOtpCodes() {
    return readCollection('otpCodes');
}

export async function writeOtpCodes(otpCodes) {
    await replaceCollection('otpCodes', dedupeById(otpCodes, 'otp'));
}
