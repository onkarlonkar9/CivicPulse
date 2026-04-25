import { useMemo, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Database, Download, Plus, RefreshCw, Save, Search, Upload } from 'lucide-react';
import { fetchWardMaster, syncWardMasterFromUrl, updateWardMaster } from '@/lib/api.js';

function toCsvNumbers(values) {
    return (values || []).join(', ');
}

function fromCsvNumbers(value) {
    return String(value || '')
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function makeEmptyWard(nextId) {
    return {
        id: nextId,
        nameEn: '',
        nameMr: '',
        officeName: '',
        officeAddress: '',
        officePhone: '',
        electoralWards: [],
        officeLat: '',
        officeLng: '',
    };
}

function normalizeWardPayload(wardDataSource, wards) {
    return {
        wardDataSource: {
            source: String(wardDataSource.source || '').trim(),
            url: String(wardDataSource.url || '').trim(),
            lastVerifiedOn: String(wardDataSource.lastVerifiedOn || '').trim(),
            notes: String(wardDataSource.notes || '').trim(),
        },
        wards: wards.map((ward) => ({
            id: Number(ward.id),
            nameEn: String(ward.nameEn || '').trim(),
            nameMr: String(ward.nameMr || '').trim(),
            officeName: String(ward.officeName || '').trim(),
            officeAddress: String(ward.officeAddress || '').trim(),
            officePhone: String(ward.officePhone || '').trim(),
            electoralWards: Array.isArray(ward.electoralWards)
                ? ward.electoralWards
                : fromCsvNumbers(ward.electoralWards),
            officeLat: Number(ward.officeLat),
            officeLng: Number(ward.officeLng),
        })),
    };
}

function wardCompletenessScore(ward) {
    const fields = [ward.nameEn, ward.nameMr, ward.officeName, ward.officeAddress, ward.officePhone, ward.officeLat, ward.officeLng];
    const complete = fields.filter((field) => String(field ?? '').trim() !== '').length;
    return Math.round((complete / fields.length) * 100);
}

export default function WardMasterAdmin() {
    const { isAuthenticated, isAdmin } = useAuth();
    const fileInputRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [search, setSearch] = useState('');
    const [syncUrl, setSyncUrl] = useState('');
    const [wardDataSource, setWardDataSource] = useState({
        source: '',
        url: '',
        lastVerifiedOn: '',
        notes: '',
    });
    const [wards, setWards] = useState([]);

    useEffect(() => {
        let active = true;

        const load = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetchWardMaster();
                if (!active) {
                    return;
                }

                setWardDataSource(response.wardDataSource || {
                    source: '',
                    url: '',
                    lastVerifiedOn: '',
                    notes: '',
                });
                setWards(response.wards || []);
                setSyncUrl(response.wardDataSource?.url || '');
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

        if (isAuthenticated && isAdmin) {
            load();
        } else {
            setLoading(false);
        }

        return () => {
            active = false;
        };
    }, [isAuthenticated, isAdmin]);

    const duplicateIdSet = useMemo(() => {
        const seen = new Set();
        const duplicates = new Set();

        for (const ward of wards) {
            const id = Number(ward.id);
            if (!Number.isInteger(id)) {
                continue;
            }
            if (seen.has(id)) {
                duplicates.add(id);
            }
            seen.add(id);
        }

        return duplicates;
    }, [wards]);

    const filteredWards = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) {
            return wards;
        }

        return wards.filter((ward) => [ward.id, ward.nameEn, ward.nameMr, ward.officeName, ward.officeAddress]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)));
    }, [wards, search]);

    const canSave = useMemo(() => {
        if (!wards.length || duplicateIdSet.size > 0) {
            return false;
        }

        return wards.every((ward) => {
            const id = Number(ward.id);
            const lat = Number(ward.officeLat);
            const lng = Number(ward.officeLng);

            return Number.isInteger(id)
                && String(ward.nameEn || '').trim().length > 1
                && String(ward.nameMr || '').trim().length > 1
                && Number.isFinite(lat)
                && Number.isFinite(lng);
        });
    }, [wards, duplicateIdSet]);

    const averageCompleteness = useMemo(() => {
        if (!wards.length) {
            return 0;
        }
        const total = wards.reduce((sum, ward) => sum + wardCompletenessScore(ward), 0);
        return Math.round(total / wards.length);
    }, [wards]);

    const updateWard = (wardId, key, value) => {
        setWards((current) => current.map((ward) => (
            ward.id === wardId
                ? { ...ward, [key]: value }
                : ward
        )));
    };

    const removeWard = (wardId) => {
        setWards((current) => current.filter((ward) => ward.id !== wardId));
    };

    const addWard = () => {
        const maxId = wards.reduce((max, ward) => Math.max(max, Number(ward.id) || 0), 0);
        setWards((current) => [...current, makeEmptyWard(maxId + 1)]);
    };

    const save = async () => {
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const payload = normalizeWardPayload(wardDataSource, wards);
            const response = await updateWardMaster(payload);
            setWardDataSource(response.wardDataSource || wardDataSource);
            setWards(response.wards || wards);
            setMessage('Ward master updated successfully.');
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setSaving(false);
        }
    };

    const exportJson = () => {
        const payload = {
            wardDataSource,
            wards,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `ward-master-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const importJson = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setError('');
        setMessage('');

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const source = data?.wardDataSource || wardDataSource;
            const incomingWards = data?.wards || (Array.isArray(data) ? data : null);

            if (!Array.isArray(incomingWards) || incomingWards.length === 0) {
                throw new Error('Import file must contain ward array or ward-master object.');
            }

            setWardDataSource({
                source: source.source || '',
                url: source.url || '',
                lastVerifiedOn: source.lastVerifiedOn || '',
                notes: source.notes || '',
            });
            setWards(incomingWards);
            setMessage(`Loaded ${incomingWards.length} wards from file. Save to persist.`);
        } catch (importError) {
            setError(importError.message);
        }
    };

    const syncFromUrl = async () => {
        setSyncing(true);
        setError('');
        setMessage('');

        try {
            const response = await syncWardMasterFromUrl(syncUrl);
            setWardDataSource(response.wardDataSource || wardDataSource);
            setWards(response.wards || wards);
            setMessage(`Synced ${response.wards?.length || 0} wards from URL.`);
        } catch (syncError) {
            setError(syncError.message);
        } finally {
            setSyncing(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-8">
                <Card className="border-0 shadow-lg">
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Ward Master</h1>
                        <p className="text-sm text-muted-foreground">Please sign in as admin to manage ward master data.</p>
                        <Button asChild><Link to="/employee/login">Go to employee login</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-8">
                <Card className="border-0 shadow-lg">
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Ward Master</h1>
                        <p className="text-sm text-destructive">Admin access required.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
            <section className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-800 p-5 text-white">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-cyan-100">
                            <Database className="h-3.5 w-3.5" />
                            Data Authority
                        </div>
                        <h1 className="text-2xl font-bold">Ward Master</h1>
                        <p className="text-sm text-cyan-100">Single source of truth for ward detection, routing, and analytics.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                            <p className="text-xl font-bold">{wards.length}</p>
                            <p className="text-xs text-cyan-100">Total Wards</p>
                        </div>
                        <div className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                            <p className="text-xl font-bold">{averageCompleteness}%</p>
                            <p className="text-xs text-cyan-100">Avg Completeness</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">Manage import/export, sync operations, and granular ward details.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline"><Link to="/employee">Back to Employee Workspace</Link></Button>
                    <Button onClick={exportJson} variant="outline" disabled={loading}><Download className="mr-1 h-4 w-4" />Export</Button>
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" disabled={loading}><Upload className="mr-1 h-4 w-4" />Import</Button>
                    <Button onClick={addWard} variant="outline" disabled={loading}><Plus className="mr-1 h-4 w-4" />Add Ward</Button>
                    <Button onClick={save} disabled={!canSave || saving || loading}><Save className="mr-1 h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
            </section>

            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importJson} />

            {error ? <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {message ? <p className="mb-3 rounded-md border border-secondary/30 bg-secondary/10 p-3 text-sm text-secondary">{message}</p> : null}
            {duplicateIdSet.size > 0 ? <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">Duplicate ward IDs found: {[...duplicateIdSet].join(', ')}</p> : null}

            {loading ? <p className="text-sm text-muted-foreground">Loading ward master...</p> : null}

            {!loading ? (
                <>
                    <Card className="border-0 shadow-sm">
                        <CardContent className="space-y-4 p-5">
                            <div className="grid gap-3 md:grid-cols-3">
                                <Input value={wardDataSource.source} onChange={(event) => setWardDataSource((current) => ({ ...current, source: event.target.value }))} placeholder="Source name" />
                                <Input value={wardDataSource.url} onChange={(event) => setWardDataSource((current) => ({ ...current, url: event.target.value }))} placeholder="Source URL" />
                                <Input value={wardDataSource.lastVerifiedOn} onChange={(event) => setWardDataSource((current) => ({ ...current, lastVerifiedOn: event.target.value }))} placeholder="YYYY-MM-DD" />
                            </div>
                            <Textarea value={wardDataSource.notes} onChange={(event) => setWardDataSource((current) => ({ ...current, notes: event.target.value }))} placeholder="Verification notes" rows={2} />
                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                                <Input value={syncUrl} onChange={(event) => setSyncUrl(event.target.value)} placeholder="Open-source URL (JSON or GeoJSON)" />
                                <Button onClick={syncFromUrl} disabled={syncing || !String(syncUrl).trim()}><RefreshCw className="mr-1 h-4 w-4" />{syncing ? 'Syncing...' : 'Sync From URL'}</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-5">
                            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ward by id, name, office, address" />
                                </div>
                                <div className="rounded-md border bg-muted px-3 py-2 text-sm">Total: {wards.length}</div>
                                <div className="rounded-md border bg-muted px-3 py-2 text-sm">Visible: {filteredWards.length}</div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3 md:space-y-4">
                        {filteredWards.map((ward) => (
                            <details key={`${ward.id}-${ward.nameEn}`} className="rounded-xl border bg-card shadow-sm open:shadow-md" open>
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                                    <div>
                                        <p className="font-semibold">{ward.nameEn || 'Unnamed Ward'} ({ward.id || '-'})</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <Badge variant="outline">Completeness {wardCompletenessScore(ward)}%</Badge>
                                            {duplicateIdSet.has(Number(ward.id)) ? <Badge variant="secondary">Duplicate ID</Badge> : null}
                                        </div>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={(event) => { event.preventDefault(); removeWard(ward.id); }}>Delete</Button>
                                </summary>
                                <div className="grid gap-3 border-t p-4 md:grid-cols-2">
                                    <Input value={ward.id ?? ''} onChange={(event) => updateWard(ward.id, 'id', event.target.value)} placeholder="Ward ID" />
                                    <Input value={ward.nameEn || ''} onChange={(event) => updateWard(ward.id, 'nameEn', event.target.value)} placeholder="Ward name (English)" />
                                    <Input value={ward.nameMr || ''} onChange={(event) => updateWard(ward.id, 'nameMr', event.target.value)} placeholder="Ward name (Marathi)" />
                                    <Input value={ward.officeName || ''} onChange={(event) => updateWard(ward.id, 'officeName', event.target.value)} placeholder="Office name" />
                                    <Input value={ward.officeAddress || ''} onChange={(event) => updateWard(ward.id, 'officeAddress', event.target.value)} placeholder="Office address" />
                                    <Input value={ward.officePhone || ''} onChange={(event) => updateWard(ward.id, 'officePhone', event.target.value)} placeholder="Office phone" />
                                    <Input value={ward.officeLat ?? ''} onChange={(event) => updateWard(ward.id, 'officeLat', event.target.value)} placeholder="Office latitude" />
                                    <Input value={ward.officeLng ?? ''} onChange={(event) => updateWard(ward.id, 'officeLng', event.target.value)} placeholder="Office longitude" />
                                    <Input
                                        className="md:col-span-2"
                                        value={Array.isArray(ward.electoralWards) ? toCsvNumbers(ward.electoralWards) : ward.electoralWards || ''}
                                        onChange={(event) => updateWard(ward.id, 'electoralWards', event.target.value)}
                                        placeholder="Electoral wards (comma separated)"
                                    />
                                </div>
                            </details>
                        ))}

                        {!filteredWards.length ? (
                            <Card>
                                <CardContent className="p-6 text-center text-sm text-muted-foreground">No wards match your search.</CardContent>
                            </Card>
                        ) : null}
                    </div>
                </>
            ) : null}
        </div>
    );
}
