import { getCollection } from './mongo.js';
import { createNotification } from './notificationService.js';

// UPVOTING
export async function upvoteIssue(issueId, userId) {
    const votes = await getCollection('issueVotes');
    
    const existing = await votes.findOne({ issueId, userId });
    if (existing) {
        return { alreadyVoted: true };
    }

    const vote = {
        id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        issueId,
        userId,
        voteType: 'upvote',
        createdAt: new Date().toISOString(),
    };

    await votes.insertOne(vote);
    return { success: true, vote };
}

export async function removeUpvote(issueId, userId) {
    const votes = await getCollection('issueVotes');
    await votes.deleteOne({ issueId, userId });
    return { success: true };
}

export async function getIssueVoteCount(issueId) {
    const votes = await getCollection('issueVotes');
    return votes.countDocuments({ issueId, voteType: 'upvote' });
}

export async function hasUserVoted(issueId, userId) {
    if (!userId) return false;
    const votes = await getCollection('issueVotes');
    const vote = await votes.findOne({ issueId, userId });
    return !!vote;
}

export async function getTopVotedIssues(limit = 10) {
    const votes = await getCollection('issueVotes');
    const pipeline = [
        { $match: { voteType: 'upvote' } },
        { $group: { _id: '$issueId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
    ];
    
    const results = await votes.aggregate(pipeline).toArray();
    return results.map(r => ({ issueId: r._id, voteCount: r.count }));
}

// FOLLOWING
export async function followIssue(issueId, userId) {
    const follows = await getCollection('issueFollows');
    
    const existing = await follows.findOne({ issueId, userId });
    if (existing) {
        return { alreadyFollowing: true };
    }

    const follow = {
        id: `follow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        issueId,
        userId,
        createdAt: new Date().toISOString(),
    };

    await follows.insertOne(follow);
    return { success: true, follow };
}

export async function unfollowIssue(issueId, userId) {
    const follows = await getCollection('issueFollows');
    await follows.deleteOne({ issueId, userId });
    return { success: true };
}

export async function isUserFollowing(issueId, userId) {
    if (!userId) return false;
    const follows = await getCollection('issueFollows');
    const follow = await follows.findOne({ issueId, userId });
    return !!follow;
}

export async function getFollowedIssues(userId) {
    const follows = await getCollection('issueFollows');
    const userFollows = await follows.find({ userId }).sort({ createdAt: -1 }).toArray();
    return userFollows.map(f => f.issueId);
}

export async function notifyFollowers(issue, eventType, message) {
    const follows = await getCollection('issueFollows');
    const followers = await follows.find({ issueId: issue.id }).toArray();
    
    for (const follow of followers) {
        if (follow.userId !== issue.reporterId) {
            await createNotification({
                userId: follow.userId,
                issueId: issue.id,
                type: eventType,
                title: `Update on followed issue ${issue.id}`,
                message,
                metadata: { issueTitle: issue.title },
            });
        }
    }
}

// VERIFICATION
export async function markIssueAsVerified(issueId, adminId, note) {
    const verifications = await getCollection('issueVerifications');
    
    const verification = {
        id: `verify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        issueId,
        verifiedBy: adminId,
        verifiedAt: new Date().toISOString(),
        note: note || 'Issue verified by admin',
        status: 'verified',
    };

    await verifications.insertOne(verification);
    return verification;
}

export async function getIssueVerification(issueId) {
    const verifications = await getCollection('issueVerifications');
    return verifications.findOne({ issueId });
}

export async function checkDuplicateIssues(issue) {
    const issues = await getCollection('issues');
    
    const duplicates = await issues.find({
        category: issue.category,
        wardId: issue.wardId,
        status: { $in: ['new', 'ack', 'inprog'] },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    }).toArray();

    const nearby = duplicates.filter(d => {
        if (!d.lat || !d.lng || !issue.lat || !issue.lng) return false;
        const distance = Math.sqrt(
            Math.pow(d.lat - issue.lat, 2) + Math.pow(d.lng - issue.lng, 2)
        );
        return distance < 0.005;
    });

    return nearby;
}
