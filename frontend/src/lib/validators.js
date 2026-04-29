export function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');

    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(-10);
    }

    if (digits.length === 11 && digits.startsWith('0')) {
        return digits.slice(-10);
    }

    return digits;
}
