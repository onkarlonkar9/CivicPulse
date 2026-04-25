import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { User, Settings, FileText, Shield } from 'lucide-react';
import { fetchMyIssues, requestCitizenLoginOtp, requestCitizenRegisterOtp, verifyCitizenLoginOtp, verifyCitizenRegisterOtp } from '@/lib/api.js';

const initialState = { name: '', phone: '', password: '', otp: '' };

const ProfileAuth = () => {
    const { t, language, setLanguage } = useTranslation();
    const { user, isAuthenticated, isAdmin, setSession, logout, loading } = useAuth();
    const [accessType, setAccessType] = useState('citizen');
    const [mode, setMode] = useState('login');
    const [step, setStep] = useState('credentials');
    const [form, setForm] = useState(initialState);
    const [myIssues, setMyIssues] = useState([]);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isAuthenticated) {
            setMyIssues([]);
            return;
        }

        fetchMyIssues()
            .then((response) => setMyIssues(response.issues))
            .catch((loadError) => setError(loadError.message));
    }, [isAuthenticated]);

    const updateField = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const resetAuthFlow = (nextMode) => {
        setMode(nextMode);
        setStep('credentials');
        setForm(initialState);
        setError('');
        setMessage('');
    };

    const requestOtp = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');

        try {
            if (mode === 'login') {
                await requestCitizenLoginOtp({ phone: form.phone, password: form.password });
            } else {
                await requestCitizenRegisterOtp({ name: form.name, phone: form.phone, password: form.password });
            }

            setStep('otp');
            setMessage(t('auth.otpSent'));
        } catch (submitError) {
            setError(submitError.message);
        }
    };

    const verifyOtp = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');

        try {
            const response = mode === 'login'
                ? await verifyCitizenLoginOtp({ phone: form.phone, otp: form.otp })
                : await verifyCitizenRegisterOtp({ phone: form.phone, otp: form.otp });

            setSession(response);
            setMessage(
                mode === 'login'
                    ? `${t('auth.loginSuccess')} ${response.user.name}`
                    : `${t('auth.welcome')}, ${response.user.name}`
            );
        } catch (submitError) {
            setError(submitError.message);
        }
    };

    if (loading) {
        return <div className="mx-auto max-w-lg px-4 py-8 text-center text-muted-foreground">{t('common.loading')}</div>;
    }

    return (
        <div className="mx-auto max-w-lg px-4 py-6 md:py-8">
            <h1 className="mb-6 text-2xl font-bold">{t('nav.profile')}</h1>

            {!isAuthenticated ? (
                <Card className="mb-6">
                    <CardContent className="space-y-4 p-4 sm:p-6">
                        <div className="grid grid-cols-2 gap-2">
                            <Button className="h-11" variant={accessType === 'citizen' ? 'default' : 'outline'} onClick={() => setAccessType('citizen')}>
                                Citizen
                            </Button>
                            <Button className="h-11" variant={accessType === 'admin' ? 'default' : 'outline'} onClick={() => setAccessType('admin')}>
                                Admin
                            </Button>
                        </div>

                        {accessType === 'admin' ? (
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                                <h2 className="text-lg font-semibold">{t('auth.adminLogin')}</h2>
                                <p className="text-sm text-muted-foreground">{t('auth.adminLoginDesc')}</p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Button asChild className="h-11">
                                        <Link to="/admin/login">{t('auth.signInAdmin')}</Link>
                                    </Button>
                                    <Button asChild variant="outline" className="h-11">
                                        <Link to="/admin/register">{t('auth.registerWithInvite')}</Link>
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {accessType === 'citizen' ? (
                            <>
                        <div>
                            <h2 className="text-xl font-bold">{t('auth.citizenAccess')}</h2>
                            <p className="text-sm text-muted-foreground">{t('auth.citizenAccessDesc')}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button className="h-11" variant={mode === 'login' ? 'default' : 'outline'} onClick={() => resetAuthFlow('login')}>{t('auth.citizenLogin')}</Button>
                            <Button className="h-11" variant={mode === 'register' ? 'default' : 'outline'} onClick={() => resetAuthFlow('register')}>{t('auth.citizenRegister')}</Button>
                        </div>

                        {step === 'credentials' ? (
                            <form className="space-y-3" onSubmit={requestOtp}>
                                {mode === 'register' ? (
                                    <div className="space-y-1.5">
                                        <Label htmlFor="name">{t('common.name')}</Label>
                                        <Input id="name" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
                                    </div>
                                ) : null}
                                <div className="space-y-1.5">
                                    <Label htmlFor="phone">{t('common.phone')}</Label>
                                    <Input id="phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="password">{t('common.password')}</Label>
                                    <Input id="password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
                                </div>
                                <Button type="submit" className="h-11 w-full">{mode === 'login' ? t('auth.sendLoginOtp') : t('auth.sendRegisterOtp')}</Button>
                            </form>
                        ) : (
                            <form className="space-y-3" onSubmit={verifyOtp}>
                                <div className="space-y-1.5">
                                    <Label htmlFor="otp">{t('auth.otpCode')}</Label>
                                    <Input id="otp" value={form.otp} onChange={(event) => updateField('otp', event.target.value)} maxLength={6} />
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Button type="button" variant="outline" className="h-11" onClick={() => setStep('credentials')}>{t('report.back')}</Button>
                                    <Button type="submit" className="h-11">{t('common.verifyOtp')}</Button>
                                </div>
                            </form>
                        )}

                        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                            <p className="font-medium">{t('auth.needAdminProfile')}</p>
                            <p className="mb-2 text-muted-foreground">{t('auth.adminInviteDesc')}</p>
                            <Button asChild variant="outline" size="sm" className="h-10">
                                <Link to="/admin/register">{t('auth.openAdminRegistration')}</Link>
                            </Button>
                        </div>
                            </>
                        ) : null}

                        {message ? <p className="text-sm text-secondary">{message}</p> : null}
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    </CardContent>
                </Card>
            ) : null}

            {isAuthenticated && user ? (
                <>
                    <Card className="mb-6">
                        <CardContent className="p-6 text-center">
                            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                                {isAdmin ? <Shield className="h-10 w-10 text-primary" /> : <User className="h-10 w-10 text-primary" />}
                            </div>
                            <h2 className="text-xl font-bold">{user.name}</h2>
                            <p className="text-muted-foreground">+91 {user.phone}</p>
                            <p className="mt-2 text-xs uppercase tracking-wide text-primary">{user.role}</p>
                            <Button variant="outline" size="sm" className="mt-4" onClick={logout}>{t('common.logout')}</Button>
                        </CardContent>
                    </Card>

                    <div className="space-y-2">
                        <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div className="flex-1">
                                    <p className="font-medium">{t('nav.myComplaints')}</p>
                                    <p className="text-sm text-muted-foreground">{myIssues.length} {t('ward.complaints').toLowerCase()}</p>
                                </div>
                                <Button asChild size="sm" variant="outline">
                                    <Link to="/my-reports">Open</Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                                <Settings className="h-5 w-5 text-muted-foreground" />
                                <div className="flex-1">
                                    <p className="font-medium">{t('common.languageLabel')}</p>
                                    <p className="text-sm text-muted-foreground">{language === 'mr' ? t('common.marathi') : t('common.english')}</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-10 w-full sm:w-auto" onClick={() => setLanguage(language === 'mr' ? 'en' : 'mr')}>
                                    {language === 'mr' ? t('common.english') : t('common.marathi')}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : null}
        </div>
    );
};

export default ProfileAuth;
