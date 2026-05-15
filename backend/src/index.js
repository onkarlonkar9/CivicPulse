import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { categories } from './data/categories.js';
import { config } from './config.js';
import { comparePassword, getUserFromRequest, hashPassword, requireAdmin, requireAuth, requireStaff, requireSuperAdmin, signToken, toPublicUser } from './auth.js';
import { consumeOtpChallenge, createCitizenFromOtp, createOtpChallenge } from './authFlows.js';
import { categoryMap as seededCategoryMap } from './seed.js';
import { buildCityIssueStats, buildWardAnalytics } from './wardAnalytics.js';
import { buildDepartmentAnalytics, buildTrends } from './advancedAnalyticsService.js';
import { normalizePhone, phonesMatch } from './phone.js';
import { ensureStorage, readIssues, readTasks, readUsers, writeIssues, writeTasks, writeUsers } from './store.js';
import { migrateLegacyJsonData } from './migrateJsonToMongo.js';
import { buildTicketId, findWardByCoordinates, makeUploadedImagePath, toPublicIssue } from './utils.js';
import registerSocialRoutes from './socialRoutes.js';
import { calculateEstimatedResolutionTime, getUserNotifications, markNotificationAsRead, getUnreadCount, notifyStatusChange } from './notificationService.js';
import { checkDuplicateIssues, followIssue, getFollowedIssues, getTopVotedIssues, isUserFollowing, markIssueAsVerified, notifyFollowers, unfollowIssue } from './issueEngagementService.js';
import { buildWardMasterFromRemoteData, getWardMaster, parseWardMasterInput, saveWardMaster } from './wardMaster.js';
import { sendOtp, sendSmsMessage } from './otpDelivery.js';
import { moderateText } from './moderationService.js';
import { generateIssueSummary } from './summaryService.js';
import { detectImageAuthenticity, generateIssueNarrative, suggestCategory } from './aiCategorizationService.js';

