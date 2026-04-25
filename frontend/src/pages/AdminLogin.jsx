import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useTranslation } from '@/contexts/LanguageContext.jsx';

const AdminLogin = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const { t } = useTranslation();
    const [form, setForm] = useState({ identifier: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const updateField = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await login(form);

            if (!['employee', 'admin', 'super-admin'].includes(response.user.role)) {
                setError(t('auth.notAdminAccount'));
                return;
            }

            navigate('/employee');
        } catch (submitError) {
            setError(submitError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg px-4 py-8">
            <Link to="/profile" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                {t('common.backToCitizenAccess')}
            </Link>

            <Card>
                <CardContent className="space-y-4 p-6">
                    <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                            <Shield className="h-7 w-7 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold">Employee Login</h1>
                        <p className="text-sm text-muted-foreground">Employees, admins, and super-admins sign in here.</p>
                    </div>

                    <form className="space-y-3" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-identifier">Phone or Email</Label>
                            <Input id="admin-identifier" value={form.identifier} onChange={(event) => updateField('identifier', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-password">{t('common.password')}</Label>
                            <Input id="admin-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? t('auth.signingIn') : 'Sign In to Workspace'}
                        </Button>
                    </form>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminLogin;
