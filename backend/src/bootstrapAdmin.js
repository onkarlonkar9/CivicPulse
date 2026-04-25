import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';
import { normalizePhone, phonesMatch } from './phone.js';
import { ensureStorage, readUsers, writeUsers } from './store.js';

function readArg(name) {
    const prefix = `--${name}=`;
    const entry = process.argv.find((arg) => arg.startsWith(prefix));
    return entry ? entry.slice(prefix.length).trim() : '';
}

async function main() {
    const name = readArg('name');
    const phone = normalizePhone(readArg('phone'));
    const password = readArg('password');
    const role = readArg('role') || 'super-admin';

    if (!name || !phone || !password) {
        console.error('Usage: npm --prefix backend run create:admin -- --name="PMC Admin" --phone="9999999999" --password="strongpass123" --role="super-admin"');
        process.exit(1);
    }

    if (password.length < 6) {
        console.error('Password must be at least 6 characters.');
        process.exit(1);
    }

    await ensureStorage();
    const users = await readUsers();
    const existingUser = users.find((user) => phonesMatch(user.phone, phone));

    if (existingUser) {
        existingUser.name = name;
        existingUser.role = role;
        existingUser.passwordHash = await hashPassword(password);
        existingUser.updatedAt = new Date().toISOString();
        await writeUsers(users);
        console.log(`Updated existing user ${phone} to ${role}.`);
        return;
    }

    users.unshift({
        id: `user-${randomUUID()}`,
        name,
        phone,
        passwordHash: await hashPassword(password),
        role,
        wardId: null,
        wardName: null,
        createdAt: new Date().toISOString(),
    });

    await writeUsers(users);
    console.log(`Created ${role} user ${phone}.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