const app = express();
const server = http.createServer(app);
const categoryMap = seededCategoryMap || new Map(categories.map((category) => [category.id, category]));
const wsServer = new WebSocketServer({ noServer: true });
const wsClients = new Map();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, callback) => callback(null, config.uploadsDir),
        filename: (_req, file, callback) => {
            const extension = path.extname(file.originalname || '') || '.jpg';
            callback(null, `${Date.now()}-${randomUUID()}${extension}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const phoneSchema = z.coerce.string().trim().min(10).max(20).transform(normalizePhone);
const emailSchema = z.coerce.string().trim().email().transform((value) => value.toLowerCase());
const loginPasswordSchema = z.coerce.string().trim().min(8).max(128);
const passwordSchema = z.coerce.string().trim().min(12).max(128)
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[0-9]/, 'Password must include at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character');
const nameSchema = z.coerce.string().trim().min(2).max(80);

// Rate limiters for security
const otpRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many OTP attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true',
});

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true',
});

const loginIdentifierSchema = z.object({
    identifier: z.coerce.string().trim().min(3).max(100),
    password: loginPasswordSchema,
});

const citizenProfileSchema = z.object({
    wardId: z.coerce.number().int().positive().optional(),
    wardName: z.coerce.string().trim().max(120).optional(),
    area: z.coerce.string().trim().min(2).max(120).optional(),
    address: z.coerce.string().trim().min(6).max(240).optional(),
    pincode: z.coerce.string().trim().regex(/^\d{6}$/).optional(),
});

const registerSchema = z.object({
    name: nameSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
}).merge(citizenProfileSchema).superRefine((value, context) => {
    if (!value.phone && !value.email) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['identifier'],
            message: 'Phone or email is required',
        });
    }
});

const otpVerifySchema = z.object({
    identifier: z.coerce.string().trim().min(3).max(100),
    otp: z.coerce.string().trim().length(6),
});

const createEmployeeSchema = z.object({
    name: nameSchema,
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    employeeCode: z.coerce.string().trim().min(4).max(20).regex(/^[A-Za-z0-9-]+$/).optional(),
    designation: z.coerce.string().trim().min(2).max(80),
    assignedWardIds: z.array(z.coerce.number().int().positive()).min(1),
    taskCategories: z.array(z.coerce.string().trim().min(1)).min(1),
}).superRefine((value, context) => {
    if (!value.phone && !value.email) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['email'],
            message: 'Phone or email is required',
        });
    }
});

const updateEmployeeSchema = z.object({
    designation: z.coerce.string().trim().min(2).max(80).optional(),
    assignedWardIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
    taskCategories: z.array(z.coerce.string().trim().min(1)).min(1).optional(),
    active: z.boolean().optional(),
});

const statusSchema = z.object({
    status: z.enum(['new', 'ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated']),
    note: z.string().trim().max(300).optional(),
});

const prioritySchema = z.object({
    priority: z.enum(['p1', 'p2', 'p3', 'p4']),
    note: z.string().trim().max(300).optional(),
});

const escalationSchema = z.object({
    toLevel: z.enum(['senior-staff', 'department-head', 'commissioner']),
    reason: z.string().trim().min(4).max(200),
    note: z.string().trim().max(300).optional(),
    priorityOverride: z.enum(['p1', 'p2', 'p3', 'p4']).optional(),
});

const verificationSchema = z.object({
    verified: z.boolean(),
});

const summarizeIssueSchema = z.object({
    title: z.coerce.string().trim().max(180).optional().default(''),
    description: z.coerce.string().trim().min(8).max(1000),
    category: z.coerce.string().trim().min(1).optional().default(''),
    wardName: z.coerce.string().trim().max(120).optional().default(''),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
});

const createIssueSchema = z.object({
    description: z.string().trim().min(8).max(1000).default('Issue reported by citizen'),
    category: z.string().trim().min(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    anonymous: z.union([z.boolean(), z.string()]).optional().transform((value) => value === true || value === 'true'),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
    locationDescription: z.string().trim().max(200).optional().default(''),
});
const duplicatePreviewSchema = z.object({
    category: z.string().trim().min(1),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
});

const wardLookupQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
});

const wardMasterUpdateSchema = z.object({
    wardDataSource: z.object({
        source: z.coerce.string().trim().min(2),
        url: z.coerce.string().trim().url(),
        lastVerifiedOn: z.coerce.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
        notes: z.coerce.string().trim().max(400).optional().default(''),
    }),
    wards: z.array(z.object({
        id: z.coerce.number().int().positive(),
        nameEn: z.coerce.string().trim().min(2),
        nameMr: z.coerce.string().trim().min(2),
        officeName: z.coerce.string().trim().min(2),
        officeAddress: z.coerce.string().trim().min(2),
        officePhone: z.coerce.string().trim().min(2),
        electoralWards: z.array(z.coerce.number().int().positive()).default([]),
        officeLat: z.coerce.number().min(-90).max(90),
        officeLng: z.coerce.number().min(-180).max(180),
    })).min(1),
});

const wardMasterSyncUrlSchema = z.object({
    url: z.coerce.string().trim().url(),
});

const issueFilterSaveSchema = z.object({
    name: z.coerce.string().trim().min(2).max(80),
    filters: z.object({
        keyword: z.coerce.string().trim().optional().default(''),
        location: z.coerce.string().trim().optional().default(''),
        category: z.coerce.string().trim().optional().default('all'),
        status: z.coerce.string().trim().optional().default('all'),
        severity: z.coerce.string().trim().optional().default('all'),
        wardId: z.coerce.string().trim().optional().default('all'),
        from: z.coerce.string().trim().optional().default(''),
        to: z.coerce.string().trim().optional().default(''),
        resolutionTimeMinDays: z.coerce.number().min(0).optional(),
        resolutionTimeMaxDays: z.coerce.number().min(0).optional(),
    }),
});

const notificationPreferenceSchema = z.object({
    channels: z.object({
        sms: z.boolean().optional(),
        email: z.boolean().optional(),
        inApp: z.boolean().optional(),
    }).optional(),
    frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
    categories: z.array(z.coerce.string().trim().min(1)).optional(),
    criticalAlertsOnly: z.boolean().optional(),
});

const feedbackSchema = z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.coerce.string().trim().max(500).optional(),
});

const taskStatusSchema = z.object({
    status: z.enum(['unassigned', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled']),
    note: z.coerce.string().trim().max(300).optional(),
});

const taskAssignSchema = z.object({
    employeeId: z.coerce.string().trim().min(1),
    expectedUpdatedAt: z.coerce.string().trim().optional(),
    note: z.coerce.string().trim().max(300).optional(),
});

function asyncHandler(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function formatIssuePath(path = []) {
    if (!Array.isArray(path) || path.length === 0) {
        return '';
    }

    return path
        .map((segment) => (typeof segment === 'number' ? String(segment) : segment))
        .join('.');
}

function sendValidationError(res, message, zodError) {
    res.status(400).json({
        message: message || 'Invalid request payload',
        errors: zodError.flatten(),
        errorDetails: zodError.issues.map((issue) => ({
            path: formatIssuePath(issue.path),
            message: issue.message,
            code: issue.code,
        })),
    });
}

function baseUrlFor(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function isOriginAllowedForRequest(req, origin) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');
    const allowsAllOrigins = config.webOrigins.includes('*');

    if (allowsAllOrigins || config.webOrigins.includes(normalizedOrigin)) {
        return true;
    }

    try {
        const originUrl = new URL(normalizedOrigin);
        const forwardedHost = req.get('x-forwarded-host');
        const requestHost = req.get('host');
        const effectiveHost = (forwardedHost || requestHost || '').trim();
        return Boolean(effectiveHost) && originUrl.host === effectiveHost;
    } catch {
        return false;
    }
}

function sortTimeline(issue) {
    return {
        ...issue,
        timeline: [...(issue.timeline || [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    };
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmailIdentifier(value) {
    return String(value || '').includes('@');
}

function normalizeIdentifier(identifier) {
    const normalized = String(identifier || '').trim();
    return isEmailIdentifier(normalized) ? normalizeEmail(normalized) : normalizePhone(normalized);
}

function identifiersMatch(user, identifier) {
    if (!user || !identifier) {
        return false;
    }

    if (isEmailIdentifier(identifier)) {
        return normalizeEmail(user.email) === normalizeEmail(identifier);
    }

    return phonesMatch(user.phone, identifier);
}

function hasCitizenContact(value) {
    return Boolean(value?.phone) || Boolean(value?.email);
}

function canEmployeeHandleIssue(user, issue) {
    if (!user || user.role !== 'employee') {
        return false;
    }

    const assignedWardIds = Array.isArray(user.assignedWardIds) ? user.assignedWardIds : [];
    const taskCategories = Array.isArray(user.taskCategories) ? user.taskCategories : [];
    const wardAllowed = assignedWardIds.includes(issue.wardId);
    const categoryAllowed = taskCategories.length === 0 || taskCategories.includes(issue.category);
    return wardAllowed && categoryAllowed;
}

function canEmployeeHandleTask(user, task) {
    if (!user || user.role !== 'employee') {
        return false;
    }

    const assignedWardIds = Array.isArray(user.assignedWardIds) ? user.assignedWardIds : [];
    const taskCategories = Array.isArray(user.taskCategories) ? user.taskCategories : [];
    const wardAllowed = assignedWardIds.includes(task.wardId);
    const categoryAllowed = taskCategories.length === 0 || taskCategories.includes(task.category);
    return wardAllowed && categoryAllowed;
}

function pickEmployeeAssignee(users, wardId, category) {
    const employees = users.filter((entry) => (
        entry.role === 'employee'
        && entry.active !== false
        && Array.isArray(entry.assignedWardIds)
        && entry.assignedWardIds.includes(wardId)
        && (
            !Array.isArray(entry.taskCategories)
            || entry.taskCategories.length === 0
            || entry.taskCategories.includes(category)
        )
    ));

    if (employees.length === 0) {
        return null;
    }

    return employees[0];
}

function canUserAccessTask(user, task) {
    if (!user || !task) {
        return false;
    }
    if (['admin', 'super-admin'].includes(user.role)) {
        return true;
    }
    if (user.role === 'employee') {
        return task.assignedToEmployeeId === user.id || canEmployeeHandleTask(user, task);
    }
    return false;
}

function getSlaDaysForPriority(priority) {
    if (priority === 'p1') return 1;
    if (priority === 'p2') return 2;
    if (priority === 'p3') return 4;
    return 7;
}

function buildDueAt(priority, fromIso = new Date().toISOString()) {
    const days = getSlaDaysForPriority(priority);
    const start = new Date(fromIso);
    start.setDate(start.getDate() + days);
    return start.toISOString();
}

const TASK_TRANSITIONS = {
    unassigned: ['assigned', 'cancelled'],
    assigned: ['in_progress', 'blocked', 'cancelled', 'unassigned'],
    in_progress: ['blocked', 'completed', 'cancelled'],
    blocked: ['assigned', 'in_progress', 'cancelled'],
    completed: [],
    cancelled: [],
};

async function syncTasksWithIssueStatus(issueId, issueStatus, actor = { id: 'system', role: 'system', name: 'System' }) {
    const tasks = await readTasks();
    const now = new Date().toISOString();
    let changed = false;

    const nextTasks = tasks.map((task) => {
        if (task.issueId !== issueId) {
            return task;
        }

        if (task.status === 'cancelled') {
            return task;
        }

        let nextStatus = null;
        if (issueStatus === 'inprog' && ['unassigned', 'assigned', 'blocked'].includes(task.status)) {
            nextStatus = 'in_progress';
        } else if (['resolved', 'verified', 'closed'].includes(issueStatus) && task.status !== 'completed') {
            nextStatus = 'completed';
        } else if (issueStatus === 'reopened' && ['completed', 'blocked'].includes(task.status)) {
            nextStatus = task.assignedToEmployeeId ? 'assigned' : 'unassigned';
        }

        if (!nextStatus || nextStatus === task.status) {
            return task;
        }

        changed = true;
        return {
            ...task,
            status: nextStatus,
            updatedAt: now,
            timeline: [
                ...(task.timeline || []),
                {
                    status: nextStatus,
                    timestamp: now,
                    actorId: actor.id,
                    actorRole: actor.role,
                    actorName: actor.name,
                    note: `Synced from issue status: ${issueStatus}`,
                },
            ],
        };
    });

    if (changed) {
        await writeTasks(nextTasks);
    }
}

function isIssueAcknowledgedByAssignedEmployee(issue) {
    const hasExplicitAcknowledgment = Boolean(
        issue?.acknowledgedByEmployeeId
        && issue?.acknowledgedByWardId
        && Number(issue.acknowledgedByWardId) === Number(issue.wardId)
    );

    if (hasExplicitAcknowledgment) {
        return true;
    }

    // Backward compatibility: older records may not have acknowledgment metadata.
    // In those cases, any status after "new" implies staff has already picked it up.
    const status = String(issue?.status || '').toLowerCase();
    return ['ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated'].includes(status);
}

async function validatePasswordAndUpgrade(user, users, candidatePassword) {
    if (!user) {
        return false;
    }

    const passwordCandidates = [candidatePassword];
    const trimmedPassword = typeof candidatePassword === 'string' ? candidatePassword.trim() : candidatePassword;
    if (trimmedPassword && trimmedPassword !== candidatePassword) {
        passwordCandidates.push(trimmedPassword);
    }

    if (user.passwordHash) {
        for (const password of passwordCandidates) {
            try {
                const isValid = await comparePassword(password, user.passwordHash);
                if (isValid) {
                    return true;
                }
            } catch {
            }
        }
        return false;
    }

    if (typeof user.password === 'string' && user.password.length > 0) {
        const matchingPassword = passwordCandidates.find((password) => user.password === password);
        const isValid = Boolean(matchingPassword);

        if (isValid) {
            user.passwordHash = await hashPassword(matchingPassword);
            delete user.password;
            user.updatedAt = new Date().toISOString();
            await writeUsers(users);
        }

        return isValid;
    }

    return false;
}

function sortUsersByRecency(users) {
    return [...users].sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
    });
}

async function resolveUserFromToken(token) {
    if (!token) {
        return null;
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const users = await readUsers();
        return users.find((entry) => entry.id === payload.sub) || null;
    } catch {
        return null;
    }
}

function broadcastEvent(event, audience = () => true) {
    const payload = JSON.stringify(event);
    for (const [socket, user] of wsClients.entries()) {
        if (socket.readyState !== socket.OPEN) {
            continue;
        }
        if (!audience(user)) {
            continue;
        }
        socket.send(payload);
    }
}

function getResolvedDays(issue) {
    if (!issue?.createdAt || !Array.isArray(issue?.timeline)) {
        return null;
    }
    const resolvedEvent = issue.timeline.find((entry) => ['resolved', 'verified', 'closed'].includes(entry?.status));
    if (!resolvedEvent?.timestamp) {
        return null;
    }
    const created = new Date(issue.createdAt).getTime();
    const resolved = new Date(resolvedEvent.timestamp).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(resolved) || resolved < created) {
        return null;
    }
    return (resolved - created) / (1000 * 60 * 60 * 24);
}

function matchesKeyword(issue, keyword) {
    if (!keyword) {
        return true;
    }
    const needle = keyword.toLowerCase();
    const haystack = [
        issue.id, issue.title, issue.titleMr, issue.description, issue.descriptionMr,
        issue.category, issue.status, issue.wardName, issue.wardNameMr, issue.locationDescription,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
}

function createNotificationDefaults() {
    return {
        channels: { sms: false, email: true, inApp: true },
        frequency: 'instant',
        categories: [],
        criticalAlertsOnly: false,
    };
}

function generateEmployeeCode(users) {
    const prefix = 'EMP-';
    const maxSerial = users.reduce((highest, user) => {
        const code = String(user?.employeeCode || '').toUpperCase();
        if (!code.startsWith(prefix)) {
            return highest;
        }

        const numeric = Number.parseInt(code.slice(prefix.length), 10);
        if (!Number.isNaN(numeric)) {
            return Math.max(highest, numeric);
        }

        return highest;
    }, 1000);

    return `${prefix}${String(maxSerial + 1).padStart(4, '0')}`;
}

async function findUserByCredentials({ users, phone, password, roles }) {
    const candidates = sortUsersByRecency(
        users.filter((entry) => identifiersMatch(entry, phone))
    ).filter((entry) => !roles || roles.includes(entry.role));

    for (const candidate of candidates) {
        const isValidPassword = await validatePasswordAndUpgrade(candidate, users, password);
        if (isValidPassword) {
            return candidate;
        }
    }

    return null;
}

app.use(helmet()); // Security headers
app.use(cors((req, callback) => {
    const origin = req.get('origin');

    if (isOriginAllowedForRequest(req, origin)) {
        callback(null, {
            origin: true,
            credentials: true,
        });
        return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
}));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadsDir));

wsServer.on('connection', (socket, user) => {
    wsClients.set(socket, user);
    socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }));
    socket.on('close', () => wsClients.delete(socket));
});

server.on('upgrade', async (request, socket, head) => {
    try {
        const requestUrl = new URL(request.url, 'http://localhost');
        if (requestUrl.pathname !== '/ws') {
            socket.destroy();
            return;
        }
        const token = requestUrl.searchParams.get('token') || '';
        const user = await resolveUserFromToken(token);
        if (!user) {
            socket.destroy();
            return;
        }
        wsServer.handleUpgrade(request, socket, head, (ws) => {
            wsServer.emit('connection', ws, user);
        });
    } catch {
        socket.destroy();
    }
});

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'pune-pulse-api' });
});

app.post('/api/auth/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    if (!hasCitizenContact(parsed.data)) {
        res.status(400).json({ message: 'Phone or email is required' });
        return;
    }

    const users = await readUsers();
    const existingUser = users.find((user) => (
        (parsed.data.phone && phonesMatch(user.phone, parsed.data.phone))
        || (parsed.data.email && normalizeEmail(user.email) === normalizeEmail(parsed.data.email))
    ));

    if (existingUser) {
        res.status(409).json({ message: 'Phone or email is already registered' });
        return;
    }

    const user = {
        id: `user-${randomUUID()}`,
        name: parsed.data.name,
        phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
        email: parsed.data.email ? normalizeEmail(parsed.data.email) : null,
        passwordHash: await hashPassword(parsed.data.password),
        role: 'citizen',
        wardId: parsed.data.wardId || null,
        wardName: parsed.data.wardName || null,
        area: parsed.data.area || null,
        address: parsed.data.address || null,
        pincode: parsed.data.pincode || null,
        createdAt: new Date().toISOString(),
    };

    users.unshift(user);
    await writeUsers(users);

    res.status(201).json({
        token: signToken(user),
        user: toPublicUser(user),
    });
});

app.post('/api/auth/citizen/request-register-otp', otpRateLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    if (!hasCitizenContact(parsed.data)) {
        res.status(400).json({ message: 'Phone or email is required' });
        return;
    }

    const users = await readUsers();
    const existingUser = users.find((user) => (
        (parsed.data.phone && phonesMatch(user.phone, parsed.data.phone))
        || (parsed.data.email && normalizeEmail(user.email) === normalizeEmail(parsed.data.email))
    ));

    if (existingUser) {
        res.status(409).json({ message: 'Phone or email is already registered' });
        return;
    }

    const normalizedIdentifier = parsed.data.email
        ? normalizeEmail(parsed.data.email)
        : normalizePhone(parsed.data.phone);

    const otp = await createOtpChallenge({
        phone: normalizedIdentifier,
        purpose: 'citizen-register',
        payload: {
            name: parsed.data.name,
            password: parsed.data.password,
            phone: parsed.data.phone ? normalizePhone(parsed.data.phone) : null,
            email: parsed.data.email ? normalizeEmail(parsed.data.email) : null,
            wardId: parsed.data.wardId || null,
            wardName: parsed.data.wardName || null,
            area: parsed.data.area || null,
            address: parsed.data.address || null,
            pincode: parsed.data.pincode || null,
        },
    });

    let delivery;
    try {
        delivery = await sendOtp({
            phone: parsed.data.phone || null,
            email: parsed.data.phone ? null : parsed.data.email,
            otp,
        });
    } catch (error) {
        res.status(502).json({ message: `Failed to send OTP: ${error.message}` });
        return;
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: `OTP sent via ${delivery.channel} for citizen registration`, devOtp: otp }
            : { message: `OTP sent via ${delivery.channel} for citizen registration` }
    );
});

app.post('/api/auth/citizen/verify-register-otp', otpRateLimiter, async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const otpEntry = await consumeOtpChallenge({
        phone: normalizeIdentifier(parsed.data.identifier),
        purpose: 'citizen-register',
        otp: parsed.data.otp,
    });

    if (!otpEntry) {
        res.status(400).json({ message: 'Invalid or expired OTP' });
        return;
    }

    try {
        const user = await createCitizenFromOtp(otpEntry);
        res.status(201).json({
            token: signToken(user),
            user: toPublicUser(user),
        });
    } catch (error) {
        res.status(409).json({ message: error.message });
    }
});

app.post('/api/auth/citizen/request-login-otp', loginRateLimiter, async (req, res) => {
    const parsed = loginIdentifierSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const user = await findUserByCredentials({
        users,
        phone: parsed.data.identifier,
        password: parsed.data.password,
        roles: ['citizen'],
    });

    if (!user) {
        res.status(401).json({ message: 'Invalid login credentials' });
        return;
    }

    const otp = await createOtpChallenge({
        phone: normalizeEmail(user.email) || normalizePhone(user.phone),
        purpose: 'citizen-login',
        payload: { userId: user.id },
    });

    let delivery;
    try {
        delivery = await sendOtp({
            phone: user.phone || null,
            email: user.phone ? null : user.email,
            otp,
        });
    } catch (error) {
        res.status(502).json({ message: `Failed to send OTP: ${error.message}` });
        return;
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: `OTP sent via ${delivery.channel} for citizen login`, devOtp: otp }
            : { message: `OTP sent via ${delivery.channel} for citizen login` }
    );
});

app.post('/api/auth/citizen/verify-login-otp', otpRateLimiter, async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const otpEntry = await consumeOtpChallenge({
        phone: normalizeIdentifier(parsed.data.identifier),
        purpose: 'citizen-login',
        otp: parsed.data.otp,
    });

    if (!otpEntry) {
        res.status(400).json({ message: 'Invalid or expired OTP' });
        return;
    }

    const users = await readUsers();
    const user = users.find((entry) => (
        entry.id === otpEntry.payload.userId
        && identifiersMatch(entry, parsed.data.identifier)
    ));

    if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
    }

    res.json({
        token: signToken(user),
        user: toPublicUser(user),
    });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const parsed = loginIdentifierSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const user = await findUserByCredentials({
        users,
        phone: parsed.data.identifier,
        password: parsed.data.password,
        roles: ['employee', 'admin', 'super-admin'],
    });

    if (!user) {
        res.status(401).json({ message: 'Invalid login credentials' });
        return;
    }

    if (!['employee', 'admin', 'super-admin'].includes(user.role)) {
        res.status(403).json({ message: 'Citizen accounts must use OTP login' });
        return;
    }

    if (user.role === 'employee' && user.active === false) {
        res.status(403).json({ message: 'Employee account is inactive' });
        return;
    }

    res.json({
        token: signToken(user),
        user: toPublicUser(user),
    });
}));

app.get('/api/auth/me', requireAuth, async (req, res) => {
    res.json({ user: toPublicUser(req.user) });
});

app.get('/api/issues', async (req, res) => {
    const issues = await readIssues();
    const user = await getUserFromRequest(req);
    const status = req.query.status?.toString();
    const category = req.query.category?.toString();
    const acknowledgedOnly = ['1', 'true', 'yes'].includes(String(req.query.acknowledgedOnly || '').toLowerCase());
    const keyword = String(req.query.keyword || '').trim();
    const location = String(req.query.location || '').trim();
    const severity = String(req.query.severity || '').trim();
    const wardId = String(req.query.wardId || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const resolutionTimeMinDays = Number(req.query.resolutionTimeMinDays);
    const resolutionTimeMaxDays = Number(req.query.resolutionTimeMaxDays);
    const moderation = String(req.query.moderation || 'all').trim().toLowerCase();
    const isStaffUser = ['employee', 'admin', 'super-admin'].includes(user?.role);
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const filteredIssues = issues
        .filter((issue) => {
            if (acknowledgedOnly && !isIssueAcknowledgedByAssignedEmployee(issue)) {
                return false;
            }

            if (!isStaffUser) {
                return isIssueAcknowledgedByAssignedEmployee(issue);
            }

            if (user?.role === 'employee') {
                return canEmployeeHandleIssue(user, issue);
            }

            return true;
        })
        .filter((issue) => !status || status === 'all' || issue.status === status)
        .filter((issue) => !category || category === 'all' || issue.category === category)
        .filter((issue) => !severity || severity === 'all' || issue.severity === severity)
        .filter((issue) => !wardId || wardId === 'all' || String(issue.wardId) === wardId)
        .filter((issue) => !location || `${issue.wardName || ''} ${issue.locationDescription || ''}`.toLowerCase().includes(location.toLowerCase()))
        .filter((issue) => matchesKeyword(issue, keyword))
        .filter((issue) => {
            if (!fromDate && !toDate) {
                return true;
            }
            const createdAt = new Date(issue.createdAt);
            if (fromDate && createdAt < fromDate) {
                return false;
            }
            if (toDate && createdAt > toDate) {
                return false;
            }
            return true;
        })
        .filter((issue) => {
            if (moderation === 'flagged') {
                return issue.moderationFlag === true;
            }
            if (moderation === 'clean') {
                return issue.moderationFlag !== true;
            }
            return true;
        })
        .filter((issue) => {
            const minValid = Number.isFinite(resolutionTimeMinDays);
            const maxValid = Number.isFinite(resolutionTimeMaxDays);
            if (!minValid && !maxValid) {
                return true;
            }
            const resolvedDays = getResolvedDays(issue);
            if (resolvedDays == null) {
                return false;
            }
            if (minValid && resolvedDays < resolutionTimeMinDays) {
                return false;
            }
            if (maxValid && resolvedDays > resolutionTimeMaxDays) {
                return false;
            }
            return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((issue) => {
            const publicIssue = toPublicIssue(sortTimeline(issue), baseUrlFor(req));
            if (!['resolved', 'verified', 'closed'].includes(issue.status)) {
                publicIssue.estimatedResolutionDays = calculateEstimatedResolutionTime(issue, issues);
            }
            return publicIssue;
        });

    res.json({ issues: filteredIssues });
});

app.get('/api/issues/:id', async (req, res) => {
    const issues = await readIssues();
    const user = await getUserFromRequest(req);
    const issue = issues.find((entry) => entry.id === req.params.id);

    if (!issue) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }
    const isStaffUser = ['employee', 'admin', 'super-admin'].includes(user?.role);

    if (!isStaffUser && !isIssueAcknowledgedByAssignedEmployee(issue)) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    if (user?.role === 'employee' && !canEmployeeHandleIssue(user, issue)) {
        res.status(403).json({ message: 'This issue is outside your assigned ward/tasks' });
        return;
    }

    const publicIssue = toPublicIssue(sortTimeline(issue), baseUrlFor(req));
    if (!['resolved', 'verified', 'closed'].includes(issue.status)) {
        publicIssue.estimatedResolutionDays = calculateEstimatedResolutionTime(issue, issues);
    }

    res.json({ issue: publicIssue });
});

app.get('/api/wards/lookup', async (req, res) => {
    const parsed = wardLookupQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const wardMaster = await getWardMaster();
    const ward = findWardByCoordinates(parsed.data.lat, parsed.data.lng, wardMaster.wards);
    if (!ward) {
        res.status(404).json({ message: 'Ward not found for provided coordinates' });
        return;
    }

    res.json({ ward });
});

app.post('/api/issues', requireAuth, upload.array('photos', 5), asyncHandler(async (req, res) => {
    const parsed = createIssueSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const user = req.user;
    const { description, category, severity, anonymous, latitude, longitude, locationDescription } = parsed.data;
    const moderation = moderateText(`${description}\n${locationDescription || ''}`);
    if (moderation.status === 'blocked') {
        res.status(422).json({
            message: 'Issue content violates community guidelines',
            moderation,
        });
        return;
    }
    const wardMaster = await getWardMaster();
    const ward = findWardByCoordinates(latitude, longitude, wardMaster.wards);

    if (!ward) {
        res.status(400).json({ message: 'Selected location is outside the supported Pune ward boundary data' });
        return;
    }

    if (user?.id) {
        const recentSameReporterIssue = issues.find((issue) => {
            if ((issue.reporterPrivateId || issue.reporterId) !== user.id) {
                return false;
            }

            const createdAt = new Date(issue.createdAt).getTime();
            return Number.isFinite(createdAt) && Date.now() - createdAt < 60 * 1000;
        });

        if (recentSameReporterIssue) {
            res.status(429).json({
                message: 'Please wait a minute before submitting another issue report',
            });
            return;
        }
    }

    let duplicates = [];
    try {
        duplicates = await checkDuplicateIssues({
            category,
            wardId: ward.id,
            lat: latitude,
            lng: longitude,
        });
    } catch (error) {
        console.error('[issues] duplicate detection failed, continuing without block:', error?.message || error);
    }

    if (duplicates.length > 0) {
        res.status(409).json({
            message: 'A similar issue is already reported nearby. Please use Me Too on the existing issue.',
            duplicates: duplicates.slice(0, 3).map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req))),
        });
        return;
    }

    const categoryInfo = categoryMap.get(category);
    const issueId = buildTicketId(issues);
    const now = new Date().toISOString();
    const fallbackTitle = categoryInfo ? `${categoryInfo.department} issue near ${ward.nameEn}` : `Civic issue near ${ward.nameEn}`;
    const narrative = await generateIssueNarrative({
        description,
        category,
        wardName: ward.nameEn,
        severity,
    });
    const title = narrative?.title || fallbackTitle;
    const titleMr = narrative?.titleMr || title;
    const aiSummary = narrative?.summary || generateIssueSummary({ title: fallbackTitle, description, category, wardName: ward.nameEn, severity });
    const aiSummaryMr = narrative?.summaryMr || aiSummary;

    const files = req.files || [];
    const imageUrls = files.length > 0 
        ? files.map(file => makeUploadedImagePath(file.filename))
        : ['https://images.unsplash.com/photo-1584463699037-bd52eb68ab27?w=400&h=300&fit=crop'];

    const issue = {
        id: issueId,
        title,
        titleMr,
        description,
        descriptionMr: description,
        aiSummary,
        aiSummaryMr,
        category,
        status: 'new',
        severity,
        priority: severity === 'critical' ? 'p1' : severity === 'high' ? 'p2' : severity === 'medium' ? 'p3' : 'p4',
        wardId: ward.id,
        wardName: ward.nameEn,
        wardNameMr: ward.nameMr,
        lat: latitude,
        lng: longitude,
        locationDescription,
        imageUrl: imageUrls[0],
        imageUrls,
        resolvedImageUrl: null,
        createdAt: now,
        updatedAt: now,
        anonymous,
        reporterName: anonymous ? null : user?.name || 'Citizen Reporter',
        reporterId: anonymous ? null : user?.id || null,
        reporterPrivateId: user?.id || null,
        reporterNamePrivate: user?.name || null,
        timeline: [
            {
                status: 'new',
                timestamp: now,
                note: 'Issue submitted by citizen',
            },
        ],
        acknowledgedByEmployeeId: null,
        acknowledgedByWardId: null,
        acknowledgedAt: null,
        verification: null,
        escalationHistory: [],
        moderation,
        moderationFlag: moderation.status === 'review',
        source: user ? 'authenticated-user' : 'user',
    };

    issues.unshift(issue);
    await writeIssues(issues);

    const users = await readUsers();
    const assignedEmployee = pickEmployeeAssignee(users, ward.id, category);
    const taskNow = new Date().toISOString();
    const task = {
        id: `task-${Date.now()}-${randomUUID()}`,
        issueId: issue.id,
        wardId: issue.wardId,
        category: issue.category,
        priority: issue.priority || 'p3',
        dueAt: buildDueAt(issue.priority || 'p3', taskNow),
        status: assignedEmployee ? 'assigned' : 'unassigned',
        assignedToEmployeeId: assignedEmployee?.id || null,
        assignedToEmployeeName: assignedEmployee?.name || null,
        assignedBy: 'system',
        note: assignedEmployee ? 'Auto-assigned on issue creation' : 'No eligible employee found for auto-assignment',
        createdAt: taskNow,
        updatedAt: taskNow,
        timeline: [
            {
                status: assignedEmployee ? 'assigned' : 'unassigned',
                timestamp: taskNow,
                actorId: 'system',
                actorRole: 'system',
                note: assignedEmployee ? `Assigned to ${assignedEmployee.name}` : 'Created in unassigned queue',
            },
        ],
    };
    const tasks = await readTasks();
    tasks.unshift(task);
    await writeTasks(tasks);
    const publicIssue = toPublicIssue(issue, baseUrlFor(req));
    broadcastEvent({ type: 'issue_created', issue: publicIssue }, () => true);
    if (issue.severity === 'critical') {
        broadcastEvent({ type: 'critical_alert', issue: publicIssue }, (wsUser) => ['employee', 'admin', 'super-admin'].includes(wsUser?.role));
    }

    res.status(201).json({
        message: 'Issue created successfully',
        ticketId: publicIssue.id,
        issue: publicIssue,
    });
}));

app.post('/api/issues/duplicate-preview', asyncHandler(async (req, res) => {
    const parsed = duplicatePreviewSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const wardMaster = await getWardMaster();
    const ward = findWardByCoordinates(parsed.data.latitude, parsed.data.longitude, wardMaster.wards);
    if (!ward) {
        res.json({ duplicates: [] });
        return;
    }

    const duplicates = await checkDuplicateIssues({
        category: parsed.data.category,
        wardId: ward.id,
        lat: parsed.data.latitude,
        lng: parsed.data.longitude,
        description: '',
        locationDescription: '',
    });

    res.json({
        duplicates: duplicates.slice(0, 3).map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req))),
    });
}));

app.get('/api/tasks/my', requireStaff, async (req, res) => {
    const tasks = await readTasks();
    const taskIssues = await readIssues();
    const issueById = new Map(taskIssues.map((issue) => [issue.id, issue]));
    const now = Date.now();

    const visibleTasks = tasks
        .filter((task) => {
            if (req.user.role === 'employee') {
                return task.assignedToEmployeeId === req.user.id || canEmployeeHandleTask(req.user, task);
            }
            return true;
        })
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
        .map((task) => ({
            ...task,
            isOverdue: Boolean(task.dueAt) && new Date(task.dueAt).getTime() < now && !['completed', 'cancelled'].includes(task.status),
            issue: issueById.get(task.issueId) ? toPublicIssue(sortTimeline(issueById.get(task.issueId)), baseUrlFor(req)) : null,
        }));

    res.json({ tasks: visibleTasks });
});

app.patch('/api/tasks/:id/status', requireStaff, async (req, res) => {
    const parsed = taskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const tasks = await readTasks();
    const taskIndex = tasks.findIndex((entry) => entry.id === req.params.id);
    if (taskIndex === -1) {
        res.status(404).json({ message: 'Task not found' });
        return;
    }

    const currentTask = tasks[taskIndex];
    if (!canUserAccessTask(req.user, currentTask)) {
        res.status(403).json({ message: 'Task is outside your access scope' });
        return;
    }

    const now = new Date().toISOString();
    const nextStatus = parsed.data.status;
    const allowedTransitions = TASK_TRANSITIONS[currentTask.status] || [];
    if (nextStatus !== currentTask.status && !allowedTransitions.includes(nextStatus)) {
        res.status(400).json({ message: `Invalid task transition from ${currentTask.status} to ${nextStatus}` });
        return;
    }
    const note = parsed.data.note || `Task moved to ${nextStatus}`;
    const updatedTask = {
        ...currentTask,
        status: nextStatus,
        updatedAt: now,
        timeline: [
            ...(currentTask.timeline || []),
            {
                status: nextStatus,
                timestamp: now,
                actorId: req.user.id,
                actorRole: req.user.role,
                actorName: req.user.name,
                note,
            },
        ],
    };

    tasks[taskIndex] = updatedTask;
    await writeTasks(tasks);

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === updatedTask.issueId);
    let publicIssue = null;
    if (issueIndex !== -1) {
        const issue = issues[issueIndex];
        let derivedIssueStatus = null;
        if (nextStatus === 'in_progress' && ['new', 'ack'].includes(issue.status)) {
            derivedIssueStatus = 'inprog';
        } else if (nextStatus === 'completed' && ['new', 'ack', 'inprog', 'reopened', 'escalated'].includes(issue.status)) {
            derivedIssueStatus = 'resolved';
        }

        if (derivedIssueStatus && derivedIssueStatus !== issue.status) {
            const syncedIssue = {
                ...issue,
                status: derivedIssueStatus,
                updatedAt: now,
                timeline: [
                    ...(issue.timeline || []),
                    {
                        status: derivedIssueStatus,
                        timestamp: now,
                        actorId: req.user.id,
                        actorName: req.user.name,
                        actorRole: req.user.role,
                        note: `Synced from task ${updatedTask.id}: ${nextStatus}`,
                    },
                ],
            };
            issues[issueIndex] = syncedIssue;
            await writeIssues(issues);
            publicIssue = toPublicIssue(sortTimeline(syncedIssue), baseUrlFor(req));
        } else {
            publicIssue = toPublicIssue(sortTimeline(issue), baseUrlFor(req));
        }
    }

    res.json({ task: updatedTask, issue: publicIssue });
});

app.patch('/api/tasks/:id/assign', requireAdmin, async (req, res) => {
    const parsed = taskAssignSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const employee = users.find((entry) => entry.id === parsed.data.employeeId && entry.role === 'employee' && entry.active !== false);
    if (!employee) {
        res.status(404).json({ message: 'Employee not found or inactive' });
        return;
    }

    const tasks = await readTasks();
    const taskIndex = tasks.findIndex((entry) => entry.id === req.params.id);
    if (taskIndex === -1) {
        res.status(404).json({ message: 'Task not found' });
        return;
    }

    const currentTask = tasks[taskIndex];
    if (parsed.data.expectedUpdatedAt && currentTask.updatedAt && parsed.data.expectedUpdatedAt !== currentTask.updatedAt) {
        res.status(409).json({
            message: 'Task was updated by another user. Please refresh and try again.',
            task: currentTask,
        });
        return;
    }

    const wardEligible = Array.isArray(employee.assignedWardIds) && employee.assignedWardIds.includes(currentTask.wardId);
    const categories = Array.isArray(employee.taskCategories) ? employee.taskCategories : [];
    const categoryEligible = categories.length === 0 || categories.includes(currentTask.category);
    if (!wardEligible || !categoryEligible) {
        res.status(400).json({ message: 'Selected employee is not eligible for this task ward/category' });
        return;
    }

    const now = new Date().toISOString();
    const note = parsed.data.note || `Assigned to ${employee.name}`;
    const nextStatus = ['completed', 'cancelled'].includes(currentTask.status) ? currentTask.status : 'assigned';
    const updatedTask = {
        ...currentTask,
        status: nextStatus,
        assignedToEmployeeId: employee.id,
        assignedToEmployeeName: employee.name,
        updatedAt: now,
        timeline: [
            ...(currentTask.timeline || []),
            {
                status: nextStatus,
                timestamp: now,
                actorId: req.user.id,
                actorRole: req.user.role,
                actorName: req.user.name,
                note,
                type: 'assignment',
                employeeId: employee.id,
                employeeName: employee.name,
            },
        ],
    };

    tasks[taskIndex] = updatedTask;
    await writeTasks(tasks);
    res.json({ task: updatedTask });
});

app.post('/api/ai/summarize-issue', requireStaff, async (req, res) => {
    const parsed = summarizeIssueSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const summary = generateIssueSummary(parsed.data);
    res.json({
        summary,
        model: 'rule-based-v1',
        generatedAt: new Date().toISOString(),
    });
});

app.post('/api/ai/suggest-category', upload.single('photo'), async (req, res) => {
    const description = req.body.description || '';
    const imagePath = req.file ? req.file.path : null;

    if (!description && !imagePath) {
        res.status(400).json({ message: 'Either description or photo is required for suggestion' });
        return;
    }

    try {
        const result = await suggestCategory({ description, imagePath });
        res.json(result);
    } catch (error) {
        console.error('[AI] suggest-category endpoint failed:', error);
        res.status(200).json({
            suggestedCategory: 'other',
            confidence: 0.5,
            topCandidates: [{ id: 'other', confidence: 0.5 }],
            provider: 'fallback',
        });
    }
});

app.post('/api/ai/detect-image-authenticity', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ message: 'Photo is required' });
        return;
    }

    try {
        const result = await detectImageAuthenticity({
            imagePath: req.file.path,
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Image authenticity detection failed',
            error: error.message,
        });
    }
});

app.patch('/api/issues/:id/status', requireStaff, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const now = new Date().toISOString();
    const currentIssue = issues[issueIndex];
    const isEmployee = req.user.role === 'employee';
    if (isEmployee && !canEmployeeHandleIssue(req.user, currentIssue)) {
        res.status(403).json({ message: 'This issue is outside your assigned ward/tasks' });
        return;
    }

    const acknowledgmentPatch = (
        parsed.data.status === 'ack'
            ? {
                acknowledgedByEmployeeId: req.user.role === 'employee' ? req.user.id : currentIssue.acknowledgedByEmployeeId || null,
                acknowledgedByWardId: req.user.role === 'employee' ? currentIssue.wardId : currentIssue.acknowledgedByWardId || null,
                acknowledgedAt: req.user.role === 'employee' ? now : currentIssue.acknowledgedAt || null,
            }
            : {}
    );
    const oldStatus = currentIssue.status;
    const updatedIssue = {
        ...currentIssue,
        status: parsed.data.status,
        ...acknowledgmentPatch,
        updatedAt: now,
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: parsed.data.status,
                timestamp: now,
                note: parsed.data.note || `Status changed to ${parsed.data.status}`,
                actorId: req.user.id,
                actorName: req.user.name,
                actorRole: req.user.role,
                previousStatus: oldStatus,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);
    await syncTasksWithIssueStatus(updatedIssue.id, updatedIssue.status, {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name,
    });

    await notifyStatusChange(updatedIssue, oldStatus, parsed.data.status, parsed.data.note);
    await notifyFollowers(
        updatedIssue,
        'followed_issue_update',
        parsed.data.note || `Issue ${updatedIssue.id} status changed to ${parsed.data.status}`
    );
    const publicIssue = toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req));
    broadcastEvent({ type: 'issue_status_updated', issue: publicIssue, oldStatus, newStatus: parsed.data.status }, () => true);

    res.json({ issue: publicIssue });
});

app.post('/api/issues/:id/escalate', requireAdmin, async (req, res) => {
    const parsed = escalationSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const currentIssue = issues[issueIndex];
    const now = new Date().toISOString();
    const escalationNote = parsed.data.note || `Escalated to ${parsed.data.toLevel} by ${req.user.name}`;
    const oldStatus = currentIssue.status;
    const nextPriority = parsed.data.priorityOverride || currentIssue.priority || 'p3';
    const escalationEntry = {
        actorId: req.user.id,
        actorRole: req.user.role,
        fromLevel: currentIssue.escalationLevel || 'ward-staff',
        toLevel: parsed.data.toLevel,
        reason: parsed.data.reason,
        note: parsed.data.note || '',
        timestamp: now,
    };

    const updatedIssue = {
        ...currentIssue,
        status: 'escalated',
        priority: nextPriority,
        escalationLevel: parsed.data.toLevel,
        updatedAt: now,
        escalationHistory: [...(currentIssue.escalationHistory || []), escalationEntry],
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: 'escalated',
                timestamp: now,
                note: escalationNote,
                actorId: req.user.id,
                actorName: req.user.name,
                actorRole: req.user.role,
                reason: parsed.data.reason,
                toLevel: parsed.data.toLevel,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);
    await syncTasksWithIssueStatus(updatedIssue.id, updatedIssue.status, {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name,
    });

    await notifyStatusChange(updatedIssue, oldStatus, 'escalated', escalationNote);
    await notifyFollowers(
        updatedIssue,
        'followed_issue_update',
        escalationNote
    );

    const publicIssue = toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req));
    broadcastEvent({
        type: 'issue_escalated',
        issue: publicIssue,
        escalation: escalationEntry,
    }, () => true);

    res.json({ issue: publicIssue });
});

app.patch('/api/issues/:id/priority', requireAdmin, async (req, res) => {
    const parsed = prioritySchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const currentIssue = issues[issueIndex];
    const now = new Date().toISOString();
    const note = parsed.data.note || `Priority updated to ${parsed.data.priority} by ${req.user.name}`;
    const updatedIssue = {
        ...currentIssue,
        priority: parsed.data.priority,
        updatedAt: now,
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: currentIssue.status,
                timestamp: now,
                note,
                actorId: req.user.id,
                actorName: req.user.name,
                actorRole: req.user.role,
                type: 'priority_change',
                newPriority: parsed.data.priority,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);

    const publicIssue = toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req));
    broadcastEvent({
        type: 'issue_priority_updated',
        issue: publicIssue,
        priority: parsed.data.priority,
    }, () => true);

    res.json({ issue: publicIssue });
});

app.patch('/api/issues/:id/moderation-review', requireAdmin, async (req, res) => {
    const note = z.coerce.string().trim().max(300).optional().parse(req.body?.note);
    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const currentIssue = issues[issueIndex];
    const now = new Date().toISOString();
    const moderation = currentIssue.moderation || { status: 'clean', reasons: [] };
    const reviewNote = note || `Moderation reviewed by ${req.user.name}`;
    const updatedIssue = {
        ...currentIssue,
        moderationFlag: false,
        moderation: {
            ...moderation,
            reviewedAt: now,
            reviewedById: req.user.id,
            reviewedByName: req.user.name,
            reviewNote,
        },
        updatedAt: now,
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: currentIssue.status,
                timestamp: now,
                note: reviewNote,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);

    const publicIssue = toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req));
    broadcastEvent({
        type: 'issue_moderation_reviewed',
        issue: publicIssue,
    }, () => true);

    res.json({ issue: publicIssue });
});

app.post('/api/issues/:id/verify', async (req, res) => {
    const parsed = verificationSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const now = new Date().toISOString();
    const verificationStatus = parsed.data.verified ? 'verified' : 'reopened';
    const note = parsed.data.verified ? 'Citizen marked the resolution as correct' : 'Citizen reported that the issue is still not fixed';
    const updatedIssue = {
        ...issues[issueIndex],
        status: verificationStatus,
        verification: parsed.data.verified,
        updatedAt: now,
        timeline: [
            ...(issues[issueIndex].timeline || []),
            {
                status: verificationStatus,
                timestamp: now,
                note,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);
    await syncTasksWithIssueStatus(updatedIssue.id, updatedIssue.status, {
        id: req.user?.id || 'citizen',
        role: req.user?.role || 'citizen',
        name: req.user?.name || 'Citizen',
    });
    broadcastEvent({ type: 'issue_status_updated', issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)), newStatus: verificationStatus }, () => true);

    res.json({ issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)) });
});

app.post('/api/issues/:id/feedback', requireAuth, async (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const issue = issues[issueIndex];
    if (issue.reporterPrivateId !== req.user.id && issue.reporterId !== req.user.id) {
        res.status(403).json({ message: 'Only the reporter can provide feedback' });
        return;
    }

    if (!['resolved', 'verified', 'closed'].includes(issue.status)) {
        res.status(400).json({ message: 'Feedback can only be provided for resolved issues' });
        return;
    }

    const now = new Date().toISOString();
    const citizenFeedback = {
        rating: parsed.data.rating,
        comment: parsed.data.comment || '',
        submittedAt: now,
    };

    const updatedIssue = {
        ...issue,
        citizenFeedback,
        updatedAt: now,
        timeline: [
            ...(issue.timeline || []),
            {
                status: issue.status,
                timestamp: now,
                note: `Citizen provided feedback: ${parsed.data.rating}/5`,
                type: 'feedback',
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);
    await syncTasksWithIssueStatus(updatedIssue.id, updatedIssue.status, {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name,
    });

    res.json({ issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)) });
});

app.get('/api/users/me/issues', requireAuth, async (req, res) => {
    const issues = await readIssues();
    const userIssues = issues
        .filter((issue) => issue.reporterId === req.user.id || issue.reporterPrivateId === req.user.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((issue) => {
            const publicIssue = toPublicIssue(sortTimeline(issue), baseUrlFor(req));
            if (!['resolved', 'verified', 'closed'].includes(issue.status)) {
                publicIssue.estimatedResolutionDays = calculateEstimatedResolutionTime(issue, issues);
            }
            return publicIssue;
        });

    res.json({ issues: userIssues });
});

app.get('/api/admin/stats', requireStaff, async (req, res) => {
    const issues = await readIssues();
    const visibleIssues = req.user.role === 'employee'
        ? issues.filter((issue) => canEmployeeHandleIssue(req.user, issue))
        : issues;
    res.json({
        stats: {
            total: visibleIssues.length,
            pending: visibleIssues.filter((issue) => ['new', 'ack'].includes(issue.status)).length,
            resolved: visibleIssues.filter((issue) => issue.status === 'resolved').length,
            escalated: visibleIssues.filter((issue) => issue.status === 'escalated').length,
        },
    });
});

app.get('/api/admin/employees', requireAdmin, async (req, res) => {
    const users = await readUsers();
    const employees = users.filter((entry) => entry.role === 'employee');

    if (req.user.role === 'super-admin' || req.user.role === 'admin') {
        res.json({ employees: employees.map((entry) => toPublicUser(entry)) });
        return;
    }

    res.json({ employees: [] });
});

app.post('/api/admin/employees', requireSuperAdmin, async (req, res) => {
    const parsed = createEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const normalizedPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    const normalizedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const requestedEmployeeCode = parsed.data.employeeCode ? parsed.data.employeeCode.toUpperCase() : null;
    const employeeCode = requestedEmployeeCode || generateEmployeeCode(users);
    const existing = users.find((user) => (
        (normalizedPhone && phonesMatch(user.phone, normalizedPhone))
        || (normalizedEmail && normalizeEmail(user.email) === normalizedEmail)
        || (user.employeeCode && user.employeeCode.toUpperCase() === employeeCode)
    ));

    if (existing) {
        res.status(409).json({ message: 'Employee with same phone, email, or employee code already exists' });
        return;
    }

    const createdAt = new Date().toISOString();
    const assignedWardIds = [...new Set(parsed.data.assignedWardIds)];
    const employee = {
        id: `user-${randomUUID()}`,
        name: parsed.data.name,
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash: await hashPassword(parsed.data.password),
        role: 'employee',
        employeeCode,
        designation: parsed.data.designation,
        assignedWardIds,
        wardId: assignedWardIds[0],
        wardName: null,
        taskCategories: [...new Set(parsed.data.taskCategories)],
        active: true,
        createdBy: req.user.id,
        createdAt,
        updatedAt: createdAt,
    };

    users.unshift(employee);
    await writeUsers(users);

    res.status(201).json({ employee: toPublicUser(employee) });
});

app.patch('/api/admin/employees/:id', requireSuperAdmin, async (req, res) => {
    const parsed = updateEmployeeSchema.safeParse(req.body);

    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const employeeIndex = users.findIndex((entry) => entry.id === req.params.id && entry.role === 'employee');

    if (employeeIndex === -1) {
        res.status(404).json({ message: 'Employee not found' });
        return;
    }

    const current = users[employeeIndex];
    const assignedWardIds = parsed.data.assignedWardIds
        ? [...new Set(parsed.data.assignedWardIds)]
        : current.assignedWardIds;
    const next = {
        ...current,
        ...(parsed.data.designation ? { designation: parsed.data.designation } : {}),
        ...(parsed.data.taskCategories ? { taskCategories: [...new Set(parsed.data.taskCategories)] } : {}),
        ...(typeof parsed.data.active === 'boolean' ? { active: parsed.data.active } : {}),
        ...(assignedWardIds ? { assignedWardIds, wardId: assignedWardIds[0] } : {}),
        updatedAt: new Date().toISOString(),
    };

    users[employeeIndex] = next;
    await writeUsers(users);
    res.json({ employee: toPublicUser(next) });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
    const notifications = await getUserNotifications(req.user.id);
    res.json({ notifications });
});

app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    const count = await getUnreadCount(req.user.id);
    res.json({ count });
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
    await markNotificationAsRead(req.params.id, req.user.id);
    res.json({ success: true });
});

app.get('/api/users/me/notification-preferences', requireAuth, async (req, res) => {
    res.json({ preferences: req.user.notificationPreferences || createNotificationDefaults() });
});

app.put('/api/users/me/notification-preferences', requireAuth, async (req, res) => {
    const parsed = notificationPreferenceSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const users = await readUsers();
    const userIndex = users.findIndex((entry) => entry.id === req.user.id);
    if (userIndex === -1) {
        res.status(404).json({ message: 'User not found' });
        return;
    }

    const current = users[userIndex].notificationPreferences || createNotificationDefaults();
    const next = {
        ...current,
        ...(parsed.data.channels ? { channels: { ...current.channels, ...parsed.data.channels } } : {}),
        ...(parsed.data.frequency ? { frequency: parsed.data.frequency } : {}),
        ...(parsed.data.categories ? { categories: [...new Set(parsed.data.categories)] } : {}),
        ...(typeof parsed.data.criticalAlertsOnly === 'boolean' ? { criticalAlertsOnly: parsed.data.criticalAlertsOnly } : {}),
    };
    users[userIndex] = { ...users[userIndex], notificationPreferences: next, updatedAt: new Date().toISOString() };
    await writeUsers(users);
    res.json({ preferences: next });
});

app.get('/api/users/me/saved-issue-filters', requireAuth, async (req, res) => {
    res.json({ filters: req.user.savedIssueFilters || [] });
});

app.post('/api/users/me/saved-issue-filters', requireAuth, async (req, res) => {
    const parsed = issueFilterSaveSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }
    const users = await readUsers();
    const userIndex = users.findIndex((entry) => entry.id === req.user.id);
    if (userIndex === -1) {
        res.status(404).json({ message: 'User not found' });
        return;
    }
    const current = users[userIndex].savedIssueFilters || [];
    const savedFilter = { id: `flt-${Date.now()}`, ...parsed.data, createdAt: new Date().toISOString() };
    users[userIndex] = { ...users[userIndex], savedIssueFilters: [savedFilter, ...current].slice(0, 20), updatedAt: new Date().toISOString() };
    await writeUsers(users);
    res.status(201).json({ filter: savedFilter });
});

app.delete('/api/users/me/saved-issue-filters/:id', requireAuth, async (req, res) => {
    const users = await readUsers();
    const userIndex = users.findIndex((entry) => entry.id === req.user.id);
    if (userIndex === -1) {
        res.status(404).json({ message: 'User not found' });
        return;
    }
    const current = users[userIndex].savedIssueFilters || [];
    users[userIndex] = { ...users[userIndex], savedIssueFilters: current.filter((entry) => entry.id !== req.params.id), updatedAt: new Date().toISOString() };
    await writeUsers(users);
    res.json({ success: true });
});

app.get('/api/reports/issues/export', requireStaff, async (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    const period = String(req.query.period || 'monthly').toLowerCase();
    const wardId = String(req.query.wardId || '').trim();
    const issues = await readIssues();
    const scoped = issues.filter((issue) => !wardId || wardId === 'all' || String(issue.wardId) === wardId);
    const now = new Date().toISOString();
    const reportStatuses = ['new', 'ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated'];
    const summary = {
        generatedAt: now,
        period,
        total: scoped.length,
        byStatus: reportStatuses.reduce((acc, status) => ({ ...acc, [status]: scoped.filter((i) => i.status === status).length }), {}),
        bySeverity: ['low', 'medium', 'high', 'critical'].reduce((acc, severityKey) => ({ ...acc, [severityKey]: scoped.filter((i) => i.severity === severityKey).length }), {}),
    };

    if (format === 'pdf') {
        const content = [
            'CivicPulse Issue Report',
            `Generated At: ${summary.generatedAt}`,
            `Period: ${summary.period}`,
            `Total Issues: ${summary.total}`,
            `Status Breakdown: ${JSON.stringify(summary.byStatus)}`,
            `Severity Breakdown: ${JSON.stringify(summary.bySeverity)}`,
            'Charts/Analytics: Provided as structured breakdown in this document.',
        ].join('\n');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="issues-${period}.pdf"`);
        res.send(Buffer.from(content, 'utf8'));
        return;
    }

    const csvHeader = 'id,category,status,severity,wardId,wardName,createdAt,updatedAt,resolutionDays';
    const csvRows = scoped.map((issue) => [
        issue.id, issue.category, issue.status, issue.severity, issue.wardId, `"${issue.wardName || ''}"`, issue.createdAt, issue.updatedAt, getResolvedDays(issue) ?? '',
    ].join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="issues-${period}.csv"`);
    res.send([csvHeader, ...csvRows].join('\n'));
});

app.get('/api/reports/government', requireStaff, async (req, res) => {
    const frequency = String(req.query.frequency || 'monthly').toLowerCase();
    const issues = await readIssues();
    const wardMaster = await getWardMaster();
    const wardPerformance = wardMaster.wards.map((ward) => {
        const wardIssues = issues.filter((issue) => Number(issue.wardId) === Number(ward.id));
        const resolved = wardIssues.filter((issue) => ['resolved', 'verified', 'closed'].includes(issue.status));
        const avgResolutionDays = resolved.length > 0
            ? Math.round((resolved.map((issue) => getResolvedDays(issue) || 0).reduce((sum, days) => sum + days, 0) / resolved.length) * 10) / 10
            : null;
        return {
            wardId: ward.id,
            wardName: ward.nameEn,
            totalIssues: wardIssues.length,
            resolvedIssues: resolved.length,
            avgResolutionDays,
            criticalOpen: wardIssues.filter((issue) => issue.severity === 'critical' && !['resolved', 'verified', 'closed'].includes(issue.status)).length,
        };
    });
    res.json({
        generatedAt: new Date().toISOString(),
        frequency,
        citySummary: buildCityIssueStats(issues),
        wardPerformance,
    });
});

app.get('/api/analytics/wards', async (req, res) => {
    const issues = await readIssues();
    const wardMaster = await getWardMaster();
    const wards = buildWardAnalytics(issues, wardMaster.wards).map((ward) => ({
        ...ward,
        recentIssues: ward.recentIssues.map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req))),
    }));

    res.json({
        wards,
        generatedAt: new Date().toISOString(),
    });
});

app.get('/api/analytics/wards/:id', async (req, res) => {
    const issues = await readIssues();
    const wardMaster = await getWardMaster();
    const ward = buildWardAnalytics(issues, wardMaster.wards).find((entry) => entry.id === Number(req.params.id));

    if (!ward) {
        res.status(404).json({ message: 'Ward not found' });
        return;
    }

    res.json({
        ward: {
            ...ward,
            recentIssues: ward.recentIssues.map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req))),
        },
        generatedAt: new Date().toISOString(),
    });
});

app.get('/api/analytics/departments', requireStaff, async (req, res) => {
    const issues = await readIssues();
    const stats = buildDepartmentAnalytics(issues, categories);
    res.json({ departments: stats, generatedAt: new Date().toISOString() });
});

app.get('/api/analytics/trends', requireStaff, async (req, res) => {
    const issues = await readIssues();
    const days = Number(req.query.days) || 30;
    const trends = buildTrends(issues, days);
    res.json({ trends, generatedAt: new Date().toISOString() });
});

app.get('/api/dashboard/summary', async (req, res) => {
    const issues = await readIssues();
    const recentIssues = issues
        .slice()
        .filter((issue) => isIssueAcknowledgedByAssignedEmployee(issue))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4)
        .map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req)));
    const stats = buildCityIssueStats(issues);

    res.json({
        stats,
        recentIssues,
    });
});

app.get('/api/meta', async (_req, res) => {
    const wardMaster = await getWardMaster();
    res.json({
        categories,
        wards: wardMaster.wards,
        wardDataSource: wardMaster.wardDataSource,
        severities: ['low', 'medium', 'high', 'critical'],
        statuses: ['new', 'ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated'],
    });
});

app.get('/api/admin/ward-master', requireAdmin, async (_req, res) => {
    const wardMaster = await getWardMaster();
    res.json(wardMaster);
});

app.put('/api/admin/ward-master', requireAdmin, async (req, res) => {
    const parsed = wardMasterUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const normalized = parseWardMasterInput(parsed.data);
    const updated = await saveWardMaster(normalized, req.user?.id || 'admin');
    res.json({ message: 'Ward master updated', ...updated });
});

app.post('/api/admin/ward-master/sync-url', requireAdmin, async (req, res) => {
    const parsed = wardMasterSyncUrlSchema.safeParse(req.body);
    if (!parsed.success) {
        sendValidationError(res, '', parsed.error);
        return;
    }

    const targetUrl = parsed.data.url;
    let response;

    try {
        response = await fetch(targetUrl, {
            headers: {
                Accept: 'application/json, application/geo+json;q=0.9,*/*;q=0.8',
                'User-Agent': 'PunePulse-WardMaster-Sync/1.0',
            },
        });
    } catch (error) {
        res.status(502).json({ message: `Failed to fetch source URL: ${error.message}` });
        return;
    }

    if (!response.ok) {
        res.status(502).json({ message: `Source URL returned ${response.status}` });
        return;
    }

    let remoteData;
    try {
        remoteData = await response.json();
    } catch {
        res.status(400).json({ message: 'Source URL did not return valid JSON' });
        return;
    }

    let normalized;
    try {
        normalized = buildWardMasterFromRemoteData(remoteData, targetUrl);
    } catch (error) {
        res.status(400).json({ message: error.message });
        return;
    }

    const updated = await saveWardMaster(normalized, req.user?.id || 'admin');
    res.json({
        message: 'Ward master synced from URL',
        ...updated,
    });
});

registerSocialRoutes(app);

// FOLLOWING ROUTES
app.post('/api/issues/:id/follow', requireAuth, async (req, res) => {
    const result = await followIssue(req.params.id, req.user.id);

    if (result.alreadyFollowing) {
        res.status(400).json({ message: 'Already following' });
        return;
    }

    res.json({ success: true });
});

app.delete('/api/issues/:id/follow', requireAuth, async (req, res) => {
    await unfollowIssue(req.params.id, req.user.id);
    res.json({ success: true });
});

app.get('/api/issues/:id/following', requireAuth, async (req, res) => {
    const following = await isUserFollowing(req.params.id, req.user.id);
    res.json({ following });
});

app.get('/api/users/me/followed-issues', requireAuth, async (req, res) => {
    const issueIds = await getFollowedIssues(req.user.id);
    const issues = await readIssues();
    const followedIssues = issues
        .filter((issue) => issueIds.includes(issue.id))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
        .map((issue) => toPublicIssue(sortTimeline(issue), baseUrlFor(req)));

    res.json({ issues: followedIssues });
});

// VERIFICATION ROUTES
app.post('/api/issues/:id/admin-verify', requireAdmin, async (req, res) => {
    const note = z.coerce.string().trim().max(300).optional().parse(req.body?.note);
    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    const currentIssue = issues[issueIndex];
    if (!['resolved', 'verified', 'closed'].includes(currentIssue.status)) {
        res.status(400).json({ message: 'Admin verification is available after issue resolution' });
        return;
    }

    const verification = await markIssueAsVerified(req.params.id, req.user.id, note);
    const now = new Date().toISOString();
    const oldStatus = currentIssue.status;
    const updatedIssue = {
        ...currentIssue,
        status: 'verified',
        adminVerified: true,
        verifiedAt: now,
        verifiedBy: req.user.name,
        adminVerification: {
            verifiedById: req.user.id,
            verifiedByName: req.user.name,
            verifiedAt: now,
            note: note || 'Issue verified by admin review',
        },
        updatedAt: now,
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: 'verified',
                timestamp: now,
                note: note || `Verified by ${req.user.name}`,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);

    await notifyStatusChange(updatedIssue, oldStatus, 'verified', note);
    await notifyFollowers(updatedIssue, 'followed_issue_verified', note || `Issue ${updatedIssue.id} was verified by admin review`);

    res.json({ success: true, verification, issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)) });
});

// BEFORE/AFTER PHOTOS
app.post('/api/issues/:id/resolved-photo', requireAdmin, upload.single('photo'), async (req, res) => {
    const issues = await readIssues();
    const issueIndex = issues.findIndex((entry) => entry.id === req.params.id);

    if (issueIndex === -1) {
        res.status(404).json({ message: 'Issue not found' });
        return;
    }

    if (!req.file) {
        res.status(400).json({ message: 'No photo uploaded' });
        return;
    }

    const now = new Date().toISOString();
    const currentIssue = issues[issueIndex];
    const resolvedImageUrl = makeUploadedImagePath(req.file.filename);
    const updatedIssue = {
        ...currentIssue,
        resolvedImageUrl,
        updatedAt: now,
        timeline: [
            ...(currentIssue.timeline || []),
            {
                status: currentIssue.status,
                timestamp: now,
                note: `Resolved photo uploaded by ${req.user.name}`,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);

    await notifyFollowers(updatedIssue, 'followed_issue_photo', `A resolution photo was added for issue ${updatedIssue.id}`);

    res.json({ success: true, resolvedImageUrl, issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)) });
});

// TOP VOTED ISSUES
app.get('/api/issues/top/voted', async (req, res) => {
    const topVoted = await getTopVotedIssues(10);
    const issues = await readIssues();

    const enrichedIssues = topVoted
        .map((topVoteEntry) => {
            const issue = issues.find((entry) => entry.id === topVoteEntry.issueId);
            if (!issue) {
                return null;
            }

            return {
                ...toPublicIssue(sortTimeline(issue), baseUrlFor(req)),
                voteCount: topVoteEntry.voteCount,
            };
        })
        .filter(Boolean);

    res.json({ issues: enrichedIssues });
});

async function runReminderSweep() {
    const issues = await readIssues();
    const users = await readUsers();
    const now = Date.now();
    const pendingStatuses = new Set(['new', 'ack', 'inprog', 'escalated', 'reopened']);
    let updated = false;

    for (const issue of issues) {
        if (!pendingStatuses.has(issue.status)) {
            continue;
        }
        const createdAt = new Date(issue.createdAt).getTime();
        if (!Number.isFinite(createdAt)) {
            continue;
        }
        const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
        const reporter = users.find((entry) => entry.id === (issue.reporterPrivateId || issue.reporterId));
        const prefs = reporter?.notificationPreferences || createNotificationDefaults();
        const reminderLog = issue.reminderLog || {};

        if (ageDays >= 3 && !reminderLog.citizenReminderSentAt && reporter?.phone && prefs.channels?.sms) {
            await sendSmsMessage(reporter.phone, `CivicPulse: Issue ${issue.id} is still pending. We are following up with staff.`);
            issue.reminderLog = { ...reminderLog, citizenReminderSentAt: new Date().toISOString() };
            updated = true;
        }

        if (ageDays >= 1 && !reminderLog.workStartedNoticeSentAt && issue.status === 'inprog' && reporter?.phone && prefs.channels?.sms) {
            await sendSmsMessage(reporter.phone, `CivicPulse: Work has started for issue ${issue.id} in your ward.`);
            issue.reminderLog = { ...(issue.reminderLog || reminderLog), workStartedNoticeSentAt: new Date().toISOString() };
            updated = true;
        }

        if (ageDays >= 7 && !reminderLog.slaEscalationSentAt) {
            const previousEscalationLevel = issue.escalationLevel || 'ward-staff';
            broadcastEvent(
                { type: 'sla_breach_alert', issueId: issue.id, wardId: issue.wardId, severity: issue.severity, ageDays: Math.round(ageDays) },
                (wsUser) => ['employee', 'admin', 'super-admin'].includes(wsUser?.role)
            );
            const autoEscalationTimestamp = new Date().toISOString();
            issue.status = issue.status === 'escalated' ? issue.status : 'escalated';
            issue.escalationLevel = issue.escalationLevel || 'senior-staff';
            issue.priority = issue.priority || (issue.severity === 'critical' ? 'p1' : issue.severity === 'high' ? 'p2' : issue.severity === 'medium' ? 'p3' : 'p4');
            issue.updatedAt = autoEscalationTimestamp;
            issue.timeline = [...(issue.timeline || []), { status: 'escalated', timestamp: issue.updatedAt, note: 'Auto escalation: SLA breach' }];
            issue.escalationHistory = [
                ...(issue.escalationHistory || []),
                {
                    actorId: 'system',
                    actorRole: 'system',
                    fromLevel: previousEscalationLevel,
                    toLevel: 'senior-staff',
                    reason: 'sla-expired',
                    note: 'Automatically escalated after SLA breach',
                    timestamp: autoEscalationTimestamp,
                },
            ];
            issue.reminderLog = { ...(issue.reminderLog || reminderLog), slaEscalationSentAt: new Date().toISOString() };
            updated = true;
        }
    }

    if (updated) {
        await writeIssues(issues);
    }
}

app.use((error, _req, res, _next) => {
    console.error(error);

    if (error instanceof z.ZodError) {
        sendValidationError(res, 'Invalid request payload', error);
        return;
    }

    res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
});

await ensureStorage();
await migrateLegacyJsonData();
setInterval(() => {
    runReminderSweep().catch((error) => console.error('Reminder sweep failed', error.message));
}, 60 * 60 * 1000);

const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close(async () => {
        console.log('HTTP server closed');
        // Close WebSocket clients
        for (const [socket] of wsClients) {
            if (socket.readyState === socket.OPEN) {
                socket.close();
            }
        }
        wsClients.clear();
        console.log('WebSocket connections closed');
        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

server.listen(config.port, () => {
    console.log(`Pune Pulse API listening on http://localhost:${config.port}`);
});
