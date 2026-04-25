export function getStatusColor(status) {
    const colors = {
        new: 'bg-info text-info-foreground',
        ack: 'bg-accent text-accent-foreground',
        inprog: 'bg-warning text-warning-foreground',
        resolved: 'bg-secondary text-secondary-foreground',
        verified: 'bg-secondary text-secondary-foreground',
        closed: 'bg-muted text-muted-foreground',
        reopened: 'bg-primary text-primary-foreground',
        escalated: 'bg-destructive text-destructive-foreground',
    };

    return colors[status] || 'bg-muted text-muted-foreground';
}
