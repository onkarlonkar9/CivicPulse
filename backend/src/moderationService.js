const BLOCKED_TERMS = [
    'kill',
    'bomb',
    'terrorist',
    'nude',
    'porn',
    'rape',
];

const REVIEW_TERMS = [
    'idiot',
    'stupid',
    'hate',
    'scam',
    'fraud',
    'fake',
];

function countUrlLikeTokens(text) {
    const matches = text.match(/(https?:\/\/|www\.|bit\.ly|tinyurl|t\.co)/gi);
    return matches ? matches.length : 0;
}

function normalizeText(value) {
    return String(value || '').toLowerCase().trim();
}

export function moderateText(rawText) {
    const text = normalizeText(rawText);
    const reasons = [];

    if (!text) {
        return { status: 'clean', reasons };
    }

    const blockedMatches = BLOCKED_TERMS.filter((term) => text.includes(term));
    if (blockedMatches.length > 0) {
        reasons.push(`blocked_terms:${blockedMatches.join(',')}`);
    }

    const reviewMatches = REVIEW_TERMS.filter((term) => text.includes(term));
    if (reviewMatches.length > 0) {
        reasons.push(`review_terms:${reviewMatches.join(',')}`);
    }

    const urlCount = countUrlLikeTokens(text);
    if (urlCount >= 3) {
        reasons.push(`spam_links:${urlCount}`);
    }

    if (/([!?$#@])\1{5,}/.test(text)) {
        reasons.push('spam_repeated_symbols');
    }

    if (blockedMatches.length > 0) {
        return { status: 'blocked', reasons };
    }

    if (reasons.length > 0) {
        return { status: 'review', reasons };
    }

    return { status: 'clean', reasons };
}

