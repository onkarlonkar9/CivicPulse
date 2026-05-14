// File upload validation utilities
const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE_PER_TYPE = {
    'image/jpeg': 5 * 1024 * 1024, // 5MB for JPEG
    'image/png': 5 * 1024 * 1024,  // 5MB for PNG
    'image/webp': 5 * 1024 * 1024, // 5MB for WebP
    'image/gif': 3 * 1024 * 1024,  // 3MB for GIF
};

export function validateFileUpload(file) {
    const errors = [];

    if (!file) {
        errors.push('No file provided');
        return { valid: false, errors };
    }

    // Check MIME type
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        errors.push(`File type ${file.mimetype} is not allowed. Allowed types: ${Array.from(ALLOWED_IMAGE_TYPES).join(', ')}`);
    }

    // Check file extension
    const ext = file.originalname?.slice(file.originalname.lastIndexOf('.') || 0).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
        errors.push(`File extension ${ext} is not allowed`);
    }

    // Check file size
    const maxSize = MAX_FILE_SIZE_PER_TYPE[file.mimetype] || MAX_FILE_SIZE;
    if (file.size > maxSize) {
        errors.push(`File size exceeds maximum of ${maxSize / 1024 / 1024}MB`);
    }

    // Sanitize filename
    const sanitizedName = sanitizeFilename(file.originalname);
    if (!sanitizedName) {
        errors.push('Invalid filename');
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitizedName,
    };
}

export function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        return null;
    }

    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^\.+/, '') // Remove leading dots
        .slice(0, 255); // Limit filename length
}

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
