import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { categories } from '../../frontend/src/data/categories.js';
import { config } from './config.js';
import { comparePassword, getUserFromRequest, hashPassword, requireAdmin, requireAuth, requireSuperAdmin, signToken, toPublicUser } from './auth.js';
import { consumeAdminInvite, consumeOtpChallenge, createAdminInvite, createCitizenFromOtp, createOtpChallenge, listActiveAdminInvites } from './authFlows.js';
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
const passwordSchema = z.coerce.string().min(6).max(100);
const nameSchema = z.coerce.string().trim().min(2).max(80);

const authSchema = z.object({
    phone: phoneSchema,
    password: passwordSchema,
});

const registerSchema = authSchema.extend({
    name: nameSchema,
    wardId: z.coerce.number().optional(),
    wardName: z.coerce.string().trim().max(120).optional(),
});

const adminRegisterSchema = authSchema.extend({
    name: nameSchema,
    inviteCode: z.coerce.string().trim().min(6).max(40),
});

const citizenRegisterRequestSchema = authSchema.extend({
    name: nameSchema,
});

const otpVerifySchema = z.object({
    phone: phoneSchema,
    otp: z.coerce.string().trim().length(6),
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
        users.filter((entry) => phonesMatch(entry.phone, phone))
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

    const users = await readUsers();
    const existingUser = users.find((user) => phonesMatch(user.phone, parsed.data.phone));

    if (existingUser) {
        res.status(409).json({ message: 'Phone number is already registered' });
        return;
    }

    const user = {
        id: `user-${randomUUID()}`,
        name: parsed.data.name,
        phone: normalizePhone(parsed.data.phone),
        passwordHash: await hashPassword(parsed.data.password),
        role: 'citizen',
        wardId: parsed.data.wardId || null,
        wardName: parsed.data.wardName || null,
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
    const parsed = citizenRegisterRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid citizen registration payload', errors: parsed.error.flatten() });
        return;
    }

    const users = await readUsers();
    const existingUser = users.find((user) => phonesMatch(user.phone, parsed.data.phone));

    if (existingUser) {
        res.status(409).json({ message: 'Phone number is already registered' });
        return;
    }

    const otp = await createOtpChallenge({
        phone: normalizePhone(parsed.data.phone),
        purpose: 'citizen-register',
        payload: {
            name: parsed.data.name,
            password: parsed.data.password,
        },
    });

    try {
        await sendWhatsappOtp({
            phone: parsed.data.phone,
            otp,
        });
    } catch (error) {
        res.status(502).json({ message: `Failed to send WhatsApp OTP: ${error.message}` });
        return;
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: 'OTP sent on WhatsApp for citizen registration', devOtp: otp }
            : { message: 'OTP sent on WhatsApp for citizen registration' }
    );
});

app.post('/api/auth/citizen/verify-register-otp', async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid OTP payload', errors: parsed.error.flatten() });
        return;
    }

    const otpEntry = await consumeOtpChallenge({
        phone: parsed.data.phone,
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
    const parsed = authSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid login payload', errors: parsed.error.flatten() });
        return;
    }

    const users = await readUsers();
    const user = await findUserByCredentials({
        users,
        phone: parsed.data.phone,
        password: parsed.data.password,
        roles: ['citizen'],
    });

    if (!user) {
        res.status(401).json({ message: 'Invalid phone or password' });
        return;
    }

    const otp = await createOtpChallenge({
        phone: normalizePhone(parsed.data.phone),
        purpose: 'citizen-login',
        payload: { userId: user.id },
    });

    try {
        await sendWhatsappOtp({
            phone: parsed.data.phone,
            otp,
        });
    } catch (error) {
        res.status(502).json({ message: `Failed to send WhatsApp OTP: ${error.message}` });
        return;
    }

    res.json(
        config.otp.exposeDevOtp
            ? { message: 'OTP sent on WhatsApp for citizen login', devOtp: otp }
            : { message: 'OTP sent on WhatsApp for citizen login' }
    );
});

app.post('/api/auth/citizen/verify-login-otp', async (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid OTP payload', errors: parsed.error.flatten() });
        return;
    }

    const otpEntry = await consumeOtpChallenge({
        phone: parsed.data.phone,
        purpose: 'citizen-login',
        otp: parsed.data.otp,
    });

    if (!otpEntry) {
        res.status(400).json({ message: 'Invalid or expired OTP' });
        return;
    }

    const users = await readUsers();
    const user = users.find((entry) => entry.id === otpEntry.payload.userId && phonesMatch(entry.phone, parsed.data.phone));

    if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
    }

    res.json({
        token: signToken(user),
        user: toPublicUser(user),
    });
});

app.post('/api/auth/admin/register', async (req, res) => {
    const parsed = adminRegisterSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid admin registration payload', errors: parsed.error.flatten() });
        return;
    }

    const users = await readUsers();
    const existingUser = users.find((user) => phonesMatch(user.phone, parsed.data.phone));

    if (existingUser) {
        res.status(409).json({ message: 'Phone number is already registered' });
        return;
    }

    const invite = await consumeAdminInvite(parsed.data.inviteCode, normalizePhone(parsed.data.phone));

    if (!invite) {
        res.status(403).json({ message: 'Invalid or expired admin invite code' });
        return;
    }

    const user = {
        id: `user-${randomUUID()}`,
        name: parsed.data.name,
        phone: normalizePhone(parsed.data.phone),
        passwordHash: await hashPassword(parsed.data.password),
        role: 'admin',
        wardId: null,
        wardName: null,
        createdAt: new Date().toISOString(),
    };

    users.unshift(user);
    await writeUsers(users);

    res.status(201).json({
        token: signToken(user),
        user: toPublicUser(user),
    });
});

app.post('/api/auth/login', async (req, res) => {
    const parsed = authSchema.safeParse(req.body);

    if (!parsed.success) {
        res.status(400).json({ message: 'Invalid login payload', errors: parsed.error.flatten() });
        return;
    }

    const users = await readUsers();
    const user = await findUserByCredentials({
        users,
        phone: parsed.data.phone,
        password: parsed.data.password,
        roles: ['admin', 'super-admin'],
    });

    if (!user) {
        res.status(401).json({ message: 'Invalid phone or password' });
        return;
    }

    if (!['admin', 'super-admin'].includes(user.role)) {
        res.status(403).json({ message: 'Citizen accounts must use OTP login' });
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
    const status = req.query.status?.toString();
    const category = req.query.category?.toString();

    const filteredIssues = issues
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
    const issue = issues.find((entry) => entry.id === req.params.id);

    if (!issue) {
        res.status(404).json({ message: 'Issue not found' });
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

app.patch('/api/issues/:id/status', requireAdmin, async (req, res) => {
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
    const oldStatus = currentIssue.status;
    const updatedIssue = {
        ...currentIssue,
        status: parsed.data.status,
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

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    const issues = await readIssues();
    res.json({
        stats: {
            total: issues.length,
            pending: issues.filter((issue) => ['new', 'ack'].includes(issue.status)).length,
            resolved: issues.filter((issue) => issue.status === 'resolved').length,
            escalated: issues.filter((issue) => issue.status === 'escalated').length,
        },
    });
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

app.get('/api/admin/invites', requireSuperAdmin, async (_req, res) => {
    const invites = await listActiveAdminInvites();
    res.json({ invites });
});

app.post('/api/admin/invites', requireSuperAdmin, async (req, res) => {
    const invite = await createAdminInvite(req.user.phone);
    res.status(201).json({ invite });
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
