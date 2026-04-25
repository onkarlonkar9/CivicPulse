import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, ListChecks, Users } from 'lucide-react';
import { fetchAdminStats, fetchIssues, fetchMeta, updateIssueStatus } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';

const allStatuses = ['new', 'ack', 'inprog', 'resolved', 'verified', 'closed', 'reopened', 'escalated'];
const queueTabs = ['all', 'new', 'ack', 'inprog', 'resolved', 'escalated'];

export default function AdminDashboard() {
    const { t, language } = useTranslation();
    const { user, isAuthenticated, isAdmin, isSuperAdmin } = useAuth();
    const [issues, setIssues] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, escalated: 0 });
    const [categories, setCategories] = useState([]);
    const [wards, setWards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [wardFilter, setWardFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [pendingStatuses, setPendingStatuses] = useState({});
    const [remarksByIssue, setRemarksByIssue] = useState({});
    const [updatingIssueId, setUpdatingIssueId] = useState('');

    useEffect(() => {
        let active = true;

        const loadWorkspace = async () => {
            setLoading(true);
            setError('');

            try {
                const [issuesResponse, statsResponse, metaResponse] = await Promise.all([
                    fetchIssues(),
                    fetchAdminStats(),
                    fetchMeta(),
                ]);

                if (!active) {
                    return;
                }

                setIssues(issuesResponse.issues || []);
                setStats(statsResponse.stats || { total: 0, pending: 0, resolved: 0, escalated: 0 });
                setCategories(metaResponse.categories || []);
                setWards(metaResponse.wards || []);
            } catch (loadError) {
                if (active) {
                    setError(loadError.message);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadWorkspace();

        return () => {
            active = false;
        };
    }, []);

    const categoryFilterOptions = useMemo(() => {
        const base = new Map((categories || []).map((entry) => [entry.id, entry]));
        for (const issue of issues) {
            if (!base.has(issue.category)) {
                base.set(issue.category, { id: issue.category, translationKey: `cat.${issue.category}` });
            }
        }
        return [...base.values()];
    }, [categories, issues]);

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
            return [issue.id, title, wardName, issue.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
        });
    }, [categoryFilter, issues, language, search, statusFilter, wardFilter]);

    const getPendingStatus = (issue) => pendingStatuses[issue.id] || issue.status;

    const updateStatus = async (issueId) => {
        const issue = issues.find((entry) => entry.id === issueId);
        if (!issue) {
            return;
        }

        const newStatus = pendingStatuses[issueId] || issue.status;
        const remarks = remarksByIssue[issueId]?.trim() || '';
        const hasStatusChange = newStatus !== issue.status;
        const hasNoteChange = remarks.length > 0;

        if (!hasStatusChange && !hasNoteChange) {
            setMessage('No changes to apply. Select a new status or add a note.');
            return;
        }

        try {
            setError('');
            setMessage('');
            setUpdatingIssueId(issueId);
            const payload = { status: newStatus };
            if (remarks) {
                payload.note = remarks;
            }

            const response = await updateIssueStatus(issueId, payload);
            if (!response?.issue) {
                throw new Error('Issue update failed: missing updated issue in response');
            }
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
            setMessage(`Updated ${issueId} to ${newStatus}.`);
        } catch (updateError) {
            setError(updateError.message);
        } finally {
            setUpdatingIssueId('');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-12">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Employee Workspace</h1>
                        <p className="text-sm text-muted-foreground">Sign in to review, acknowledge, and resolve ward issues.</p>
                        <Button asChild><Link to="/employee/login">Go to employee login</Link></Button>
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
                        <h1 className="text-2xl font-bold">Employee Workspace</h1>
                        <p className="text-sm text-destructive">Staff access required.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 md:space-y-6 md:px-4 md:py-8">
            <section className="rounded-2xl border bg-gradient-to-r from-slate-100 via-white to-cyan-50 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Operations Console</p>
                        <h1 className="text-xl font-bold md:text-2xl">Employee Workspace</h1>
                        <p className="text-sm text-muted-foreground">Handle acknowledgements and resolution workflows by ward assignment.</p>
                    </div>
                    <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
                        {isSuperAdmin ? <Button asChild variant="outline" className="w-full sm:w-auto"><Link to="/employee/master"><Users className="mr-1 h-4 w-4" />Employee Master</Link></Button> : null}
                        {['admin', 'super-admin'].includes(user?.role) ? <Button asChild variant="outline" className="w-full sm:w-auto"><Link to="/employee/ward-master">Ward Master</Link></Button> : null}
                    </div>
                </div>
            </section>

            {error ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {message ? <p className="rounded-lg border border-emerald-300/40 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card><CardContent className="p-4"><FileWarning className="mb-2 h-5 w-5 text-primary" /><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">{t('admin.totalToday')}</p></CardContent></Card>
                <Card><CardContent className="p-4"><Clock className="mb-2 h-5 w-5 text-amber-600" /><p className="text-2xl font-bold">{stats.pending}</p><p className="text-xs text-muted-foreground">{t('admin.pending')}</p></CardContent></Card>
                <Card><CardContent className="p-4"><CheckCircle2 className="mb-2 h-5 w-5 text-emerald-600" /><p className="text-2xl font-bold">{stats.resolved}</p><p className="text-xs text-muted-foreground">{t('admin.resolvedToday')}</p></CardContent></Card>
                <Card><CardContent className="p-4"><AlertTriangle className="mb-2 h-5 w-5 text-rose-600" /><p className="text-2xl font-bold">{stats.escalated}</p><p className="text-xs text-muted-foreground">{t('admin.escalated')}</p></CardContent></Card>
            </section>

            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">Issue Queue</h2>
                        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
                            <TabsList className="flex w-full overflow-x-auto whitespace-nowrap md:w-auto">
                                {queueTabs.map((tabStatus) => (
                                    <TabsTrigger key={tabStatus} value={tabStatus} className="shrink-0">
                                        {tabStatus === 'all' ? 'All' : t(`status.${tabStatus}`)}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by ticket, ward, or issue" />
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categoryFilterOptions.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>{getCategoryLabel(category.id, t, categories)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={wardFilter} onValueChange={setWardFilter}>
                            <SelectTrigger><SelectValue placeholder="Ward" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Wards</SelectItem>
                                {wards.map((ward) => (
                                    <SelectItem key={ward.id} value={String(ward.id)}>{language === 'mr' ? ward.nameMr : ward.nameEn}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{filteredIssues.length} items</div>
                    </div>

                    {loading ? <p className="py-8 text-center text-muted-foreground">{t('common.loading')}</p> : null}

                    {!loading ? (
                        <div className="space-y-3">
                            <div className="grid gap-3 md:hidden">
                                {filteredIssues.map((issue) => (
                                    <div key={issue.id} className="space-y-3 rounded-lg border p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-mono text-[11px] text-muted-foreground">{issue.id}</p>
                                                <p className="mt-1 line-clamp-2 text-sm font-medium">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                            </div>
                                            <StatusBadge status={issue.status} />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{getCategoryLabel(issue.category, t, categories)}</Badge>
                                            <span className="text-xs text-muted-foreground">{language === 'mr' ? issue.wardNameMr : issue.wardName}</span>
                                        </div>
                                        <div className="grid gap-2">
                                            <Select
                                                value={getPendingStatus(issue)}
                                                onValueChange={(value) => setPendingStatuses((current) => ({ ...current, [issue.id]: value }))}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {allStatuses.map((status) => (
                                                        <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                value={remarksByIssue[issue.id] || ''}
                                                onChange={(event) => setRemarksByIssue((current) => ({ ...current, [issue.id]: event.target.value }))}
                                                placeholder="Optional note"
                                            />
                                            <Button
                                                type="button"
                                                className="w-full"
                                                onClick={() => updateStatus(issue.id)}
                                                disabled={updatingIssueId === issue.id}
                                            >
                                                {updatingIssueId === issue.id ? 'Updating...' : 'Apply'}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {filteredIssues.length === 0 ? (
                                    <div className="rounded-lg border py-10 text-center text-muted-foreground">
                                        <ListChecks className="mx-auto mb-2 h-5 w-5" />
                                        No issues match the current filters.
                                    </div>
                                ) : null}
                            </div>

                            <div className="hidden overflow-x-auto rounded-lg border md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Ticket</TableHead>
                                        <TableHead>Issue</TableHead>
                                        <TableHead>Ward</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Update</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredIssues.map((issue) => (
                                        <TableRow key={issue.id}>
                                            <TableCell className="font-mono text-xs">{issue.id}</TableCell>
                                            <TableCell>
                                                <p className="font-medium">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                                <Badge variant="outline" className="mt-1">{getCategoryLabel(issue.category, t, categories)}</Badge>
                                            </TableCell>
                                            <TableCell>{language === 'mr' ? issue.wardNameMr : issue.wardName}</TableCell>
                                            <TableCell><StatusBadge status={issue.status} /></TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Select
                                                        value={getPendingStatus(issue)}
                                                        onValueChange={(value) => setPendingStatuses((current) => ({ ...current, [issue.id]: value }))}
                                                    >
                                                        <SelectTrigger className="w-[145px]"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {allStatuses.map((status) => (
                                                                <SelectItem key={status} value={status}>{t(`status.${status}`)}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        className="w-[220px]"
                                                        value={remarksByIssue[issue.id] || ''}
                                                        onChange={(event) => setRemarksByIssue((current) => ({ ...current, [issue.id]: event.target.value }))}
                                                        placeholder="Optional note"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => updateStatus(issue.id)}
                                                        disabled={updatingIssueId === issue.id}
                                                    >
                                                        {updatingIssueId === issue.id ? 'Updating...' : 'Apply'}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredIssues.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                                <ListChecks className="mx-auto mb-2 h-5 w-5" />
                                                No issues match the current filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
