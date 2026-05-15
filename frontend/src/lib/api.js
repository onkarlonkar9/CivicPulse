import { normalizePhone } from '@/lib/validators.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function withNormalizedPhone(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }

    const normalizedBody = { ...body };

    if (typeof normalizedBody.password === 'string') {
        normalizedBody.password = normalizedBody.password.trim();
    }

    if (typeof normalizedBody.otp === 'string') {
        normalizedBody.otp = normalizedBody.otp.trim().replace(/\D/g, '');
    }

    if (typeof normalizedBody.inviteCode === 'string') {
        normalizedBody.inviteCode = normalizedBody.inviteCode.trim().toUpperCase();
    }

    if (typeof normalizedBody.name === 'string') {
        normalizedBody.name = normalizedBody.name.trim();
    }

    if (typeof normalizedBody.identifier === 'string') {
        const identifier = normalizedBody.identifier.trim();
        normalizedBody.identifier = identifier.includes('@') ? identifier.toLowerCase() : normalizePhone(identifier);
    }

    if (typeof normalizedBody.email === 'string') {
        normalizedBody.email = normalizedBody.email.trim().toLowerCase();
    }

    if (typeof normalizedBody.phone === 'string') {
        normalizedBody.phone = normalizePhone(normalizedBody.phone);
    }

    return normalizedBody;
}

function getToken() {
    const rawToken = localStorage.getItem('civicpulse_token');
    if (typeof rawToken !== 'string') {
        return null;
    }

    const token = rawToken.trim();
    if (!token) {
        return null;
    }

    // Guard against malformed header values (e.g. newline/copy-paste artifacts)
    // that can cause fetch() to fail before the request is sent.
    if (/\s/.test(token)) {
        return null;
    }

    return token;
}

function withAuthHeaders(headers = {}) {
    const token = getToken();

    if (!token) {
        return headers;
    }

    return {
        ...headers,
        Authorization: `Bearer ${token}`,
    };
}

