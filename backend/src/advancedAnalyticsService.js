const RESOLVED_STATUSES = new Set(['resolved', 'verified', 'closed']);

export function calculateSLAStatus(issue, categories) {
    const category = categories.find(c => c.id === issue.category);
    if (!category) return { isOverSLA: false, remainingHours: null };

    const slaHours = category.slaHours || 72; // Default 72h
    const created = new Date(issue.createdAt).getTime();
    const now = Date.now();
    
    // If resolved, check against resolution time
    let end = now;
    if (RESOLVED_STATUSES.has(issue.status)) {
        const resolvedEntry = [...(issue.timeline || [])]
            .reverse()
            .find((entry) => RESOLVED_STATUSES.has(entry.status));
        if (resolvedEntry) end = new Date(resolvedEntry.timestamp).getTime();
    }

    const elapsedHours = (end - created) / 3600000;
    const isOverSLA = elapsedHours > slaHours;
    const remainingHours = isOverSLA ? 0 : Math.max(0, slaHours - elapsedHours);

    return { isOverSLA, remainingHours, slaHours, elapsedHours };
}

export function buildDepartmentAnalytics(issues, categories) {
    const departments = [...new Set(categories.map(c => c.department))];
    const deptStats = departments.map(dept => {
        const deptCategories = categories.filter(c => c.department === dept).map(c => c.id);
        const deptIssues = issues.filter(i => deptCategories.includes(i.category));
        
        const total = deptIssues.length;
        const resolved = deptIssues.filter(i => RESOLVED_STATUSES.has(i.status)).length;
        const open = total - resolved;
        
        const slaCompliant = deptIssues.filter(i => !calculateSLAStatus(i, categories).isOverSLA).length;
        const slaComplianceRate = total > 0 ? (slaCompliant / total) * 100 : 100;

        const resolvedWithTime = deptIssues.filter(i => RESOLVED_STATUSES.has(i.status));
        const avgResolutionTime = resolvedWithTime.length > 0
            ? resolvedWithTime.reduce((acc, i) => {
                const sla = calculateSLAStatus(i, categories);
                return acc + sla.elapsedHours;
            }, 0) / resolvedWithTime.length
            : null;

        return {
            name: dept,
            total,
            resolved,
            open,
            slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
            avgResolutionTime: avgResolutionTime ? Math.round(avgResolutionTime * 10) / 10 : null,
        };
    });

    return deptStats.sort((a, b) => b.total - a.total);
}

export function buildTrends(issues, days = 30) {
    const now = new Date();
    const trends = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const createdOnDay = issues.filter(issue => issue.createdAt.startsWith(dateStr)).length;
        const resolvedOnDay = issues.filter(issue => {
            const resolvedEntry = (issue.timeline || []).find(e => RESOLVED_STATUSES.has(e.status));
            return resolvedEntry?.timestamp.startsWith(dateStr);
        }).length;
        
        trends.push({
            date: dateStr,
            created: createdOnDay,
            resolved: resolvedOnDay,
        });
    }
    
    return trends;
}
