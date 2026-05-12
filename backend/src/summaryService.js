function cleanText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitSentences(text) {
    return text
        .split(/(?<=[.!?])\s+/)
        .map((entry) => cleanText(entry))
        .filter(Boolean);
}

export function generateIssueSummary({ title, description, category, wardName, severity }) {
    const safeTitle = cleanText(title);
    const safeDescription = cleanText(description);
    const safeCategory = cleanText(category);
    const safeWard = cleanText(wardName);
    const safeSeverity = cleanText(severity || 'medium');

    const introParts = [
        safeCategory ? `${safeCategory} issue` : 'Civic issue',
        safeWard ? `in ${safeWard}` : '',
        safeSeverity ? `(${safeSeverity})` : '',
    ].filter(Boolean);
    const intro = introParts.join(' ');

    const sentences = splitSentences(safeDescription);
    const primary = sentences[0] || safeDescription || safeTitle || 'Citizen reported an issue requiring attention.';
    const secondary = sentences[1] || '';

    const summary = [intro, primary, secondary]
        .filter(Boolean)
        .join('. ')
        .replace(/\.\s*\./g, '.')
        .trim();

    return summary.length > 280 ? `${summary.slice(0, 277).trim()}...` : summary;
}

