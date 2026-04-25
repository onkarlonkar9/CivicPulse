import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import StatusTimeline from '@/components/StatusTimelineLocalized.jsx';
import StatusProgress from '@/components/StatusProgress.jsx';
import IssueEngagement from '@/components/IssueEngagement.jsx';
import BeforeAfterPhotos from '@/components/BeforeAfterPhotos.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { MapPin, ArrowLeft, ThumbsUp, ThumbsDown, ExternalLink, User, ShieldCheck } from 'lucide-react';
import { adminVerifyIssue, fetchIssueById, uploadResolvedIssuePhoto, verifyIssue } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';

const IssueDetail = () => {
    const { id } = useParams();
    const { t, language } = useTranslation();
    const { isAdmin } = useAuth();
    const [verified, setVerified] = useState(null);
    const [issue, setIssue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [adminVerifying, setAdminVerifying] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadIssue = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetchIssueById(id);
                if (isMounted) {
                    setIssue(response.issue);
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

                {issue.status === 'resolved' ? (
                    <Card>
                        <CardContent className="p-6">
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
                                <p className="text-center font-medium text-secondary">{t('verify.thanks')}</p>
                            )}
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </div>
    );
};

export default IssueDetail;
