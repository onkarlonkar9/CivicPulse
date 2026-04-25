const RESOLVED_STATUSES = new Set(['resolved', 'verified', 'closed']);
const OPEN_STATUSES = new Set(['new', 'ack', 'inprog', 'reopened', 'escalated']);

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function average(values) {
    if (!values.length) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 1) {
    if (value == null || Number.isNaN(value)) {
        return null;
    }

    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function getResolvedTimestamp(issue) {
    const resolvedEntry = [...(issue.timeline || [])]
        .reverse()
        .find((entry) => RESOLVED_STATUSES.has(entry.status));

    if (resolvedEntry?.timestamp) {
        return resolvedEntry.timestamp;
    }

    if (RESOLVED_STATUSES.has(issue.status)) {
        return issue.updatedAt;
    }

    return null;
}

function getDaysBetween(start, end) {
    return (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
}

function getRecentMonthBuckets(count = 6) {
    const buckets = [];
    const now = new Date();
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    for (let index = count - 1; index >= 0; index -= 1) {
        const bucketDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - index, 1));
        buckets.push({
            key: `${bucketDate.getUTCFullYear()}-${String(bucketDate.getUTCMonth() + 1).padStart(2, '0')}`,
            label: bucketDate.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        });
    }

    return buckets;
}

function getMonthKey(dateValue) {
    const date = new Date(dateValue);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function computeWardScore({ totalIssues, resolvedIssues, verifiedIssues, avgResolutionDays, openIssues }) {
    if (!totalIssues) {
        return null;
    }

    const resolutionRate = resolvedIssues / totalIssues;
    const verificationRate = resolvedIssues ? verifiedIssues / resolvedIssues : 0;
    const speedScore = avgResolutionDays == null ? 0 : clamp(1 - avgResolutionDays / 14, 0, 1);
    const backlogScore = clamp(1 - openIssues / totalIssues, 0, 1);

    return Math.round((resolutionRate * 45) + (verificationRate * 20) + (speedScore * 20) + (backlogScore * 15));
}

export function buildWardAnalytics(issues, wardMetadata = []) {
    const recentMonths = getRecentMonthBuckets(6);
    const byWard = new Map((wardMetadata || []).map((ward) => [ward.id, []]));

    for (const issue of issues) {
        if (byWard.has(issue.wardId)) {
            byWard.get(issue.wardId).push(issue);
        }
    }

    const wards = (wardMetadata || []).map((ward) => {
        const wardIssues = (byWard.get(ward.id) || [])
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const totalIssues = wardIssues.length;
        const resolvedIssues = wardIssues.filter((issue) => RESOLVED_STATUSES.has(issue.status)).length;
        const openIssues = wardIssues.filter((issue) => OPEN_STATUSES.has(issue.status)).length;
        const verifiedIssues = wardIssues.filter((issue) => issue.verification === true || issue.status === 'verified').length;
        const avgResolutionDays = average(
            wardIssues
                .map((issue) => {
                    const resolvedAt = getResolvedTimestamp(issue);
                    return resolvedAt ? getDaysBetween(issue.createdAt, resolvedAt) : null;
                })
                .filter((value) => value != null && value >= 0)
        );
        const resolutionRate = totalIssues ? (resolvedIssues / totalIssues) * 100 : null;
        const verificationRate = resolvedIssues ? (verifiedIssues / resolvedIssues) * 100 : null;
        const score = computeWardScore({ totalIssues, resolvedIssues, verifiedIssues, avgResolutionDays, openIssues });

        const categoryBreakdown = Object.entries(
            wardIssues.reduce((accumulator, issue) => {
                accumulator[issue.category] = (accumulator[issue.category] || 0) + 1;
                return accumulator;
            }, {})
        )
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count);

        const monthlyTrend = recentMonths.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            complaints: wardIssues.filter((issue) => getMonthKey(issue.createdAt) === bucket.key).length,
            resolved: wardIssues.filter((issue) => {
                const resolvedAt = getResolvedTimestamp(issue);
                return resolvedAt ? getMonthKey(resolvedAt) === bucket.key : false;
            }).length,
        }));

        return {
            ...ward,
            totalIssues,
            resolvedIssues,
            openIssues,
            verifiedIssues,
            resolutionRate: round(resolutionRate),
            verificationRate: round(verificationRate),
            avgResolutionDays: round(avgResolutionDays),
            score,
            recentIssues: wardIssues.slice(0, 5),
            categoryBreakdown,
            monthlyTrend,
        };
    });

    const ranked = wards
        .filter((ward) => ward.score != null)
        .sort((a, b) => b.score - a.score || b.resolutionRate - a.resolutionRate || a.avgResolutionDays - b.avgResolutionDays);

    const ranking = new Map(ranked.map((ward, index) => [ward.id, index + 1]));

    return wards.map((ward) => ({
        ...ward,
        rank: ranking.get(ward.id) || null,
    }));
}

export function buildCityIssueStats(issues) {
    const resolvedIssues = issues.filter((issue) => RESOLVED_STATUSES.has(issue.status));
    const avgResolutionDays = average(
        resolvedIssues
            .map((issue) => {
                const resolvedAt = getResolvedTimestamp(issue);
                return resolvedAt ? getDaysBetween(issue.createdAt, resolvedAt) : null;
            })
            .filter((value) => value != null && value >= 0)
    );

    return {
        total: issues.length,
        resolved: resolvedIssues.length,
        activeWards: new Set(issues.map((issue) => issue.wardId).filter(Boolean)).size,
        avgResolutionDays: round(avgResolutionDays),
    };
}
