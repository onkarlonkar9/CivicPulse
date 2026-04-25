import { useState, useEffect } from 'react';
import { ThumbsUp, Bookmark, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { fetchIssueFollowState, fetchVotes, followIssue, toggleIssueUpvote, unfollowIssue } from '@/lib/api.js';

export default function IssueEngagement({ issueId, showVerified = false, isVerified = false }) {
    const { isAuthenticated } = useAuth();
    const [voteCount, setVoteCount] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchEngagement = async () => {
            try {
                const voteData = await fetchVotes(issueId);
                setVoteCount(voteData.upvotes || voteData.count || 0);
                setHasVoted(voteData.userVote === 'upvote' || voteData.hasVoted === true);

                if (isAuthenticated) {
                    const followData = await fetchIssueFollowState(issueId);
                    setIsFollowing(followData.following || false);
                }
            } catch (error) {
                console.error('Failed to fetch engagement:', error);
            }
        };

        fetchEngagement();
    }, [issueId, isAuthenticated]);

    const handleUpvote = async () => {
        if (!isAuthenticated) {
            alert('Please sign in to upvote');
            return;
        }

        setLoading(true);
        try {
            await toggleIssueUpvote(issueId);
            const refreshedVotes = await fetchVotes(issueId);
            setVoteCount(refreshedVotes.upvotes || refreshedVotes.count || 0);
            setHasVoted(refreshedVotes.userVote === 'upvote' || refreshedVotes.hasVoted === true);
        } catch (error) {
            console.error('Failed to upvote:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFollow = async () => {
        if (!isAuthenticated) {
            alert('Please sign in to follow');
            return;
        }

        setLoading(true);
        try {
            if (isFollowing) {
                await unfollowIssue(issueId);
                setIsFollowing(false);
            } else {
                await followIssue(issueId);
                setIsFollowing(true);
            }
        } catch (error) {
            console.error('Failed to follow:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button
                variant={hasVoted ? 'default' : 'outline'}
                size="sm"
                onClick={handleUpvote}
                disabled={loading}
                className="gap-2"
            >
                <ThumbsUp className={`h-4 w-4 ${hasVoted ? 'fill-current' : ''}`} />
                <span>{voteCount}</span>
                <span className="hidden sm:inline">{hasVoted ? 'Me Too' : 'Me Too'}</span>
            </Button>

            {isAuthenticated && (
                <Button
                    variant={isFollowing ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={handleFollow}
                    disabled={loading}
                    className="gap-2"
                >
                    <Bookmark className={`h-4 w-4 ${isFollowing ? 'fill-current' : ''}`} />
                    <span className="hidden sm:inline">{isFollowing ? 'Following' : 'Follow'}</span>
                </Button>
            )}

            {showVerified && isVerified && (
                <Badge variant="secondary" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                </Badge>
            )}
        </div>
    );
}
