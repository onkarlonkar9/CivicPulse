import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Trophy, Activity, Clock3, Map, List, Search, Medal, TrendingUp, Award } from 'lucide-react';
import { Input } from '@/components/ui/input.jsx';
import WardHeatmap from '@/components/WardHeatmap.jsx';
import { useWardAnalytics } from '@/hooks/useWardAnalytics.js';
import { getWardScoreTier } from '@/lib/wardMetrics.js';
import { cn } from '@/lib/utils.js';
import { fetchTopVotedIssues } from '@/lib/api.js';

const LeaderboardLive = () => {
    const { t, language } = useTranslation();
    const { wards, loading, error } = useWardAnalytics();
    const [viewMode, setViewMode] = useState('table');
    const [search, setSearch] = useState('');
    const [topVotedIssues, setTopVotedIssues] = useState([]);

    useEffect(() => {
        fetchTopVotedIssues()
            .then((response) => setTopVotedIssues(response.issues || []))
            .catch(() => setTopVotedIssues([]));
    }, []);
    const getTierLabel = (label) => {
        const key = label?.toLowerCase().replace(/\s+/g, '');
        const map = {
            nodata: 'tier.noData',
            excellent: 'tier.excellent',
            good: 'tier.good',
            average: 'tier.average',
            critical: 'tier.critical',
        };

        return map[key] ? t(map[key]) : label;
    };

    const sorted = useMemo(
        () => [...wards]
            .filter((w) => {
                if (!search.trim()) return true;
                const q = search.toLowerCase();
                return (w.nameEn || '').toLowerCase().includes(q) || (w.nameMr || '').includes(search.trim());
            })
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.resolutionRate ?? -1) - (a.resolutionRate ?? -1)),
        [wards, search]
    );

    const topWard = sorted.find((ward) => ward.score != null) || null;
    const highestResolutionWard = [...sorted].sort((a, b) => (b.resolutionRate ?? -1) - (a.resolutionRate ?? -1))[0] || null;
    const fastestWard = [...sorted].sort((a, b) => (a.avgResolutionDays ?? Infinity) - (b.avgResolutionDays ?? Infinity))[0] || null;

    const resolutionRateText = highestResolutionWard?.resolutionRate == null ? t('common.notAvailable') : `${highestResolutionWard.resolutionRate}%`;
    const fastestClosureText = fastestWard?.avgResolutionDays == null ? t('common.notAvailable') : `${fastestWard.avgResolutionDays} ${t('landing.days')}`;

    return (
        <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">{t('leaderboard.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('leaderboard.realDataNote')}</p>
            </div>

            {/* Top 3 Wards - Mobile Optimized */}
            <div className="mb-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    {t('leaderboard.monthlyAwards')}
                </h2>
                <div className="grid gap-3 md:grid-cols-3">
                    {/* Top Ward Score */}
                    <Card className="border-2 border-yellow-400 bg-gradient-to-br from-yellow-50 via-white to-yellow-50 dark:from-yellow-950/20 dark:via-background dark:to-yellow-950/20 shadow-lg">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-md">
                                    <Trophy className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">{t('leaderboard.topWardScore')}</p>
                                    <p className="text-sm font-bold truncate">{language === 'mr' ? topWard?.nameMr : topWard?.nameEn || t('common.noDataYet')}</p>
                                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">{topWard?.score ?? t('common.notAvailable')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Best Resolution Rate */}
                    <Card className="border-2 border-green-400 bg-gradient-to-br from-green-50 via-white to-green-50 dark:from-green-950/20 dark:via-background dark:to-green-950/20">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-md">
                                    <Activity className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">{t('leaderboard.bestResolutionRate')}</p>
                                    <p className="text-sm font-bold truncate">{language === 'mr' ? highestResolutionWard?.nameMr : highestResolutionWard?.nameEn || t('common.noDataYet')}</p>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-500">{resolutionRateText}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Fastest Closure */}
                    <Card className="border-2 border-blue-400 bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-blue-950/20 dark:via-background dark:to-blue-950/20">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-md">
                                    <Clock3 className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground mb-1">{t('leaderboard.fastestAverageClosure')}</p>
                                    <p className="text-sm font-bold truncate">{language === 'mr' ? fastestWard?.nameMr : fastestWard?.nameEn || t('common.noDataYet')}</p>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-500">{fastestClosureText}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="mb-6 border-primary/20">
                <CardContent className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <h2 className="text-lg font-semibold">Top Citizen Priorities (Me Too Votes)</h2>
                    </div>
                    {topVotedIssues.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No votes yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {topVotedIssues.slice(0, 5).map((issue, index) => (
                                <Link key={issue.id} to={`/issues/${issue.id}`} className="block rounded-lg border p-3 hover:bg-muted/40">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">#{index + 1} {issue.id}</p>
                                        <Badge>{issue.voteCount || 0} votes</Badge>
                                    </div>
                                    <p className="text-sm line-clamp-1">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Search and View Toggle */}
            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder={language === 'mr' ? 'प्रभाग शोधा...' : 'Search wards...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 h-12 text-base"
                    />
                </div>

                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground flex-1">
                        {sorted.length} {language === 'mr' ? 'वॉर्ड' : 'wards'}
                    </p>
                    <div className="flex gap-2 rounded-lg border-2 p-1 bg-muted/30">
                        <Button 
                            variant={viewMode === 'table' ? 'default' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('table')} 
                            className="gap-1.5 h-9"
                        >
                            <List className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('leaderboard.table')}</span>
                        </Button>
                        <Button 
                            variant={viewMode === 'map' ? 'default' : 'ghost'} 
                            size="sm" 
                            onClick={() => setViewMode('map')} 
                            className="gap-1.5 h-9"
                        >
                            <Map className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('leaderboard.map')}</span>
                        </Button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-16 text-center">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    <p className="text-muted-foreground">{t('common.loading')}</p>
                </div>
            ) : null}

            {error ? (
                <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="p-6 text-center">
                        <p className="text-sm text-destructive">{error}</p>
                    </CardContent>
                </Card>
            ) : null}

            {!loading && viewMode === 'map' ? (
                <Card>
                    <CardContent className="p-4">
                        <WardHeatmap wards={wards} />
                    </CardContent>
                </Card>
            ) : null}

            {!loading && viewMode === 'table' ? (
                <div className="space-y-3">
                    {/* Mobile Card View */}
                    <div className="block md:hidden space-y-3">
                        {sorted.map((ward, index) => {
                            const tier = getWardScoreTier(ward.score);
                            const isTopThree = index < 3;

                            return (
                                <Link key={ward.id} to={`/ward/${ward.id}`}>
                                    <Card className={cn(
                                        "transition-all hover:shadow-lg active:scale-[0.98]",
                                        isTopThree && "border-2",
                                        index === 0 && "border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/10",
                                        index === 1 && "border-gray-400 bg-gray-50/50 dark:bg-gray-950/10",
                                        index === 2 && "border-orange-400 bg-orange-50/50 dark:bg-orange-950/10"
                                    )}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                {/* Rank Badge */}
                                                <div className={cn(
                                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-lg shadow-md",
                                                    index === 0 && "bg-gradient-to-br from-yellow-400 to-yellow-600 text-white",
                                                    index === 1 && "bg-gradient-to-br from-gray-400 to-gray-600 text-white",
                                                    index === 2 && "bg-gradient-to-br from-orange-400 to-orange-600 text-white",
                                                    index > 2 && "bg-muted text-muted-foreground"
                                                )}>
                                                    {isTopThree ? (
                                                        <Medal className="h-5 w-5" />
                                                    ) : (
                                                        `#${ward.rank || index + 1}`
                                                    )}
                                                </div>

                                                {/* Ward Info */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-base mb-1 truncate">
                                                        {language === 'mr' ? ward.nameMr : ward.nameEn}
                                                    </h3>
                                                    
                                                    {/* Stats Grid */}
                                                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                                        <div>
                                                            <span className="text-muted-foreground">Open: </span>
                                                            <span className="font-semibold">{ward.openIssues}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground">Resolved: </span>
                                                            <span className="font-semibold text-green-600">{ward.resolvedIssues}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground">Rate: </span>
                                                            <span className="font-semibold">{ward.resolutionRate == null ? 'N/A' : `${ward.resolutionRate}%`}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-muted-foreground">Score: </span>
                                                            <span className="font-bold text-primary text-base">{ward.score ?? 'N/A'}</span>
                                                        </div>
                                                    </div>

                                                    {/* Tier Badge */}
                                                    <div className="flex items-center gap-1">
                                                        <span className={cn("text-xs font-medium px-2 py-1 rounded-full", tier.color)}>
                                                            {tier.badge} {getTierLabel(tier.label)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Desktop Table View */}
                    <Card className="hidden md:block">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-16">{t('leaderboard.rank')}</TableHead>
                                            <TableHead>{t('leaderboard.ward')}</TableHead>
                                            <TableHead>{t('leaderboard.open')}</TableHead>
                                            <TableHead>{t('leaderboard.resolvedIssues')}</TableHead>
                                            <TableHead className="text-center">{t('leaderboard.resolutionRate')}</TableHead>
                                            <TableHead className="text-center">{t('leaderboard.score')}</TableHead>
                                            <TableHead className="text-center">{t('leaderboard.tier')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sorted.map((ward, index) => {
                                            const tier = getWardScoreTier(ward.score);
                                            const isTopThree = index < 3;

                                            return (
                                                <TableRow key={ward.id} className={cn(
                                                    isTopThree && "bg-muted/30"
                                                )}>
                                                    <TableCell className="font-bold">
                                                        {isTopThree ? (
                                                            <div className={cn(
                                                                "inline-flex h-8 w-8 items-center justify-center rounded-full",
                                                                index === 0 && "bg-yellow-400 text-white",
                                                                index === 1 && "bg-gray-400 text-white",
                                                                index === 2 && "bg-orange-400 text-white"
                                                            )}>
                                                                <Medal className="h-4 w-4" />
                                                            </div>
                                                        ) : (
                                                            `#${ward.rank || index + 1}`
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-medium">
                                                        <Link to={`/ward/${ward.id}`} className="transition-colors hover:text-primary hover:underline">
                                                            {language === 'mr' ? ward.nameMr : ward.nameEn}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>{ward.openIssues}</TableCell>
                                                    <TableCell className="text-green-600 font-semibold">{ward.resolvedIssues}</TableCell>
                                                    <TableCell className="text-center">{ward.resolutionRate == null ? t('common.notAvailable') : `${ward.resolutionRate}%`}</TableCell>
                                                    <TableCell className="text-center text-lg font-bold text-primary">{ward.score ?? t('common.notAvailable')}</TableCell>
                                                    <TableCell className={`text-center ${tier.color}`}>{tier.badge} {getTierLabel(tier.label)}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
};

export default LeaderboardLive;
