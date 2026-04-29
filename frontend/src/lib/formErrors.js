import { normalizePhone } from '@/lib/validators.js';

function safeTrim(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getFirstArrayMessage(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return '';
    }

    const first = value.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    return first || '';
}

export function mapBackendFieldErrors(error, fieldMap = {}) {
    const payload = error?.payload;
    const fieldErrors = payload?.errors?.fieldErrors;

    if (!fieldErrors || typeof fieldErrors !== 'object') {
        return {};
    }

    const mapped = {};
    Object.entries(fieldErrors).forEach(([key, value]) => {
        const message = getFirstArrayMessage(value);
        if (!message) {
            return;
        }

        const mappedKey = fieldMap[key] || key;
        mapped[mappedKey] = message;
    });

    return mapped;
}

export function validateAdminLogin(form) {
    const errors = {};
    const identifier = safeTrim(form.identifier);
    const password = safeTrim(form.password);

    if (!identifier) {
        errors.identifier = 'Phone or email is required';
    } else if (!isEmail(identifier)) {
        const phone = normalizePhone(identifier);
        if (phone.length < 10 || phone.length > 20) {
            errors.identifier = 'Enter a valid phone number or email';
        }
    }

    if (!password) {
        errors.password = 'Password is required';
    } else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    }

    return errors;
}

export function validateCitizenCredentialStep(form, mode) {
    const errors = {};

    if (mode === 'login') {
        const identifier = safeTrim(form.identifier);

        if (!identifier) {
            errors.identifier = 'Phone or email is required';
        } else if (!isEmail(identifier)) {
            const phone = normalizePhone(identifier);
            if (phone.length < 10 || phone.length > 20) {
                errors.identifier = 'Enter a valid phone number or email';
            }
        }
    }

    if (mode === 'register') {
        const name = safeTrim(form.name);
        const phone = normalizePhone(form.phone || '');
        const email = safeTrim(form.email).toLowerCase();
        const wardName = safeTrim(form.wardName);
        const area = safeTrim(form.area);
        const address = safeTrim(form.address);
        const pincode = safeTrim(form.pincode);

        if (!name) {
            errors.name = 'Name is required';
        } else if (name.length < 2) {
            errors.name = 'Name must be at least 2 characters';
        }

        if (!phone && !email) {
            errors.identifier = 'Phone or email is required';
        }

        if (phone && (phone.length < 10 || phone.length > 20)) {
            errors.phone = 'Phone number must be 10 digits';
        }

        if (email && !isEmail(email)) {
            errors.email = 'Enter a valid email address';
        }

        if (wardName && wardName.length > 120) {
            errors.wardName = 'Ward name is too long';
        }

        if (area && area.length < 2) {
            errors.area = 'Area must be at least 2 characters';
        }

        if (address && address.length < 6) {
            errors.address = 'Address must be at least 6 characters';
        }

        if (pincode && !/^\d{6}$/.test(pincode)) {
            errors.pincode = 'Pincode must be a 6-digit number';
        }
    }

    const password = safeTrim(form.password);
    if (!password) {
        errors.password = 'Password is required';
    } else if (mode === 'register') {
        if (password.length < 12) {
            errors.password = 'Password must be at least 12 characters';
        } else if (!/[a-z]/.test(password)) {
            errors.password = 'Password must include at least one lowercase letter';
        } else if (!/[A-Z]/.test(password)) {
            errors.password = 'Password must include at least one uppercase letter';
        } else if (!/[0-9]/.test(password)) {
            errors.password = 'Password must include at least one number';
        } else if (!/[^A-Za-z0-9]/.test(password)) {
            errors.password = 'Password must include at least one special character';
        }
    } else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    }

    return errors;
}

export function validateOtpStep(form) {
    const errors = {};
    const otp = safeTrim(form.otp).replace(/\D/g, '');

    if (!otp) {
        errors.otp = 'OTP is required';
    } else if (otp.length !== 6) {
        errors.otp = 'OTP must be 6 digits';
    }

    return errors;
}
