import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { FileWarning, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createAdminInvite, fetchAdminInvites, fetchAdminStats, fetchIssues, fetchMeta, updateIssueStatus } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';

const allStatuses = ['new', 'ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated'];

const AdminDashboard = () => {
    const { t, language } = useTranslation();
    const { isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
    const [issues, setIssues] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, escalated: 0 });
    const [invites, setInvites] = useState([]);
    const [categories, setCategories] = useState([]);
    const [wards, setWards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [wardFilter, setWardFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [pendingStatuses, setPendingStatuses] = useState({});
    const [remarksByIssue, setRemarksByIssue] = useState({});
    const [updatingIssueId, setUpdatingIssueId] = useState('');

    useEffect(() => {
        let isMounted = true;

        const loadDashboard = async () => {
            setLoading(true);
            setError('');

            try {
                const [issuesResponse, statsResponse, metaResponse] = await Promise.all([
                    fetchIssues(),
                    fetchAdminStats(),
                    fetchMeta(),
                ]);

                if (isMounted) {
                    setIssues(issuesResponse.issues || []);
                    setStats(statsResponse.stats || { total: 0, pending: 0, resolved: 0, escalated: 0 });
                    setCategories(metaResponse.categories || []);
                    setWards(metaResponse.wards || []);
                }

                if (isMounted && isSuperAdmin) {
                    const inviteResponse = await fetchAdminInvites();
                    setInvites(inviteResponse.invites || []);
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

        loadDashboard();

        return () => {
            isMounted = false;
        };
    }, [isSuperAdmin]);

    const updateStatus = async (issueId) => {
        const issue = issues.find((entry) => entry.id === issueId);

        if (!issue) {
            return;
        }

        const newStatus = pendingStatuses[issueId] || issue.status;
        const remarks = remarksByIssue[issueId]?.trim() || '';

        try {
            setUpdatingIssueId(issueId);
            const payload = { status: newStatus };

            if (remarks) {
                payload.note = remarks;
            }

            const response = await updateIssueStatus(issueId, payload);
            const updatedIssue = response.issue;
            const nextIssues = issues.map((entry) => (entry.id === issueId ? updatedIssue : entry));

            setIssues(nextIssues);
            setPendingStatuses((current) => {
                const next = { ...current };
                delete next[issueId];
                return next;
            });
            setRemarksByIssue((current) => {
                const next = { ...current };
                delete next[issueId];
                return next;
            });
            setStats({
                total: nextIssues.length,
                pending: nextIssues.filter((entry) => ['new', 'ack'].includes(entry.status)).length,
                resolved: nextIssues.filter((entry) => entry.status === 'resolved').length,
                escalated: nextIssues.filter((entry) => entry.status === 'escalated').length,
            });
        } catch (updateError) {
            setError(updateError.message);
        } finally {
            setUpdatingIssueId('');
        }
    };

    const cards = [
        { label: t('admin.totalToday'), value: stats.total, icon: FileWarning, color: 'text-primary' },
        { label: t('admin.pending'), value: stats.pending, icon: Clock, color: 'text-warning' },
        { label: t('admin.resolvedToday'), value: stats.resolved, icon: CheckCircle2, color: 'text-secondary' },
        { label: t('admin.escalated'), value: stats.escalated, icon: AlertTriangle, color: 'text-destructive' },
    ];

    const handleCreateInvite = async () => {
        try {
            const response = await createAdminInvite();
            setInvites((current) => [response.invite, ...current]);
        } catch (inviteError) {
            setError(inviteError.message);
        }
    };

    const filteredIssues = useMemo(() => {
        const query = search.trim().toLowerCase();

        return issues.filter((issue) => {
            if (statusFilter !== 'all' && issue.status !== statusFilter) {
                return false;
            }

            if (categoryFilter !== 'all' && issue.category !== categoryFilter) {
                return false;
            }

            if (wardFilter !== 'all' && String(issue.wardId) !== wardFilter) {
                return false;
            }

            if (!query) {
                return true;
            }

            const title = language === 'mr' ? issue.titleMr : issue.title;
            const wardName = language === 'mr' ? issue.wardNameMr : issue.wardName;

            return [issue.id, title, wardName, issue.category]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query));
        });
    }, [categoryFilter, issues, language, search, statusFilter, wardFilter]);

    const getPendingStatus = (issue) => pendingStatuses[issue.id] || issue.status;
    const categoryFilterOptions = useMemo(() => {
        const base = new Map((categories || []).map((entry) => [entry.id, entry]));

        for (const issue of issues) {
            if (!base.has(issue.category)) {
                base.set(issue.category, { id: issue.category, translationKey: `cat.${issue.category}` });
            }
        }

        return [...base.values()];
    }, [categories, issues]);

    if (!isAuthenticated) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-12">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('admin.signInPrompt')}</p>
                        <Button asChild>
                            <a href="/admin/login">{t('admin.goToLogin')}</a>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-12">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
                        <p className="text-sm text-destructive">{t('admin.adminOnly')}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
                <Button asChild variant="outline">
                    <Link to="/admin/ward-master">Ward Master</Link>
                </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{t('admin.solveHelp')}</p>

            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

            {isSuperAdmin ? (
                <Card className="mb-6">
                    <CardContent className="space-y-4 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-semibold">{t('admin.inviteManagement')}</h2>
                                <p className="text-sm text-muted-foreground">{t('admin.inviteHelp')}</p>
                            </div>
                            <Button onClick={handleCreateInvite}>{t('admin.generateInvite')}</Button>
                        </div>

                        {invites.length ? (
                            <div className="space-y-2">
                                {invites.map((invite) => (
                                    <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                                        <div>
                                            <p className="font-mono font-medium">{invite.code}</p>
                                            <p className="text-xs text-muted-foreground">{t('admin.expires')}: {new Date(invite.expiresAt).toLocaleString()}</p>
                                        </div>
                                        <Badge variant="outline">{t('admin.inviteBadge')}</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t('admin.noInvites')}</p>
                        )}
                    </CardContent>
                </Card>
            ) : null}

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                {cards.map((card) => (
                    <Card key={card.label}>
                        <CardContent className="p-4 text-center">
                            <card.icon className={`mx-auto mb-1 h-6 w-6 ${card.color}`} />
                            <p className="text-2xl font-bold">{card.value}</p>
                            <p className="text-sm text-muted-foreground">{card.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="mb-6">
                <CardContent className="p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by ID, issue, ward"
                            className="h-11"
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-11">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {allStatuses.map((status) => (
                                    <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="h-11">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categoryFilterOptions.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>{getCategoryLabel(category.id, t, categories)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={wardFilter} onValueChange={setWardFilter}>
                            <SelectTrigger className="h-11">
                                <SelectValue placeholder="Ward" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Wards</SelectItem>
                                {wards.map((ward) => (
                                    <SelectItem key={ward.id} value={String(ward.id)}>{language === 'mr' ? ward.nameMr : ward.nameEn}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    {loading ? <p className="p-6 text-center text-muted-foreground">{t('common.loading')}</p> : null}

                    {!loading ? (
                        <>
                            <div className="space-y-3 p-4 md:hidden">
                                {filteredIssues.length === 0 ? <p className="py-8 text-center text-muted-foreground">No issues match current filters</p> : null}
                                {filteredIssues.map((issue) => (
                                    <div key={issue.id} className="space-y-3 rounded-lg border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-mono text-xs">{issue.id}</p>
                                            <StatusBadge status={issue.status} />
                                        </div>
                                        <p className="font-medium">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Badge variant="outline">{getCategoryLabel(issue.category, t, categories)}</Badge>
                                            <span>{language === 'mr' ? issue.wardNameMr : issue.wardName}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <Select
                                                value={getPendingStatus(issue)}
                                                onValueChange={(value) => setPendingStatuses((current) => ({ ...current, [issue.id]: value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {allStatuses.map((status) => (
                                                        <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Textarea
                                                value={remarksByIssue[issue.id] || ''}
                                                onChange={(event) => setRemarksByIssue((current) => ({ ...current, [issue.id]: event.target.value }))}
                                                placeholder="Remarks description (optional)"
                                                rows={2}
                                            />
                                            <Button
                                                onClick={() => updateStatus(issue.id)}
                                                disabled={updatingIssueId === issue.id}
                                            >
                                                {updatingIssueId === issue.id ? 'Updating...' : 'Update'}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('admin.id')}</TableHead>
                                            <TableHead>{t('admin.issue')}</TableHead>
                                            <TableHead>{t('admin.category')}</TableHead>
                                            <TableHead>{t('admin.ward')}</TableHead>
                                            <TableHead>{t('admin.status')}</TableHead>
                                            <TableHead>{t('admin.updateStatus')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredIssues.map((issue) => (
                                            <TableRow key={issue.id}>
                                                <TableCell className="font-mono text-xs">{issue.id}</TableCell>
                                                <TableCell className="max-w-[220px] truncate font-medium">
                                                    {language === 'mr' ? issue.titleMr : issue.title}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{getCategoryLabel(issue.category, t, categories)}</Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {language === 'mr' ? issue.wardNameMr : issue.wardName}
                                                </TableCell>
                                                <TableCell>
                                                    <StatusBadge status={issue.status} />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Select
                                                            value={getPendingStatus(issue)}
                                                            onValueChange={(value) => setPendingStatuses((current) => ({ ...current, [issue.id]: value }))}
                                                        >
                                                            <SelectTrigger className="w-[150px]">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {allStatuses.map((status) => (
                                                                    <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Input
                                                            value={remarksByIssue[issue.id] || ''}
                                                            onChange={(event) => setRemarksByIssue((current) => ({ ...current, [issue.id]: event.target.value }))}
                                                            placeholder="Remarks description (optional)"
                                                            className="w-[220px]"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() => updateStatus(issue.id)}
                                                            disabled={updatingIssueId === issue.id}
                                                        >
                                                            {updatingIssueId === issue.id ? 'Updating...' : 'Update'}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {filteredIssues.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No issues match current filters</TableCell>
                                            </TableRow>
                                        ) : null}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminDashboard;
