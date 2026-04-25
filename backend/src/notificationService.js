import { getCollection } from './mongo.js';

export async function createNotification({ userId, issueId, type, title, message, metadata = {} }) {
    const notifications = await getCollection('notifications');
    
    const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        issueId,
        type,
        title,
        message,
        metadata,
        read: false,
        createdAt: new Date().toISOString(),
    };

    await notifications.insertOne(notification);
    return notification;
}

export async function getUserNotifications(userId, limit = 50) {
    const notifications = await getCollection('notifications');
    return notifications
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
}

export async function markNotificationAsRead(notificationId, userId) {
    const notifications = await getCollection('notifications');
    await notifications.updateOne(
        { id: notificationId, userId },
        { $set: { read: true, readAt: new Date().toISOString() } }
    );
}

export async function getUnreadCount(userId) {
    const notifications = await getCollection('notifications');
    return notifications.countDocuments({ userId, read: false });
}

export async function notifyStatusChange(issue, oldStatus, newStatus, note) {
    if (!issue.reporterId || issue.anonymous) {
        return;
    }

    const statusMessages = {
        ack: 'Your issue has been acknowledged by the authorities',
        inprog: 'Work has started on your reported issue',
        resolved: 'Your issue has been marked as resolved',
        verified: 'Your issue resolution has been verified',
        closed: 'Your issue has been closed',
        reopened: 'Your issue has been reopened for review',
        escalated: 'Your issue has been escalated to higher authorities',
    };

    const message = statusMessages[newStatus] || `Issue status updated to ${newStatus}`;

    await createNotification({
        userId: issue.reporterId,
        issueId: issue.id,
        type: 'status_change',
        title: `Issue ${issue.id} Updated`,
        message: note || message,
        metadata: {
            oldStatus,
            newStatus,
            issueTitle: issue.title,
        },
    });
}

export function calculateEstimatedResolutionTime(issue, historicalData = []) {
    const categoryAverages = {
        garbage: 2,
        pothole: 5,
        streetlight: 3,
        water: 4,
        drainage: 6,
        park: 7,
        stray: 10,
        encroach: 14,
        noise: 3,
        safety: 1,
        illegal: 21,
        flood: 2,
    };

    const severityMultipliers = {
        low: 1.5,
        medium: 1.0,
        high: 0.7,
        critical: 0.5,
    };

    let baseDays = categoryAverages[issue.category] || 5;
    const multiplier = severityMultipliers[issue.severity] || 1.0;
    
    if (historicalData.length > 0) {
        const categoryIssues = historicalData.filter(
            h => h.category === issue.category && h.status === 'resolved'
        );
        
        if (categoryIssues.length >= 3) {
            const avgDays = categoryIssues.reduce((sum, h) => {
                const created = new Date(h.createdAt);
                const resolved = new Date(h.updatedAt);
                const days = (resolved - created) / (1000 * 60 * 60 * 24);
                return sum + days;
            }, 0) / categoryIssues.length;
            
            baseDays = Math.round(avgDays);
        }
    }

    return Math.max(1, Math.round(baseDays * multiplier));
}
