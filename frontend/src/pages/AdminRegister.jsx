import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Button } from '@/components/ui/button.jsx';
import { registerAdmin } from '@/lib/api.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useTranslation } from '@/contexts/LanguageContext.jsx';

const AdminRegister = () => {
    const navigate = useNavigate();
    const { setSession } = useAuth();
    const { t } = useTranslation();
    const [form, setForm] = useState({
        name: '',
        phone: '',
        password: '',
        inviteCode: '',
    });
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
            const response = await registerAdmin(form);
            setSession(response);
            navigate('/admin');
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
                {t('common.backToProfile')}
            </Link>

            <Card>
                <CardContent className="space-y-4 p-6">
                        <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                            <Shield className="h-7 w-7 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold">{t('auth.adminRegistration')}</h1>
                        <p className="text-sm text-muted-foreground">{t('auth.adminRegistrationDesc')}</p>
                    </div>

                    <form className="space-y-3" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-name">{t('common.name')}</Label>
                            <Input id="admin-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-phone">{t('common.phone')}</Label>
                            <Input id="admin-phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-password">{t('common.password')}</Label>
                            <Input id="admin-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="admin-invite">{t('auth.inviteCode')}</Label>
                            <Input id="admin-invite" value={form.inviteCode} onChange={(event) => updateField('inviteCode', event.target.value.toUpperCase())} />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? t('auth.creatingAdmin') : t('auth.createAdminProfile')}
                        </Button>
                    </form>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminRegister;
