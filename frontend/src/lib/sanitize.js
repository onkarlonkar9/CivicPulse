import DOMPurify from 'isomorphic-dompurify';

// Sanitize HTML content to prevent XSS attacks
export function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }

    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li', 'a'],
        ALLOWED_ATTR: ['href', 'title', 'target'],
        KEEP_CONTENT: true,
    });
}

// Escape HTML special characters (for text-only content)
export function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

// Safe text display - no HTML allowed
export function safeText(text) {
    return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
