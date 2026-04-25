import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCollection } from './mongo.js';
import { requireAuth, getUserFromRequest } from './auth.js';

const commentSchema = z.object({
    text: z.string().trim().min(1).max(500),
});

const voteSchema = z.object({
    voteType: z.enum(['upvote', 'downvote']),
});

function withoutMongoId(document) {
    if (!document) {
        return document;
    }

    const { _id, ...rest } = document;
    return rest;
}

function withAuthor(comment, authorMap) {
    return {
        ...withoutMongoId(comment),
        author: comment.authorId ? authorMap.get(comment.authorId) || null : null,
    };
}

async function getIssueById(id) {
    const issues = await getCollection('issues');
    return issues.findOne({ id });
}

async function getAuthorMap(authorIds) {
    if (authorIds.length === 0) {
        return new Map();
    }

    const users = await getCollection('users');
    const authors = await users.find({ id: { $in: authorIds } }).toArray();
    return new Map(authors.map((author) => [author.id, {
        id: author.id,
        name: author.name,
    }]));
}

export function registerSocialRoutes(app) {
    app.get('/api/issues/:id/comments', async (req, res) => {
        try {
            const commentsCollection = await getCollection('comments');
            const comments = await commentsCollection
                .find({ issueId: req.params.id })
                .sort({ createdAt: -1 })
                .toArray();

            const authorIds = [...new Set(comments.map((comment) => comment.authorId).filter(Boolean))];
            const authorMap = await getAuthorMap(authorIds);

            res.json({
                comments: comments.map((comment) => withAuthor(comment, authorMap)),
            });
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch comments', error: error.message });
        }
    });

    app.post('/api/issues/:id/comments', async (req, res) => {
        try {
            const parsed = commentSchema.safeParse(req.body);

            if (!parsed.success) {
                res.status(400).json({
                    message: 'Invalid comment payload',
                    errors: parsed.error.flatten(),
                });
                return;
            }

            const issue = await getIssueById(req.params.id);
            if (!issue) {
                res.status(404).json({ message: 'Issue not found' });
                return;
            }

            const user = await getUserFromRequest(req);
            const commentsCollection = await getCollection('comments');
            const reputations = await getCollection('userReputations');
            const now = new Date().toISOString();

            const comment = {
                id: `comment-${randomUUID()}`,
                issueId: req.params.id,
                authorId: user?.id || null,
                text: parsed.data.text,
                isAiGenerated: false,
                helpfulCount: 0,
                createdAt: now,
                updatedAt: now,
            };

            await commentsCollection.insertOne(comment);

            if (user) {
                await reputations.updateOne(
                    { userId: user.id },
                    {
                        $setOnInsert: {
                            id: `rep-${user.id}`,
                            userId: user.id,
                            issuesReported: 0,
                            helpfulCount: 0,
                            badges: [],
                            createdAt: now,
                        },
                        $inc: {
                            commentsAdded: 1,
                            reputationScore: 3,
                        },
                        $set: {
                            updatedAt: now,
                        },
                    },
                    { upsert: true }
                );
            }

            const authorMap = await getAuthorMap(user ? [user.id] : []);
            res.status(201).json(withAuthor(comment, authorMap));
        } catch (error) {
            res.status(500).json({ message: 'Failed to create comment', error: error.message });
        }
    });

    app.delete('/api/comments/:id', requireAuth, async (req, res) => {
        try {
            const user = await getUserFromRequest(req);
            const commentsCollection = await getCollection('comments');
            const comment = await commentsCollection.findOne({ id: req.params.id });

            if (!comment) {
                res.status(404).json({ message: 'Comment not found' });
                return;
            }

            if (comment.authorId !== user.id && !['admin', 'super-admin'].includes(user.role)) {
                res.status(403).json({ message: 'Not authorized to delete this comment' });
                return;
            }

            await commentsCollection.deleteOne({ id: req.params.id });
            res.json({ message: 'Comment deleted' });
        } catch (error) {
            res.status(500).json({ message: 'Failed to delete comment', error: error.message });
        }
    });

    app.post('/api/issues/:id/vote', requireAuth, async (req, res) => {
        try {
            const parsed = voteSchema.safeParse(req.body);

            if (!parsed.success) {
                res.status(400).json({ message: 'Invalid vote payload', errors: parsed.error.flatten() });
                return;
            }

            const issue = await getIssueById(req.params.id);
            if (!issue) {
                res.status(404).json({ message: 'Issue not found' });
                return;
            }

            const user = await getUserFromRequest(req);
            const issueVotes = await getCollection('issueVotes');
            const existingVote = await issueVotes.findOne({
                userId: user.id,
                issueId: req.params.id,
            });

            let userVote = parsed.data.voteType;

            if (existingVote?.voteType === parsed.data.voteType) {
                await issueVotes.deleteOne({ id: existingVote.id });
                userVote = null;
            } else {
                await issueVotes.deleteMany({
                    userId: user.id,
                    issueId: req.params.id,
                });

                await issueVotes.insertOne({
                    id: `vote-${randomUUID()}`,
                    userId: user.id,
                    issueId: req.params.id,
                    voteType: parsed.data.voteType,
                    createdAt: new Date().toISOString(),
                });
            }

            const [upvotes, downvotes] = await Promise.all([
                issueVotes.countDocuments({ issueId: req.params.id, voteType: 'upvote' }),
                issueVotes.countDocuments({ issueId: req.params.id, voteType: 'downvote' }),
            ]);

            res.json({ upvotes, downvotes, userVote });
        } catch (error) {
            res.status(500).json({ message: 'Failed to vote', error: error.message });
        }
    });

    app.get('/api/issues/:id/votes', async (req, res) => {
        try {
            const issueVotes = await getCollection('issueVotes');
            const [upvotes, downvotes] = await Promise.all([
                issueVotes.countDocuments({ issueId: req.params.id, voteType: 'upvote' }),
                issueVotes.countDocuments({ issueId: req.params.id, voteType: 'downvote' }),
            ]);

            let userVote = null;
            const user = await getUserFromRequest(req);

            if (user) {
                const vote = await issueVotes.findOne({
                    userId: user.id,
                    issueId: req.params.id,
                });
                userVote = vote?.voteType || null;
            }

            res.json({
                upvotes,
                downvotes,
                userVote,
                count: upvotes,
                hasVoted: userVote === 'upvote',
            });
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch votes', error: error.message });
        }
    });

    app.get('/api/users/me/reputation', requireAuth, async (req, res) => {
        try {
            const user = await getUserFromRequest(req);
            const reputations = await getCollection('userReputations');
            const reputation = await reputations.findOne({ userId: user.id });

            if (!reputation) {
                res.status(404).json({ message: 'Reputation not found' });
                return;
            }

            res.json({
                reputationScore: reputation.reputationScore || 0,
                issuesReported: reputation.issuesReported || 0,
                commentsAdded: reputation.commentsAdded || 0,
                helpfulCount: reputation.helpfulCount || 0,
                badges: Array.isArray(reputation.badges) ? reputation.badges : [],
            });
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch reputation', error: error.message });
        }
    });

    app.get('/api/leaderboard/contributors', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 10, 100);
            const reputations = await getCollection('userReputations');
            const topContributors = await reputations
                .find({})
                .sort({ reputationScore: -1, updatedAt: -1 })
                .limit(limit)
                .toArray();

            const authorIds = topContributors.map((entry) => entry.userId).filter(Boolean);
            const authorMap = await getAuthorMap(authorIds);

            const leaderboard = topContributors
                .filter((entry) => authorMap.has(entry.userId))
                .map((entry, index) => ({
                    rank: index + 1,
                    userName: authorMap.get(entry.userId).name,
                    userId: entry.userId,
                    reputationScore: entry.reputationScore || 0,
                    issuesReported: entry.issuesReported || 0,
                    commentsAdded: entry.commentsAdded || 0,
                    badges: Array.isArray(entry.badges) ? entry.badges : [],
                }));

            res.json({ leaderboard });
        } catch (error) {
            res.status(500).json({ message: 'Failed to fetch leaderboard', error: error.message });
        }
    });
}

export default registerSocialRoutes;
