import 'dotenv/config';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pune-pulse';

function inferDbName(uri) {
    try {
        const url = new URL(uri);
        const pathname = url.pathname?.replace(/^\//, '').trim();
        return pathname || 'pune-pulse';
    } catch {
        return 'pune-pulse';
    }
}

const dbName = process.env.MONGODB_DB_NAME || inferDbName(mongoUri);

let clientPromise;
let indexesPromise;

async function getClient() {
    if (!clientPromise) {
        const client = new MongoClient(mongoUri, {
            connectTimeoutMS: 5000,
            serverSelectionTimeoutMS: 5000,
        });
        clientPromise = client.connect();
    }

    return clientPromise;
}

export async function getDb() {
    const client = await getClient();
    return client.db(dbName);
}

export async function getCollection(name) {
    const db = await getDb();
    return db.collection(name);
}

export async function ensureMongoIndexes() {
    if (!indexesPromise) {
        indexesPromise = (async () => {
            const users = await getCollection('users');
            const issues = await getCollection('issues');
            const comments = await getCollection('comments');
            const issueVotes = await getCollection('issueVotes');
            const issueFollows = await getCollection('issueFollows');
            const issueVerifications = await getCollection('issueVerifications');
            const userReputations = await getCollection('userReputations');
            const inviteCodes = await getCollection('inviteCodes');
            const otpCodes = await getCollection('otpCodes');
            const notifications = await getCollection('notifications');

            await Promise.all([
                users.createIndex({ id: 1 }, { unique: true }),
                users.createIndex({ phone: 1 }, { unique: true }),
                issues.createIndex({ id: 1 }, { unique: true }),
                comments.createIndex({ id: 1 }, { unique: true }),
                comments.createIndex({ issueId: 1, createdAt: -1 }),
                issueVotes.createIndex({ id: 1 }, { unique: true }),
                issueVotes.createIndex({ issueId: 1, voteType: 1 }),
                issueVotes.createIndex({ userId: 1, issueId: 1 }, { unique: true }),
                issueFollows.createIndex({ id: 1 }, { unique: true }),
                issueFollows.createIndex({ userId: 1, issueId: 1 }, { unique: true }),
                issueFollows.createIndex({ issueId: 1 }),
                issueVerifications.createIndex({ id: 1 }, { unique: true }),
                issueVerifications.createIndex({ issueId: 1 }, { unique: true }),
                userReputations.createIndex({ id: 1 }, { unique: true }),
                userReputations.createIndex({ userId: 1 }, { unique: true }),
                inviteCodes.createIndex({ id: 1 }, { unique: true }),
                inviteCodes.createIndex({ code: 1 }, { unique: true }),
                otpCodes.createIndex({ id: 1 }, { unique: true }),
                notifications.createIndex({ id: 1 }, { unique: true }),
                notifications.createIndex({ userId: 1, createdAt: -1 }),
                notifications.createIndex({ userId: 1, read: 1 }),
            ]);
        })();
    }

    await indexesPromise;
}

export async function pingMongo() {
    const db = await getDb();
    await db.command({ ping: 1 });
}

export async function closeMongo() {
    if (!clientPromise) {
        return;
    }

    const client = await clientPromise;
    await client.close();
    clientPromise = null;
    indexesPromise = null;
}
