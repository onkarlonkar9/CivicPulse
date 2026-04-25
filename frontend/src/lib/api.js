const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');

    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(-10);
    }

    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(-10);
    }

    return digits;
}

function withNormalizedPhone(body) {
    if (!body || typeof body !== 'object' || !('phone' in body)) {
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

    return {
        ...normalizedBody,
        phone: normalizePhone(normalizedBody.phone),
    };
}

function getToken() {
    return localStorage.getItem('civicpulse_token');
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
        error.payload = payload;
        throw error;
    }

    return payload;
}

export async function fetchIssues({ status = 'all', category = 'all' } = {}) {
    const query = new URLSearchParams();

    if (status && status !== 'all') {
        query.set('status', status);
    }

    if (category && category !== 'all') {
        query.set('category', category);
    }

    const suffix = query.toString() ? `?${query}` : '';
    const response = await fetch(`${API_BASE_URL}/issues${suffix}`);
    return parseResponse(response);
}

export async function fetchIssueById(id) {
    const response = await fetch(`${API_BASE_URL}/issues/${id}`);
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

export async function registerAdmin(body) {
    const response = await fetch(`${API_BASE_URL}/auth/admin/register`, {
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

export async function fetchAdminInvites() {
    const response = await fetch(`${API_BASE_URL}/admin/invites`, {
        headers: withAuthHeaders(),
    });

    return parseResponse(response);
}

export async function createAdminInvite() {
    const response = await fetch(`${API_BASE_URL}/admin/invites`, {
        method: 'POST',
        headers: withAuthHeaders(),
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
