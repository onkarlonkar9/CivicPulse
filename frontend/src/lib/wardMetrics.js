export function getWardScoreTier(score) {
    if (score == null) {
        return { label: 'No data', color: 'text-muted-foreground', fill: '#94a3b8', badge: 'N/A' };
    }

    if (score >= 80) {
        return { label: 'Excellent', color: 'text-emerald-600', fill: '#10b981', badge: 'A' };
    }

    if (score >= 60) {
        return { label: 'Good', color: 'text-lime-600', fill: '#84cc16', badge: 'B' };
    }

    if (score >= 40) {
        return { label: 'Average', color: 'text-amber-600', fill: '#f59e0b', badge: 'C' };
    }

    return { label: 'Critical', color: 'text-rose-600', fill: '#ef4444', badge: 'D' };
}
