import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { categories } from '../../frontend/src/data/categories.js';
import { config } from './config.js';
import { comparePassword, getUserFromRequest, hashPassword, requireAdmin, requireAuth, requireStaff, requireSuperAdmin, signToken, toPublicUser } from './auth.js';
import { consumeOtpChallenge, createCitizenFromOtp, createOtpChallenge } from './authFlows.js';
import { categoryMap as seededCategoryMap } from './seed.js';
import { buildCityIssueStats, buildWardAnalytics } from './wardAnalytics.js';
import { normalizePhone, phonesMatch } from './phone.js';
import { ensureStorage, readIssues, readUsers, writeIssues, writeUsers } from './store.js';
import { migrateLegacyJsonData } from './migrateJsonToMongo.js';
import { buildTicketId, findWardByCoordinates, makeUploadedImagePath, toPublicIssue } from './utils.js';
import registerSocialRoutes from './socialRoutes.js';
import { calculateEstimatedResolutionTime, getUserNotifications, markNotificationAsRead, getUnreadCount, notifyStatusChange } from './notificationService.js';
import { checkDuplicateIssues, followIssue, getFollowedIssues, getTopVotedIssues, isUserFollowing, markIssueAsVerified, notifyFollowers, unfollowIssue } from './issueEngagementService.js';
import { buildWardMasterFromRemoteData, getWardMaster, parseWardMasterInput, saveWardMaster } from './wardMaster.js';
import { sendWhatsappOtp } from './otpDelivery.js';

const app = express();
const categoryMap = seededCategoryMap || new Map(categories.map((category) => [category.id, category]));

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
    employeeCode: z.coerce.string().trim().min(4).max(20).regex(/^[A-Za-z0-9-]+$/),
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

const verificationSchema = z.object({
    verified: z.boolean(),
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

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'pune-pulse-api' });
});

app.post('/api/auth/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid registration payload', errors: parsed.error.flatten() });
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

app.post('/api/auth/citizen/request-register-otp', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid citizen registration payload', errors: parsed.error.flatten() });
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

    if (parsed.data.phone) {
        try {
            await sendWhatsappOtp({
                phone: parsed.data.phone,
                otp,
            });
        } catch (error) {
            res.status(502).json({ message: `Failed to send WhatsApp OTP: ${error.message}` });
            return;
        }
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: parsed.data.phone ? 'OTP sent on WhatsApp for citizen registration' : 'OTP generated for citizen email registration', devOtp: otp }
            : { message: parsed.data.phone ? 'OTP sent on WhatsApp for citizen registration' : 'OTP generated for citizen email registration' }
    );
});

app.post('/api/auth/citizen/verify-register-otp', async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid OTP payload', errors: parsed.error.flatten() });
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

app.post('/api/auth/citizen/request-login-otp', async (req, res) => {
    const parsed = loginIdentifierSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid login payload', errors: parsed.error.flatten() });
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

    if (user.phone) {
        try {
            await sendWhatsappOtp({
                phone: user.phone,
                otp,
            });
        } catch (error) {
            res.status(502).json({ message: `Failed to send WhatsApp OTP: ${error.message}` });
            return;
        }
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: user.phone ? 'OTP sent on WhatsApp for citizen login' : 'OTP generated for citizen email login', devOtp: otp }
            : { message: user.phone ? 'OTP sent on WhatsApp for citizen login' : 'OTP generated for citizen email login' }
    );
});

