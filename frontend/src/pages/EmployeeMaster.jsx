import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { createEmployee, fetchEmployees, fetchMeta, updateEmployee } from '@/lib/api.js';
import { mapBackendFieldErrors } from '@/lib/formErrors.js';

const initialForm = {
    name: '',
    designation: '',
    email: '',
    phone: '',
    password: '',
};

const designationOptions = [
    'Sanitation Inspector',
    'Junior Engineer',
    'Assistant Engineer',
    'Ward Officer',
    'Health Inspector',
    'Electrical Supervisor',
    'Road Maintenance Officer',
    'Water Supply Officer',
];

function toggleInArray(values, value) {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export default function EmployeeMaster() {
    const { user, isAuthenticated, isSuperAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [search, setSearch] = useState('');
    const [employees, setEmployees] = useState([]);
    const [wards, setWards] = useState([]);
    const [categories, setCategories] = useState([]);
    const [form, setForm] = useState(initialForm);
    const [selectedWardIds, setSelectedWardIds] = useState([]);
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        let active = true;

        const load = async () => {
            setLoading(true);
            setError('');

            try {
                const [employeesResponse, metaResponse] = await Promise.all([
                    fetchEmployees(),
                    fetchMeta(),
                ]);

                if (!active) {
                    return;
                }

                setEmployees(employeesResponse.employees || []);
                setWards(metaResponse.wards || []);
                setCategories(metaResponse.categories || []);
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

        if (isAuthenticated) {
            load();
        } else {
            setLoading(false);
        }

        return () => {
            active = false;
        };
    }, [isAuthenticated]);

    const visibleEmployees = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return employees;
        }

        return employees.filter((employee) => (
            [employee.name, employee.employeeCode, employee.designation, employee.email, employee.phone]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query))
        ));
    }, [employees, search]);

    const create = async () => {
        setSaving(true);
        setError('');
        setMessage('');
        setFieldErrors({});

        const nextFieldErrors = {};
        if (!form.name.trim()) nextFieldErrors.name = 'Name is required';
        if (!form.designation.trim()) nextFieldErrors.designation = 'Designation is required';
        if (!form.password.trim()) nextFieldErrors.password = 'Password is required';
        if (!form.email.trim() && !form.phone.trim()) nextFieldErrors.email = 'Phone or email is required';
        if (selectedWardIds.length === 0) nextFieldErrors.assignedWardIds = 'Select at least one ward';
        if (selectedCategories.length === 0) nextFieldErrors.taskCategories = 'Select at least one task category';
        if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors);
            setSaving(false);
            return;
        }

        try {
            const payload = {
                ...form,
                assignedWardIds: selectedWardIds,
                taskCategories: selectedCategories,
            };
            const response = await createEmployee(payload);
            setEmployees((current) => [response.employee, ...current]);
            setForm(initialForm);
            setSelectedWardIds([]);
            setSelectedCategories([]);
            setFieldErrors({});
            setMessage('Employee created successfully.');
        } catch (createError) {
            setFieldErrors(mapBackendFieldErrors(createError, {
                name: 'name',
                designation: 'designation',
                email: 'email',
                phone: 'phone',
                password: 'password',
                assignedWardIds: 'assignedWardIds',
                taskCategories: 'taskCategories',
            }));
            setError(createError.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (employee) => {
        try {
            const response = await updateEmployee(employee.id, {
                active: employee.active === false,
            });
            setEmployees((current) => current.map((entry) => (entry.id === employee.id ? response.employee : entry)));
        } catch (updateError) {
            setError(updateError.message);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Employee Master</h1>
                        <p className="text-sm text-muted-foreground">Sign in to manage employee records.</p>
                        <Button asChild><Link to="/employee/login">Go to employee login</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isSuperAdmin) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-10">
                <Card>
                    <CardContent className="space-y-3 p-6 text-center">
                        <h1 className="text-2xl font-bold">Employee Master</h1>
                        <p className="text-sm text-destructive">Only super-admin can create or modify employees.</p>
                        <Button asChild variant="outline"><Link to="/employee">Back to workspace</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:py-8">
            <div className="rounded-2xl border bg-gradient-to-r from-slate-100 via-white to-emerald-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Access Controlled</p>
                        <h1 className="text-2xl font-bold">Employee Master</h1>
                        <p className="text-sm text-muted-foreground">Create and control employee accounts, assignments, and activation state.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button asChild variant="outline"><Link to="/employee">Back to Workspace</Link></Button>
                        <Button asChild variant="outline"><Link to="/employee/ward-master">Ward Master</Link></Button>
                    </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Signed in as: {user?.name}</p>
            </div>

            {error ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
            {message ? <p className="rounded-lg border border-secondary/40 bg-secondary/10 p-3 text-sm text-secondary">{message}</p> : null}

            <Card>
                <CardContent className="space-y-4 p-5">
                    <h2 className="text-lg font-semibold">Create Employee</h2>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <p className="mb-1 text-sm font-medium">Full name <span className="text-destructive">*</span></p>
                            <Input placeholder="Full name" value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setFieldErrors((current) => ({ ...current, name: '' })); }} className={fieldErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''} />
                            {fieldErrors.name ? <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p> : null}
                        </div>
                        <Input placeholder="Employee code auto-generated (EMP-XXXX)" value="Auto-generated on create" disabled />
                        <div>
                            <p className="mb-1 text-sm font-medium">Designation <span className="text-destructive">*</span></p>
                            <Select value={form.designation} onValueChange={(value) => { setForm((current) => ({ ...current, designation: value })); setFieldErrors((current) => ({ ...current, designation: '' })); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select designation" />
                            </SelectTrigger>
                            <SelectContent>
                                {designationOptions.map((designation) => (
                                    <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                            {fieldErrors.designation ? <p className="mt-1 text-xs text-destructive">{fieldErrors.designation}</p> : null}
                        </div>
                        <div>
                            <p className="mb-1 text-sm font-medium">Email</p>
                            <Input placeholder="Email (optional)" value={form.email} onChange={(event) => { setForm((current) => ({ ...current, email: event.target.value })); setFieldErrors((current) => ({ ...current, email: '' })); }} className={fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''} />
                            {fieldErrors.email ? <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p> : null}
                        </div>
                        <div>
                            <p className="mb-1 text-sm font-medium">Phone</p>
                            <Input placeholder="Phone (optional)" value={form.phone} onChange={(event) => { setForm((current) => ({ ...current, phone: event.target.value })); setFieldErrors((current) => ({ ...current, phone: '' })); }} className={fieldErrors.phone ? 'border-destructive focus-visible:ring-destructive' : ''} />
                            {fieldErrors.phone ? <p className="mt-1 text-xs text-destructive">{fieldErrors.phone}</p> : null}
                        </div>
                        <div>
                            <p className="mb-1 text-sm font-medium">Temporary password <span className="text-destructive">*</span></p>
                            <Input placeholder="Temporary password" type="password" value={form.password} onChange={(event) => { setForm((current) => ({ ...current, password: event.target.value })); setFieldErrors((current) => ({ ...current, password: '' })); }} className={fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''} />
                            {fieldErrors.password ? <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p> : null}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Assigned Wards <span className="text-destructive">*</span></p>
                        <div className="flex flex-wrap gap-2">
                            {wards.map((ward) => {
                                const selected = selectedWardIds.includes(ward.id);
                                return (
                                    <button
                                        key={ward.id}
                                        type="button"
                                        className={`rounded-full border px-3 py-1 text-xs ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}
                                        onClick={() => setSelectedWardIds((current) => toggleInArray(current, ward.id))}
                                    >
                                        {ward.id} - {ward.nameEn}
                                    </button>
                                );
                            })}
                        </div>
                        {fieldErrors.assignedWardIds ? <p className="text-xs text-destructive">{fieldErrors.assignedWardIds}</p> : null}
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Task Categories <span className="text-destructive">*</span></p>
                        <div className="flex flex-wrap gap-2">
                            {categories.map((category) => {
                                const selected = selectedCategories.includes(category.id);
                                return (
                                    <button
                                        key={category.id}
                                        type="button"
                                        className={`rounded-full border px-3 py-1 text-xs ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}
                                        onClick={() => setSelectedCategories((current) => toggleInArray(current, category.id))}
                                    >
                                        {category.id}
                                    </button>
                                );
                            })}
                        </div>
                        {fieldErrors.taskCategories ? <p className="text-xs text-destructive">{fieldErrors.taskCategories}</p> : null}
                    </div>

                    <Button onClick={create} disabled={saving}>
                        {saving ? 'Creating...' : 'Create Employee'}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">Employee Directory</h2>
                        <Input
                            className="w-full md:w-80"
                            placeholder="Search by name, code, role, contact"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>

                    {loading ? <p className="text-sm text-muted-foreground">Loading employees...</p> : null}

                    {!loading ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            {visibleEmployees.map((employee) => (
                                <div key={employee.id} className="rounded-xl border p-4">
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold">{employee.name}</p>
                                            <p className="text-xs text-muted-foreground">{employee.designation || 'Employee'} • {employee.employeeCode || 'No code'}</p>
                                        </div>
                                        <Badge variant={employee.active === false ? 'secondary' : 'outline'}>
                                            {employee.active === false ? 'Inactive' : 'Active'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{employee.email || employee.phone || 'No contact'}</p>
                                    <p className="mt-2 text-xs text-muted-foreground">Wards: {(employee.assignedWardIds || []).join(', ') || 'None'}</p>
                                    <p className="text-xs text-muted-foreground">Tasks: {(employee.taskCategories || []).join(', ') || 'None'}</p>
                                    <div className="mt-3">
                                        <Button size="sm" variant="outline" onClick={() => toggleActive(employee)}>
                                            {employee.active === false ? 'Activate' : 'Deactivate'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {visibleEmployees.length === 0 ? <p className="text-sm text-muted-foreground">No employees match current search.</p> : null}
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
