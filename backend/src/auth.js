import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readUsers } from './store.js';

const jwtSecret = process.env.JWT_SECRET || 'pune-pulse-dev-secret';

export function signToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            role: user.role,
            phone: user.phone,
        },
        jwtSecret,
        { expiresIn: '7d' }
    );
}

export async function comparePassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

export async function getUserFromRequest(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.slice('Bearer '.length);
        const payload = jwt.verify(token, jwtSecret);
        const users = await readUsers();
        return users.find((user) => user.id === payload.sub) || null;
    }
    catch {
        return null;
    }
}

export async function requireAuth(req, res, next) {
    const user = await getUserFromRequest(req);

    if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    req.user = user;
    next();
}

export async function requireAdmin(req, res, next) {
    const user = await getUserFromRequest(req);

    if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    if (!['admin', 'super-admin'].includes(user.role)) {
        res.status(403).json({ message: 'Admin access required' });
        return;
    }

    req.user = user;
    next();
}

export async function requireStaff(req, res, next) {
    const user = await getUserFromRequest(req);

    if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    if (!['employee', 'admin', 'super-admin'].includes(user.role)) {
        res.status(403).json({ message: 'Staff access required' });
        return;
    }

    req.user = user;
    next();
}

export async function requireSuperAdmin(req, res, next) {
    const user = await getUserFromRequest(req);

    if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    if (user.role !== 'super-admin') {
        res.status(403).json({ message: 'Super-admin access required' });
        return;
    }

    req.user = user;
    next();
}

export function toPublicUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email || null,
        role: user.role,
        wardId: user.wardId,
        wardName: user.wardName,
        area: user.area || null,
        address: user.address || null,
        pincode: user.pincode || null,
        employeeCode: user.employeeCode || null,
        designation: user.designation || null,
        assignedWardIds: user.assignedWardIds || [],
        taskCategories: user.taskCategories || [],
        active: typeof user.active === 'boolean' ? user.active : true,
        createdAt: user.createdAt,
    };
}
