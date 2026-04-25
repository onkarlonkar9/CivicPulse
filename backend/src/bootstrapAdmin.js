import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';
import { normalizePhone, phonesMatch } from './phone.js';
import { ensureStorage, readUsers, writeUsers } from './store.js';

function readArg(name) {
    const prefix = `--${name}=`;
    const entry = process.argv.find((arg) => arg.startsWith(prefix));
    return entry ? entry.slice(prefix.length).trim() : '';
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isStrongPassword(password) {
    return typeof password === 'string'
        && password.length >= 12
        && /[a-z]/.test(password)
        && /[A-Z]/.test(password)
        && /[0-9]/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}

async function main() {
    const name = readArg('name');
    const phone = normalizePhone(readArg('phone'));
    const email = normalizeEmail(readArg('email'));
    const password = readArg('password');
    const role = readArg('role') || 'super-admin';

    if (!name || (!phone && !email) || !password) {
        console.error('Usage: npm --prefix backend run create:admin -- --name="PMC Admin" --phone="9999999999" --email="admin@example.com" --password="StrongPass!123" --role="super-admin"');
        process.exit(1);
    }

    if (!['admin', 'super-admin'].includes(role)) {
        console.error('Role must be "admin" or "super-admin".');
        process.exit(1);
    }

    if (!isStrongPassword(password)) {
        console.error('Password must be at least 12 chars and include uppercase, lowercase, number, and special character.');
        process.exit(1);
    }

    await ensureStorage();
    const users = await readUsers();
    const existingUser = users.find((user) => (
        (phone && phonesMatch(user.phone, phone))
        || (email && normalizeEmail(user.email) === email)
    ));

    if (existingUser) {
        existingUser.name = name;
        existingUser.role = role;
        existingUser.phone = phone || existingUser.phone || null;
        existingUser.email = email || existingUser.email || null;
        existingUser.passwordHash = await hashPassword(password);
        existingUser.updatedAt = new Date().toISOString();
        await writeUsers(users);
        console.log(`Updated existing user ${(phone || email)} to ${role}.`);
        return;
    }

    users.unshift({
        id: `user-${randomUUID()}`,
        name,
        phone: phone || null,
        email: email || null,
        passwordHash: await hashPassword(password),
        role,
        wardId: null,
        wardName: null,
        createdAt: new Date().toISOString(),
    });

    await writeUsers(users);
    console.log(`Created ${role} user ${(phone || email)}.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
