const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getApiOrigin() {
    try {
        return new URL(API_BASE_URL, window.location.origin).origin;
    } catch {
        return window.location.origin;
    }
}

export function resolveAssetUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }

    if (/^https?:\/\//i.test(url) || /^data:/i.test(url) || /^blob:/i.test(url)) {
        return url;
    }

    if (url.startsWith('/uploads/')) {
        return `${getApiOrigin()}${url}`;
    }

    if (url.startsWith('/')) {
        return url;
    }

    return `${getApiOrigin()}/${url}`;
}
