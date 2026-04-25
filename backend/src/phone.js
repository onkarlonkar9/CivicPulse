function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

export function normalizePhone(phone) {
    const digits = digitsOnly(phone);

    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(-10);
    }

    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(-10);
    }

    return digits;
}

export function phonesMatch(a, b) {
    return normalizePhone(a) === normalizePhone(b);
}
