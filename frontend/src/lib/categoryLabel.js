export function getCategoryLabel(categoryId, t, options = []) {
    if (!categoryId) {
        return '-';
    }

    if (categoryId.startsWith('custom:')) {
        return categoryId.slice('custom:'.length);
    }

    const matchedCategory = options.find((entry) => entry.id === categoryId);
    if (matchedCategory?.translationKey) {
        const translated = t(matchedCategory.translationKey);
        if (translated !== matchedCategory.translationKey) {
            return translated;
        }
    }

    const translationKey = `cat.${categoryId}`;
    const translated = t(translationKey);
    if (translated !== translationKey) {
        return translated;
    }

    return categoryId
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