async function parseResponse(response) {
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(payload.message || 'Request failed');
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

export async function fetchIssues({ status = 'all', category = 'all', acknowledgedOnly = false, moderation = 'all' } = {}) {
    const query = new URLSearchParams();

    if (status && status !== 'all') {
        query.set('status', status);
    }

    if (category && category !== 'all') {
        query.set('category', category);
    }

    if (acknowledgedOnly) {
        query.set('acknowledgedOnly', 'true');
    }
    if (moderation && moderation !== 'all') {
        query.set('moderation', moderation);
    }

    const suffix = query.toString() ? `?${query}` : '';
    const response = await fetch(`${API_BASE_URL}/issues${suffix}`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchIssueById(id) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchDeptAnalytics() {
    const response = await fetch(`${API_BASE_URL}/analytics/departments`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchTrends(days = 30) {
    const response = await fetch(`${API_BASE_URL}/analytics/trends?days=${days}`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function submitIssueFeedback(id, { rating, comment }) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/feedback`, {
        method: 'POST',
        headers: withAuthHeaders(),
        body: JSON.stringify({ rating, comment }),
    });
    return parseResponse(response);
}

export async function createIssue(formData) {
    const response = await fetch(`${API_BASE_URL}/issues`, {
        method: 'POST',
        headers: withAuthHeaders(),
        body: formData,
    });

    return parseResponse(response);
}

export async function suggestCategoryAPI({ description, photo, signal, timeoutMs = 6000 }) {
    const formData = new FormData();
    if (description) {
        formData.append('description', description);
    }
    if (photo) {
        formData.append('photo', photo);
    }

    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), Math.max(500, Number(timeoutMs) || 6000));
    let detachExternalAbort = null;
    if (signal) {
        if (signal.aborted) {
            timeoutController.abort();
        } else {
            const forwardAbort = () => timeoutController.abort();
            signal.addEventListener('abort', forwardAbort, { once: true });
            detachExternalAbort = () => signal.removeEventListener('abort', forwardAbort);
        }
    }
    let response;
    try {
        response = await fetch(`${API_BASE_URL}/ai/suggest-category`, {
            method: 'POST',
            headers: withAuthHeaders(),
            body: formData,
            signal: timeoutController.signal,
        });
    } finally {
        window.clearTimeout(timeoutId);
        if (detachExternalAbort) {
            detachExternalAbort();
        }
    }
    return parseResponse(response);
}

export async function detectImageAuthenticityAPI({ photo, signal, timeoutMs = 7000 }) {
    const formData = new FormData();
    if (photo) {
        formData.append('photo', photo);
    }

    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort(), Math.max(500, Number(timeoutMs) || 7000));
    let detachExternalAbort = null;
    if (signal) {
        if (signal.aborted) {
            timeoutController.abort();
        } else {
            const forwardAbort = () => timeoutController.abort();
            signal.addEventListener('abort', forwardAbort, { once: true });
            detachExternalAbort = () => signal.removeEventListener('abort', forwardAbort);
        }
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}/ai/detect-image-authenticity`, {
            method: 'POST',
            headers: withAuthHeaders(),
            body: formData,
            signal: timeoutController.signal,
        });
    } finally {
        window.clearTimeout(timeoutId);
        if (detachExternalAbort) {
            detachExternalAbort();
        }
    }

    return parseResponse(response);
}

export async function fetchDuplicateIssuePreview({ category, latitude, longitude, signal }) {
    const response = await fetch(`${API_BASE_URL}/issues/duplicate-preview`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ category, latitude, longitude }),
        signal,
    });
    return parseResponse(response);
}

export async function updateIssueStatus(id, body) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/status`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
    });

    return parseResponse(response);
}

export async function escalateIssue(id, payload) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/escalate`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function updateIssuePriority(id, payload) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/priority`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function markIssueModerationReviewed(id, payload = {}) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/moderation-review`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function verifyIssue(id, verified) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}/verify`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ verified }),
    });

    return parseResponse(response);
}

export async function fetchAdminStats() {
    const response = await fetch(`${API_BASE_URL}/admin/stats`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchDashboardSummary() {
    const response = await fetch(`${API_BASE_URL}/dashboard/summary`);
    return parseResponse(response);
}

export async function fetchMeta() {
    const response = await fetch(`${API_BASE_URL}/meta`);
    return parseResponse(response);
}

export async function lookupWardByCoordinates(lat, lng) {
    const query = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
    });
    const response = await fetch(`${API_BASE_URL}/wards/lookup?${query}`);
    return parseResponse(response);
}

export async function fetchWardAnalytics() {
    const response = await fetch(`${API_BASE_URL}/analytics/wards`);
    return parseResponse(response);
}

export async function fetchWardAnalyticsById(id) {
    const response = await fetch(`${API_BASE_URL}/analytics/wards/${id}`);
    return parseResponse(response);
}

export async function login(body) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function register(body) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function requestCitizenRegisterOtp(body) {
    const response = await fetch(`${API_BASE_URL}/auth/citizen/request-register-otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function verifyCitizenRegisterOtp(body) {
    const response = await fetch(`${API_BASE_URL}/auth/citizen/verify-register-otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function requestCitizenLoginOtp(body) {
    const response = await fetch(`${API_BASE_URL}/auth/citizen/request-login-otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function verifyCitizenLoginOtp(body) {
    const response = await fetch(`${API_BASE_URL}/auth/citizen/verify-login-otp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(withNormalizedPhone(body)),
    });

    return parseResponse(response);
}

export async function fetchEmployees() {
    const response = await fetch(`${API_BASE_URL}/admin/employees`, {
        headers: withAuthHeaders(),
    });

    return parseResponse(response);
}

export async function createEmployee(payload) {
    const response = await fetch(`${API_BASE_URL}/admin/employees`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(withNormalizedPhone(payload)),
    });
    return parseResponse(response);
}

export async function updateEmployee(id, payload) {
    const response = await fetch(`${API_BASE_URL}/admin/employees/${id}`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function fetchWardMaster() {
    const response = await fetch(`${API_BASE_URL}/admin/ward-master`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function updateWardMaster(payload) {
    const response = await fetch(`${API_BASE_URL}/admin/ward-master`, {
        method: 'PUT',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function syncWardMasterFromUrl(url) {
    const response = await fetch(`${API_BASE_URL}/admin/ward-master/sync-url`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ url }),
    });
    return parseResponse(response);
}

export async function fetchCurrentUser() {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: withAuthHeaders(),
    });

    return parseResponse(response);
}

export async function fetchMyIssues() {
    const response = await fetch(`${API_BASE_URL}/users/me/issues`, {
        headers: withAuthHeaders(),
    });

    return parseResponse(response);
}

export async function fetchMyTasks() {
    const response = await fetch(`${API_BASE_URL}/tasks/my`, {
        headers: withAuthHeaders(),
    });

    return parseResponse(response);
}

export async function updateTaskStatus(taskId, payload) {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });

    return parseResponse(response);
}

export async function assignTask(taskId, payload) {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/assign`, {
        method: 'PATCH',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
    });

    return parseResponse(response);
}

// ========== SOCIAL FEATURES ==========

export async function fetchComments(issueId) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/comments`);
    return parseResponse(response);
}

export async function postComment(issueId, text) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/comments`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ text }),
    });
    return parseResponse(response);
}