app.post('/api/auth/citizen/verify-login-otp', async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid OTP payload', errors: parsed.error.flatten() });
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

app.post('/api/auth/login', async (req, res) => {
    const parsed = loginIdentifierSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid login payload', errors: parsed.error.flatten() });
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
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    res.json({ user: toPublicUser(req.user) });
});

app.get('/api/issues', async (req, res) => {
    const issues = await readIssues();
    const user = await getUserFromRequest(req);
    const status = req.query.status?.toString();
    const category = req.query.category?.toString();
    const acknowledgedOnly = ['1', 'true', 'yes'].includes(String(req.query.acknowledgedOnly || '').toLowerCase());
    const isStaffUser = ['employee', 'admin', 'super-admin'].includes(user?.role);

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
        res.status(400).json({ message: 'Invalid coordinates', errors: parsed.error.flatten() });
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

app.post('/api/issues', upload.array('photos', 5), async (req, res) => {
    const parsed = createIssueSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid issue payload', errors: parsed.error.flatten() });
        return;
    }

    const issues = await readIssues();
    const user = await getUserFromRequest(req);
    const { description, category, severity, anonymous, latitude, longitude, locationDescription } = parsed.data;
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

    const duplicates = await checkDuplicateIssues({
        category,
        wardId: ward.id,
        lat: latitude,
        lng: longitude,
    });

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
    const title = categoryInfo ? `${categoryInfo.department} issue near ${ward.nameEn}` : `Civic issue near ${ward.nameEn}`;

    const files = req.files || [];
    const imageUrls = files.length > 0 
        ? files.map(file => makeUploadedImagePath(file.filename))
        : ['https://images.unsplash.com/photo-1584463699037-bd52eb68ab27?w=400&h=300&fit=crop'];

    const issue = {
        id: issueId,
        title,
        titleMr: title,
        description,
        descriptionMr: description,
        category,
        status: 'new',
        severity,
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
        source: user ? 'authenticated-user' : 'user',
    };

    issues.unshift(issue);
    await writeIssues(issues);

    res.status(201).json({
        message: 'Issue created successfully',
        issue: toPublicIssue(issue, baseUrlFor(req)),
    });
});

app.patch('/api/issues/:id/status', requireStaff, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid status payload', errors: parsed.error.flatten() });
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
                note: parsed.data.note || `Updated by ${req.user.name}`,
            },
        ],
    };

    issues[issueIndex] = updatedIssue;
    await writeIssues(issues);

    await notifyStatusChange(updatedIssue, oldStatus, parsed.data.status, parsed.data.note);
    await notifyFollowers(
        updatedIssue,
        'followed_issue_update',
        parsed.data.note || `Issue ${updatedIssue.id} status changed to ${parsed.data.status}`
    );

    res.json({ issue: toPublicIssue(sortTimeline(updatedIssue), baseUrlFor(req)) });
});

app.post('/api/issues/:id/verify', async (req, res) => {
    const parsed = verificationSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid verification payload', errors: parsed.error.flatten() });
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
        res.status(400).json({ message: 'Invalid employee payload', errors: parsed.error.flatten() });
        return;
    }

    const users = await readUsers();
    const normalizedPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
    const normalizedEmail = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
    const existing = users.find((user) => (
        (normalizedPhone && phonesMatch(user.phone, normalizedPhone))
        || (normalizedEmail && normalizeEmail(user.email) === normalizedEmail)
        || (user.employeeCode && user.employeeCode === parsed.data.employeeCode)
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
        employeeCode: parsed.data.employeeCode.toUpperCase(),
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
        res.status(400).json({ message: 'Invalid employee update payload', errors: parsed.error.flatten() });
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
        res.status(400).json({ message: 'Invalid ward master payload', errors: parsed.error.flatten() });
        return;
    }

    const normalized = parseWardMasterInput(parsed.data);
    const updated = await saveWardMaster(normalized, req.user?.id || 'admin');
    res.json({ message: 'Ward master updated', ...updated });
});

app.post('/api/admin/ward-master/sync-url', requireAdmin, async (req, res) => {
    const parsed = wardMasterSyncUrlSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid sync payload', errors: parsed.error.flatten() });
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

app.use((error, _req, res, _next) => {
    console.error(error);

    if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid request payload', errors: error.flatten() });
        return;
    }

    res.status(error.statusCode || 500).json({ message: error.message || 'Internal server error' });
});

await ensureStorage();
await migrateLegacyJsonData();

app.listen(config.port, () => {
    console.log(`Pune Pulse API listening on http://localhost:${config.port}`);
});
