import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { fetchWardAnalyticsById } from '@/lib/api.js';
import { getWardScoreTier } from '@/lib/wardMetrics.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import { ArrowLeft, MapPin, Clock, CheckCircle2, AlertTriangle, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const categoryColors = ['#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

const WardProfileLive = () => {
    const { id } = useParams();
    const { t, language } = useTranslation();
    const [ward, setWard] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        fetchWardAnalyticsById(id)
            .then((response) => {
                if (!active) {
                    return;
                }

                setWard(response.ward);
            })
            .catch((loadError) => {
                if (active) {
                    setError(loadError.message);
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [id]);

    if (loading) {
        return <div className="mx-auto max-w-6xl px-4 py-10 text-center text-muted-foreground">{t('common.loading')}</div>;
    }

    if (!ward) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-16 text-center">
                <h1 className="mb-4 text-2xl font-bold">{error || t('ward.notFound')}</h1>
                <Link to="/leaderboard">
                    <Button><ArrowLeft className="mr-2 h-4 w-4" />{t('leaderboard.title')}</Button>
                </Link>
            </div>
        );
    }

    const tier = getWardScoreTier(ward.score);
    const tierLabelMap = {
        'No data': t('tier.noData'),
        Excellent: t('tier.excellent'),
        Good: t('tier.good'),
        Average: t('tier.average'),
        Critical: t('tier.critical'),
    };
    const wardName = language === 'mr' ? ward.nameMr : ward.nameEn;
    const resolutionRateText = ward.resolutionRate == null ? t('common.notAvailable') : `${ward.resolutionRate}%`;
    const verificationRateText = ward.verificationRate == null ? t('common.notAvailable') : `${ward.verificationRate}%`;
    const categoryData = ward.categoryBreakdown.map((entry, index) => ({
        ...entry,
        fill: categoryColors[index % categoryColors.length],
        label: t(`cat.${entry.category}`),
    }));

    return (
        <div className="mx-auto max-w-6xl px-4 py-8">
            <Link to="/leaderboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                {t('leaderboard.title')}
            </Link>

            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">{wardName}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{ward.officeName}</span>
                        <span>{ward.officeAddress}</span>
                    </div>
                </div>
                <div className="text-center">
                    <p className={`text-5xl font-bold ${tier.color}`}>{ward.score ?? t('common.notAvailable')}</p>
                    <p className="mt-1 text-sm">{tier.badge} {tierLabelMap[tier.label] || tier.label}</p>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
                        <p className="text-2xl font-bold">{ward.rank ? `#${ward.rank}` : '-'}</p>
                        <p className="text-xs text-muted-foreground">{t('leaderboard.rank')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <AlertTriangle className="mx-auto mb-1 h-5 w-5 text-warning" />
                        <p className="text-2xl font-bold">{ward.openIssues}</p>
                        <p className="text-xs text-muted-foreground">{t('ward.openIssues')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-secondary" />
                        <p className="text-2xl font-bold">{ward.resolvedIssues}</p>
                        <p className="text-xs text-muted-foreground">{t('ward.resolvedIssues')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <Clock className="mx-auto mb-1 h-5 w-5 text-info" />
                        <p className="text-2xl font-bold">{ward.avgResolutionDays ?? t('common.notAvailable')}</p>
                        <p className="text-xs text-muted-foreground">{t('ward.avgClosureDays')}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="mb-8 grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('ward.monthlyIssuesVsResolutions')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={ward.monthlyTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="complaints" fill="hsl(var(--primary))" name={t('ward.complaints')} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="resolved" fill="hsl(var(--secondary))" name={t('ward.resolved')} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('ward.categoryBreakdown')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={categoryData} dataKey="count" nameKey="label" outerRadius={90} label={({ label, count }) => `${label} (${count})`} labelLine={false}>
                                    {categoryData.map((entry) => <Cell key={entry.category} fill={entry.fill} />)}
                                </Pie>
                                <Tooltip formatter={(value, _name, item) => [value, item?.payload?.label]} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>{t('ward.liveMetrics')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{t('ward.totalIssues')}</p>
                        <p className="text-2xl font-bold">{ward.totalIssues}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{t('ward.resolutionRate')}</p>
                        <p className="text-2xl font-bold">{resolutionRateText}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{t('ward.verificationRate')}</p>
                        <p className="text-2xl font-bold">{verificationRateText}</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('ward.recentIssues')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {ward.recentIssues.length ? ward.recentIssues.map((issue) => (
                        <Link key={issue.id} to={`/issues/${issue.id}`} className="block">
                            <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                                <img src={issue.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                    <p className="text-xs text-muted-foreground">{issue.id}</p>
                                </div>
                                <StatusBadge status={issue.status} />
                            </div>
                        </Link>
                    )) : <p className="text-sm text-muted-foreground">{t('ward.noIssuesYet')}</p>}
                </CardContent>
            </Card>
        </div>
    );
};

export default WardProfileLive;