export async function deleteComment(commentId) {
    const response = await fetch(`${API_BASE_URL}/comments/${commentId}`, {
        method: 'DELETE',
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function voteOnIssue(issueId, voteType) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/vote`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ voteType }),
    });
    return parseResponse(response);
}

export async function fetchVotes(issueId) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/votes`);
    return parseResponse(response);
}

export async function fetchUserReputation() {
    const response = await fetch(`${API_BASE_URL}/users/me/reputation`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchTopContributors(limit = 10) {
    const response = await fetch(`${API_BASE_URL}/leaderboard/contributors?limit=${limit}`);
    return parseResponse(response);
}

export async function toggleIssueUpvote(issueId) {
    return voteOnIssue(issueId, 'upvote');
}

export async function followIssue(issueId) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/follow`, {
        method: 'POST',
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function unfollowIssue(issueId) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/follow`, {
        method: 'DELETE',
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchIssueFollowState(issueId) {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/following`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchFollowedIssues() {
    const response = await fetch(`${API_BASE_URL}/users/me/followed-issues`, {
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchTopVotedIssues() {
    const response = await fetch(`${API_BASE_URL}/issues/top/voted`);
    return parseResponse(response);
}

export async function adminVerifyIssue(issueId, note = '') {
    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/admin-verify`, {
        method: 'POST',
        headers: withAuthHeaders({
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ note }),
    });
    return parseResponse(response);
}

export async function uploadResolvedIssuePhoto(issueId, file) {
    const formData = new FormData();
    formData.append('photo', file);

    const response = await fetch(`${API_BASE_URL}/issues/${issueId}/resolved-photo`, {
        method: 'POST',
        headers: withAuthHeaders(),
        body: formData,
    });
    return parseResponse(response);
}

export async function fetchIssueNotifications() {
    const response = await fetch(`${API_BASE_URL}/notifications`, { headers: withAuthHeaders() });
    return parseResponse(response);
}

export async function fetchUnreadNotificationCount() {
    const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, { headers: withAuthHeaders() });
    return parseResponse(response);
}

export async function markNotificationRead(id) {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function fetchNotificationPreferences() {
    const response = await fetch(`${API_BASE_URL}/users/me/notification-preferences`, { headers: withAuthHeaders() });
    return parseResponse(response);
}

export async function updateNotificationPreferences(payload) {
    const response = await fetch(`${API_BASE_URL}/users/me/notification-preferences`, {
        method: 'PUT',
        headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function fetchSavedIssueFilters() {
    const response = await fetch(`${API_BASE_URL}/users/me/saved-issue-filters`, { headers: withAuthHeaders() });
    return parseResponse(response);
}

export async function saveIssueFilter(payload) {
    const response = await fetch(`${API_BASE_URL}/users/me/saved-issue-filters`, {
        method: 'POST',
        headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

export async function deleteSavedIssueFilter(id) {
    const response = await fetch(`${API_BASE_URL}/users/me/saved-issue-filters/${id}`, {
        method: 'DELETE',
        headers: withAuthHeaders(),
    });
    return parseResponse(response);
}

export async function exportIssuesReport({ format = 'csv', period = 'monthly', wardId = 'all' } = {}) {
    const query = new URLSearchParams({ format, period, wardId });
    const response = await fetch(`${API_BASE_URL}/reports/issues/export?${query}`, { headers: withAuthHeaders() });
    if (!response.ok) {
        return parseResponse(response);
    }
    const blob = await response.blob();
    return { blob };
}

export async function fetchGovernmentReport(frequency = 'monthly') {
    const query = new URLSearchParams({ frequency });
    const response = await fetch(`${API_BASE_URL}/reports/government?${query}`, { headers: withAuthHeaders() });
    return parseResponse(response);
}

export function createIssuesWebSocket(onEvent) {
    const token = getToken();
    if (!token) {
        return null;
    }
    const apiUrl = new URL(API_BASE_URL, window.location.origin);
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    apiUrl.pathname = '/ws';
    apiUrl.searchParams.set('token', token);
    const socket = new WebSocket(apiUrl.toString());
    socket.onmessage = (event) => {
        try {
            onEvent?.(JSON.parse(event.data));
        } catch {
            onEvent?.({ type: 'raw', payload: event.data });
        }
    };
    return socket;
}
