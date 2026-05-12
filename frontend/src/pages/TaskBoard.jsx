import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { assignTask, fetchEmployees, fetchMeta, fetchMyTasks, updateTaskStatus } from '@/lib/api.js';

const TASK_STATUSES = ['unassigned', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled'];

export default function TaskBoard() {
    const { isAuthenticated, isAdmin, user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [wards, setWards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [overdueFilter, setOverdueFilter] = useState('all');
    const [wardFilter, setWardFilter] = useState('all');
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [pendingStatuses, setPendingStatuses] = useState({});
    const [pendingAssignees, setPendingAssignees] = useState({});
    const [updatingTaskId, setUpdatingTaskId] = useState('');

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const [taskResponse, metaResponse] = await Promise.all([
                    fetchMyTasks(),
                    fetchMeta(),
                ]);

                if (!active) {
                    return;
                }

                setTasks(taskResponse.tasks || []);
                setWards(metaResponse.wards || []);

                if (['admin', 'super-admin'].includes(user?.role)) {
                    const employeesResponse = await fetchEmployees();
                    if (active) {
                        setEmployees((employeesResponse.employees || []).filter((entry) => entry.active !== false));
                    }
                } else if (active) {
                    setEmployees([]);
                }
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

        load();
        return () => {
            active = false;
        };
    }, [user?.role]);

    const filteredTasks = useMemo(() => {
        const query = search.trim().toLowerCase();
        return tasks.filter((task) => {
            if (statusFilter !== 'all' && task.status !== statusFilter) {
                return false;
            }
            if (overdueFilter === 'overdue' && !task.isOverdue) {
                return false;
            }
            if (overdueFilter === 'ontime' && task.isOverdue) {
                return false;
            }
            if (wardFilter !== 'all' && String(task.wardId) !== wardFilter) {
                return false;
            }
            if (assigneeFilter !== 'all' && String(task.assignedToEmployeeId || '') !== assigneeFilter) {
                return false;
            }
            if (!query) {
                return true;
            }
            return [task.id, task.issueId, task.category, task.assignedToEmployeeName]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query));
        });
    }, [assigneeFilter, overdueFilter, search, statusFilter, tasks, wardFilter]);

    const getEligibleEmployees = (task) => {
        return employees.filter((employee) => {
            const wardEligible = Array.isArray(employee.assignedWardIds) && employee.assignedWardIds.includes(task.wardId);
            const categories = Array.isArray(employee.taskCategories) ? employee.taskCategories : [];
            const categoryEligible = categories.length === 0 || categories.includes(task.category);
            return wardEligible && categoryEligible;
        });
    };

    const applyStatus = async (task) => {
        const nextStatus = pendingStatuses[task.id] || task.status;
        if (nextStatus === task.status) {
            return;
        }
        try {
            setError('');
            setMessage('');
            setUpdatingTaskId(task.id);
            const response = await updateTaskStatus(task.id, { status: nextStatus });
            setTasks((current) => current.map((entry) => (entry.id === task.id ? { ...entry, ...response.task, issue: response.issue || entry.issue } : entry)));
            setPendingStatuses((current) => {
                const next = { ...current };
                delete next[task.id];
                return next;
            });
            setMessage(`Updated ${task.id} to ${nextStatus}.`);
        } catch (updateError) {
            setError(updateError.message);
        } finally {
            setUpdatingTaskId('');
        }
    };

    const applyAssignment = async (task) => {
        const employeeId = pendingAssignees[task.id] || task.assignedToEmployeeId;
        if (!employeeId || employeeId === task.assignedToEmployeeId) {
            return;
        }
        try {
            setError('');
            setMessage('');
            setUpdatingTaskId(task.id);
            const response = await assignTask(task.id, { employeeId, expectedUpdatedAt: task.updatedAt });
            setTasks((current) => current.map((entry) => (entry.id === task.id ? { ...entry, ...response.task } : entry)));
            setPendingAssignees((current) => {
                const next = { ...current };
                delete next[task.id];
                return next;
            });
            setMessage(`Assigned ${task.id} to ${response.task?.assignedToEmployeeName || 'employee'}.`);
        } catch (assignError) {
            setError(assignError.message);
        } finally {
            setUpdatingTaskId('');
        }
    };

    if (!isAuthenticated || !isAdmin) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Task Board</h1>
                        <p className="text-sm text-muted-foreground">Staff access required.</p>
                        <Button asChild><Link to="/employee/login">Go to employee login</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 md:px-4 md:py-8">
            <section className="rounded-2xl border bg-gradient-to-r from-cyan-50 via-white to-slate-100 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold md:text-2xl">Task Board</h1>
                        <p className="text-sm text-muted-foreground">Track assignments, SLA breaches, and execution status.</p>
                    </div>
                    <Button asChild variant="outline"><Link to="/employee">Back to Workspace</Link></Button>
                </div>
            </section>

            {error ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {message ? <p className="rounded-lg border border-emerald-300/40 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="grid gap-3 md:grid-cols-6">
                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, issue, category, owner" />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                {TASK_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={overdueFilter} onValueChange={setOverdueFilter}>
                            <SelectTrigger><SelectValue placeholder="SLA" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All SLA</SelectItem>
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="ontime">On Time</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={wardFilter} onValueChange={setWardFilter}>
                            <SelectTrigger><SelectValue placeholder="Ward" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Wards</SelectItem>
                                {wards.map((ward) => (
                                    <SelectItem key={ward.id} value={String(ward.id)}>{ward.nameEn}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                            <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Assignees</SelectItem>
                                {employees.map((employee) => (
                                    <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{filteredTasks.length} tasks</div>
                    </div>

                    {loading ? <p className="py-6 text-center text-muted-foreground">Loading tasks...</p> : null}

                    {!loading ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            {filteredTasks.map((task) => {
                                const eligibleEmployees = getEligibleEmployees(task);
                                return (
                                    <div key={task.id} className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-mono text-xs text-muted-foreground">{task.id}</p>
                                            <Badge variant={task.status === 'assigned' ? 'outline' : 'secondary'}>{task.status}</Badge>
                                        </div>
                                        <p className="mt-1 text-sm font-medium">{task.issue?.id || task.issueId}</p>
                                        <p className="text-xs text-muted-foreground">Ward {task.wardId} | {task.category}</p>
                                        <p className="text-xs text-muted-foreground">Priority {(task.priority || 'p3').toUpperCase()}</p>
                                        <p className="text-xs text-muted-foreground">Due: {task.dueAt ? new Date(task.dueAt).toLocaleString() : 'N/A'}</p>
                                        {task.isOverdue ? <p className="text-xs font-medium text-destructive">SLA Breached</p> : null}
                                        <p className="mt-1 text-xs text-muted-foreground">Owner: {task.assignedToEmployeeName || 'Unassigned'}</p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <Select
                                                value={pendingStatuses[task.id] || task.status}
                                                onValueChange={(value) => setPendingStatuses((current) => ({ ...current, [task.id]: value }))}
                                            >
                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {TASK_STATUSES.map((status) => (
                                                        <SelectItem key={status} value={status}>{status}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button size="sm" variant="outline" onClick={() => applyStatus(task)} disabled={updatingTaskId === task.id}>
                                                Apply
                                            </Button>
                                        </div>

                                        {['admin', 'super-admin'].includes(user?.role) ? (
                                            <div className="mt-2 flex items-center gap-2">
                                                <Select
                                                    value={pendingAssignees[task.id] || task.assignedToEmployeeId || ''}
                                                    onValueChange={(value) => setPendingAssignees((current) => ({ ...current, [task.id]: value }))}
                                                >
                                                    <SelectTrigger className="h-8"><SelectValue placeholder="Assign employee" /></SelectTrigger>
                                                    <SelectContent>
                                                        {eligibleEmployees.map((employee) => (
                                                            <SelectItem key={employee.id} value={employee.id}>{employee.name} ({employee.employeeCode || 'No code'})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button size="sm" variant="secondary" onClick={() => applyAssignment(task)} disabled={updatingTaskId === task.id || eligibleEmployees.length === 0}>
                                                    Assign
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                            {filteredTasks.length === 0 ? (
                                <div className="rounded-lg border py-10 text-center text-muted-foreground md:col-span-2">
                                    No tasks match the current filters.
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
