import { readUsers } from './store.js';
import { normalizePhone } from './phone.js';

function byNewestFirst(a, b) {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
}

async function main() {
    const users = await readUsers();
    const buckets = new Map();

    for (const user of users) {
        const normalized = normalizePhone(user.phone);
        if (!normalized) {
            continue;
        }

        if (!buckets.has(normalized)) {
            buckets.set(normalized, []);
        }

        buckets.get(normalized).push(user);
    }

    const duplicates = [...buckets.entries()]
        .filter(([, bucket]) => bucket.length > 1)
        .map(([phone, bucket]) => ({
            phone,
            users: [...bucket].sort(byNewestFirst).map((user) => ({
                id: user.id,
                role: user.role,
                phoneStored: user.phone,
                createdAt: user.createdAt || null,
                updatedAt: user.updatedAt || null,
            })),
        }));

    console.log(`Total users: ${users.length}`);
    console.log(`Normalized duplicate phones: ${duplicates.length}`);

    if (duplicates.length > 0) {
        console.log(JSON.stringify(duplicates, null, 2));
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
