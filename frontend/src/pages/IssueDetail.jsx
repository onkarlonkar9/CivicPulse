import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/useTranslation.js';
import { useAuth } from '@/contexts/useAuth.js';
import StatusBadge from '@/components/StatusBadge.jsx';
import StatusTimeline from '@/components/StatusTimelineLocalized.jsx';
import StatusProgress from '@/components/StatusProgress.jsx';
import IssueEngagement from '@/components/IssueEngagement.jsx';
import BeforeAfterPhotos from '@/components/BeforeAfterPhotos.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { MapPin, ArrowLeft, ThumbsUp, ThumbsDown, ExternalLink, User, ShieldCheck, Star } from 'lucide-react';
import { adminVerifyIssue, escalateIssue, fetchIssueById, updateIssuePriority, uploadResolvedIssuePhoto, verifyIssue, submitIssueFeedback } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';
import { cn } from '@/lib/utils.js';

const IssueDetail = () => {
    const { id } = useParams();
    const { t, language } = useTranslation();
    const { user, isAdmin } = useAuth();
    const [verified, setVerified] = useState(null);
    const [issue, setIssue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [adminVerifying, setAdminVerifying] = useState(false);
    const [updatingPriority, setUpdatingPriority] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const [submittingFeedback, setSubmittingFeedback] = useState(false);

    const [ratingDraft, setRatingDraft] = useState(0);
    const [feedbackComment, setFeedbackComment] = useState('');

    const [priorityDraft, setPriorityDraft] = useState('p3');
    const [priorityNote, setPriorityNote] = useState('');
    const [escalationLevel, setEscalationLevel] = useState('senior-staff');
    const [escalationReason, setEscalationReason] = useState('');
    const [escalationNote, setEscalationNote] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadIssue = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetchIssueById(id);
                if (isMounted) {
                    setIssue(response.issue);
                    setPriorityDraft(response.issue?.priority || 'p3');
                    setEscalationLevel(response.issue?.escalationLevel || 'senior-staff');
                }
            } catch (loadError) {
                if (isMounted) {
                    setError(loadError.message);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadIssue();

        return () => {
            isMounted = false;
        };
    }, [id]);

    const handleVerification = async (value) => {
        setVerified(value);
        setError('');

        try {
            const response = await verifyIssue(id, value);
            setIssue(response.issue);
        } catch (verificationError) {
            setError(verificationError.message);
        }
    };

    const handleFeedbackSubmit = async () => {
        if (ratingDraft === 0) return;
        setSubmittingFeedback(true);
        setError('');

        try {
            const response = await submitIssueFeedback(id, {
                rating: ratingDraft,
                comment: feedbackComment,
            });
            setIssue(response.issue);
        } catch (fError) {
            setError(fError.message);
        } finally {
            setSubmittingFeedback(false);
        }
    };

    const handlePriorityUpdate = async () => {
        if (!issue) {
            return;
        }

        setUpdatingPriority(true);
        setError('');

        try {
            const response = await updateIssuePriority(issue.id, {
                priority: priorityDraft,
                note: priorityNote.trim() || undefined,
            });
            setIssue(response.issue);
            setPriorityNote('');
        } catch (priorityError) {
            setError(priorityError.message);
        } finally {
            setUpdatingPriority(false);
        }
    };

    const handleEscalation = async () => {
        if (!issue) {
            return;
        }
        if (escalationReason.trim().length < 4) {
            setError('Escalation reason must be at least 4 characters.');
            return;
        }

        setEscalating(true);
        setError('');

        try {
            const response = await escalateIssue(issue.id, {
                toLevel: escalationLevel,
                reason: escalationReason.trim(),
                note: escalationNote.trim() || undefined,
                priorityOverride: priorityDraft,
            });
            setIssue(response.issue);
            setEscalationReason('');
            setEscalationNote('');
        } catch (escalationError) {
            setError(escalationError.message);
        } finally {
            setEscalating(false);
        }
    };

    const handleAdminVerification = async () => {
        if (!issue) {
            return;
        }

        setAdminVerifying(true);
        setError('');

        try {
            const response = await adminVerifyIssue(issue.id);
            setIssue(response.issue);
        } catch (adminVerificationError) {
            setError(adminVerificationError.message);
        } finally {
            setAdminVerifying(false);
        }
    };

    const handleResolvedPhotoUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file || !issue) {
            return;
        }

        setUploadingPhoto(true);
        setError('');

        try {
            const response = await uploadResolvedIssuePhoto(issue.id, file);
            setIssue(response.issue);
        } catch (uploadError) {
            setError(uploadError.message);
        } finally {
            setUploadingPhoto(false);
            event.target.value = '';
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
        );
    }

    if (error && !issue) {
        return (
            <div className="mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="text-destructive">{error}</p>
                <Link to="/issues"><Button variant="outline" className="mt-4">{t('issue.backToIssues')}</Button></Link>
            </div>
        );
    }

    if (!issue) {
        return (
            <div className="mx-auto max-w-2xl px-4 py-16 text-center">
                <p className="text-muted-foreground">{t('issue.notFound')}</p>
                <Link to="/issues"><Button variant="outline" className="mt-4">{t('issue.backToIssues')}</Button></Link>
            </div>
        );
    }

    const title = language === 'mr' ? issue.titleMr : issue.title;
    const desc = language === 'mr' ? issue.descriptionMr : issue.description;
    const ward = language === 'mr' ? issue.wardNameMr : issue.wardName;
    const hasCoordinates = Number.isFinite(issue.lat) && Number.isFinite(issue.lng);
    const mapEmbedUrl = hasCoordinates
        ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${issue.lat},${issue.lng}`
        : null;
    const mapsOpenUrl = hasCoordinates
        ? `https://www.openstreetmap.org/?mlat=${issue.lat}&mlon=${issue.lng}#map=17/${issue.lat}/${issue.lng}`
        : null;

    return (
        <div className="mx-auto max-w-3xl px-4 py-8">
            <Link to="/issues">
                <Button variant="ghost" size="sm" className="mb-4 gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    {t('report.back')}
                </Button>
            </Link>

            <div className="grid gap-6">
                <div className="overflow-hidden rounded-xl">
                    <img src={issue.imageUrl} alt={title} className="h-52 w-full object-cover sm:h-64" />
                </div>

                <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={issue.status} />
                        <Badge variant="outline">{getCategoryLabel(issue.category, t)}</Badge>
                        <Badge variant="secondary">Priority: {(issue.priority || 'p3').toUpperCase()}</Badge>
                        {issue.adminVerified ? (
                            <Badge variant="secondary" className="gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Admin Verified
                            </Badge>
                        ) : null}
                        <span className="font-mono text-xs text-muted-foreground">{issue.id}</span>
                    </div>
                    <h1 className="mb-2 text-2xl font-bold">{title}</h1>
                    <p className="text-sm text-muted-foreground sm:text-base">{desc}</p>
                    {issue.locationDescription ? <p className="mt-2 text-sm text-muted-foreground">{issue.locationDescription}</p> : null}
                    <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {ward}
                    </div>
                    {issue.reporterName && !issue.anonymous && (
                        <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            Reported by {issue.reporterName}
                        </div>
                    )}
                    {issue.anonymous && (
                        <div className="mt-2">
                            <Badge variant="outline">Anonymous Report</Badge>
                        </div>
                    )}
                </div>

                <IssueEngagement 
                    issueId={issue.id} 
                    showVerified={true} 
                    isVerified={issue.adminVerified || false}
                />

                {isAdmin ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Admin Review</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    onClick={handleAdminVerification}
                                    disabled={adminVerifying || issue.adminVerified || !['resolved', 'verified', 'closed'].includes(issue.status)}
                                >
                                    {issue.adminVerified ? 'Already Verified' : adminVerifying ? 'Verifying...' : 'Mark as Verified'}
                                </Button>
                                <div className="w-full sm:w-auto">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleResolvedPhotoUpload}
                                        disabled={uploadingPhoto}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                <Select value={priorityDraft} onValueChange={setPriorityDraft}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="p1">P1</SelectItem>
                                        <SelectItem value="p2">P2</SelectItem>
                                        <SelectItem value="p3">P3</SelectItem>
                                        <SelectItem value="p4">P4</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={priorityNote}
                                    onChange={(event) => setPriorityNote(event.target.value)}
                                    placeholder="Priority update note"
                                />
                                <Button onClick={handlePriorityUpdate} disabled={updatingPriority}>
                                    {updatingPriority ? 'Updating Priority...' : 'Update Priority'}
                                </Button>
                            </div>
                            <div className="space-y-2 rounded-lg border p-3">
                                <p className="text-sm font-medium">Manual Escalation</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Select value={escalationLevel} onValueChange={setEscalationLevel}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Escalate to" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="senior-staff">Senior Staff</SelectItem>
                                            <SelectItem value="department-head">Department Head</SelectItem>
                                            <SelectItem value="commissioner">Commissioner</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={escalationReason}
                                        onChange={(event) => setEscalationReason(event.target.value)}
                                        placeholder="Reason (required)"
                                    />
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Input
                                        value={escalationNote}
                                        onChange={(event) => setEscalationNote(event.target.value)}
                                        placeholder="Escalation note (optional)"
                                    />
                                    <Button onClick={handleEscalation} disabled={escalating}>
                                        {escalating ? 'Escalating...' : 'Escalate Issue'}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Upload a resolution photo for before/after proof and mark resolved issues as admin-verified.
                            </p>
                        </CardContent>
                    </Card>
                ) : null}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Status Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusProgress currentStatus={issue.status} estimatedDays={issue.estimatedResolutionDays} />
                    </CardContent>
                </Card>

                {issue.resolvedImageUrl && (
                    <BeforeAfterPhotos 
                        beforeImage={issue.imageUrl} 
                        afterImage={issue.resolvedImageUrl}
                        title="Resolution Proof"
                    />
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{t('issue.statusTimeline')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusTimeline timeline={issue.timeline} />
                    </CardContent>
                </Card>

                {Array.isArray(issue.escalationHistory) && issue.escalationHistory.length > 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Escalation History</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {issue.escalationHistory.map((entry, index) => (
                                <div key={`${entry.timestamp}-${index}`} className="rounded-md border p-3 text-sm">
                                    <p className="font-medium">{entry.fromLevel}{' -> '}{entry.toLevel}</p>
                                    <p className="text-muted-foreground">Reason: {entry.reason}</p>
                                    {entry.note ? <p className="text-muted-foreground">Note: {entry.note}</p> : null}
                                    <p className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ) : null}

                {hasCoordinates ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Location Map</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="overflow-hidden rounded-lg border">
                                <iframe
                                    title="Issue location map"
                                    src={mapEmbedUrl}
                                    className="h-[240px] w-full sm:h-[300px] lg:h-[360px]"
                                    loading="lazy"
                                />
                            </div>
                            <Button asChild variant="outline" className="w-full gap-2 sm:w-auto">
                                <a href={mapsOpenUrl} target="_blank" rel="noreferrer">
                                    Open in Map
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                {issue.citizenFeedback ? (
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                                Citizen Feedback
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-1 mb-2">
                                {[1, 2, 3, 4, 5].map(s => (
                                    <Star key={s} className={cn("h-4 w-4", s <= issue.citizenFeedback.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
                                ))}
                            </div>
                            <p className="text-sm italic">"{issue.citizenFeedback.comment || 'No comment provided'}"</p>
                            <p className="text-[10px] text-muted-foreground mt-2 uppercase">Submitted on {new Date(issue.citizenFeedback.submittedAt).toLocaleDateString()}</p>
                        </CardContent>
                    </Card>
                ) : null}

                {issue.status === 'resolved' ? (
                    <Card>
                        <CardContent className="p-6 space-y-6">
                            {verified === null ? (
                                <div className="space-y-4 text-center">
                                    <p className="font-semibold">{t('verify.prompt')}</p>
                                    {issue.resolvedImageUrl ? <img src={issue.resolvedImageUrl} alt={t('issue.resolutionProof')} className="mx-auto h-40 rounded-lg object-cover" /> : null}
                                    <div className="flex flex-col justify-center gap-3 sm:flex-row">
                                        <Button onClick={() => handleVerification(true)} className="h-11 gap-2 bg-secondary hover:bg-secondary/90">
                                            <ThumbsUp className="h-4 w-4" />
                                            {t('verify.yes')}
                                        </Button>
                                        <Button variant="destructive" onClick={() => handleVerification(false)} className="h-11 gap-2">
                                            <ThumbsDown className="h-4 w-4" />
                                            {t('verify.no')}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-center font-medium text-secondary">{t('verify.thanks')}</p>
                                    
                                    {!issue.citizenFeedback && (
                                        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                                            <p className="text-sm font-semibold text-center">How satisfied are you with the resolution?</p>
                                            <div className="flex justify-center gap-2">
                                                {[1, 2, 3, 4, 5].map(s => (
                                                    <button 
                                                        key={s} 
                                                        onClick={() => setRatingDraft(s)}
                                                        className="hover:scale-110 transition-transform"
                                                    >
                                                        <Star className={cn("h-8 w-8", s <= ratingDraft ? "text-amber-500 fill-amber-500" : "text-slate-300")} />
                                                    </button>
                                                ))}
                                            </div>
                                            <Input 
                                                placeholder="Any additional feedback? (optional)" 
                                                value={feedbackComment}
                                                onChange={(e) => setFeedbackComment(e.target.value)}
                                            />
                                            <Button 
                                                className="w-full" 
                                                disabled={ratingDraft === 0 || submittingFeedback}
                                                onClick={handleFeedbackSubmit}
                                            >
                                                {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </div>
    );
};

export default IssueDetail;
