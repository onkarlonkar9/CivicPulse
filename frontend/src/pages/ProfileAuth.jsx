import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { User, Settings, FileText, Shield, Sparkles, KeyRound, UserRoundPlus } from 'lucide-react';
import { fetchMyIssues, requestCitizenLoginOtp, requestCitizenRegisterOtp, verifyCitizenLoginOtp, verifyCitizenRegisterOtp } from '@/lib/api.js';

const initialState = {
    name: '',
    identifier: '',
    phone: '',
    email: '',
    password: '',
    otp: '',
    wardName: '',
    area: '',
    address: '',
    pincode: '',
};

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
                await requestCitizenLoginOtp({ identifier: form.identifier, password: form.password });
            } else {
                await requestCitizenRegisterOtp({
                    name: form.name,
                    phone: form.phone || undefined,
                    email: form.email || undefined,
                    password: form.password,
                    wardName: form.wardName || undefined,
                    area: form.area || undefined,
                    address: form.address || undefined,
                    pincode: form.pincode || undefined,
                });
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
                ? await verifyCitizenLoginOtp({ identifier: form.identifier, otp: form.otp })
                : await verifyCitizenRegisterOtp({ identifier: form.email || form.phone, otp: form.otp });

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
        <div className="mx-auto max-w-3xl px-4 py-6 md:py-8">
            <h1 className="mb-6 text-2xl font-bold">{t('nav.profile')}</h1>

            {!isAuthenticated ? (
                <Card className="mb-6 overflow-hidden border-0 shadow-lg">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-800 p-5 text-white">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-cyan-100">
                            <Sparkles className="h-4 w-4" />
                            Smart citizen onboarding
                        </div>
                        <h2 className="mt-2 text-xl font-bold">Register and track civic issues faster</h2>
                        <p className="mt-1 text-sm text-cyan-100">Secure OTP-based access with citizen details for better ward-level routing.</p>
                    </div>
                    <CardContent className="space-y-5 bg-background p-4 sm:p-6">
                        <div className="grid grid-cols-2 gap-2">
                            <Button className="h-11" variant={accessType === 'citizen' ? 'default' : 'outline'} onClick={() => setAccessType('citizen')}>
                                Citizen
                            </Button>
                            <Button className="h-11" variant={accessType === 'admin' ? 'default' : 'outline'} onClick={() => setAccessType('admin')}>
                                Employee
                            </Button>
                        </div>

                        {accessType === 'admin' ? (
                            <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                                <h2 className="text-lg font-semibold">Employee Access</h2>
                                <p className="text-sm text-muted-foreground">{t('auth.adminLoginDesc')}</p>
                                <div className="grid grid-cols-1 gap-2">
                                    <Button asChild className="h-11">
                                        <Link to="/employee/login">Sign In to Employee Workspace</Link>
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {accessType === 'citizen' ? (
                            <>
                                <div className="rounded-xl border bg-gradient-to-r from-slate-50 to-cyan-50 p-4">
                                    <h2 className="text-xl font-bold">{t('auth.citizenAccess')}</h2>
                                    <p className="text-sm text-muted-foreground">{t('auth.citizenAccessDesc')}</p>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Button className="h-11 gap-2" variant={mode === 'login' ? 'default' : 'outline'} onClick={() => resetAuthFlow('login')}>
                                        <KeyRound className="h-4 w-4" />
                                        {t('auth.citizenLogin')}
                                    </Button>
                                    <Button className="h-11 gap-2" variant={mode === 'register' ? 'default' : 'outline'} onClick={() => resetAuthFlow('register')}>
                                        <UserRoundPlus className="h-4 w-4" />
                                        {t('auth.citizenRegister')}
                                    </Button>
                                </div>

                                {step === 'credentials' ? (
                                    <form className="space-y-4" onSubmit={requestOtp}>
                                        <div className={mode === 'register' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
                                            {mode === 'register' ? (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="name">{t('common.name')}</Label>
                                                    <Input id="name" value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Your full name" />
                                                </div>
                                            ) : null}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="identifier">{mode === 'login' ? 'Phone or Email' : t('common.phone')}</Label>
                                                <Input id="identifier" value={mode === 'login' ? form.identifier : form.phone} onChange={(event) => updateField(mode === 'login' ? 'identifier' : 'phone', event.target.value)} placeholder={mode === 'login' ? 'Enter phone or email' : '10-digit mobile number'} />
                                            </div>
                                            {mode === 'register' ? (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="email">Email (optional)</Label>
                                                    <Input id="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="name@email.com" />
                                                </div>
                                            ) : null}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="password">{t('common.password')}</Label>
                                                <Input id="password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} placeholder="Use strong password" />
                                            </div>
                                        </div>

                                        {mode === 'register' ? (
                                            <div className="rounded-xl border bg-slate-50 p-4">
                                                <p className="mb-3 text-sm font-medium">Location details</p>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="wardName">Ward</Label>
                                                        <Input id="wardName" value={form.wardName} onChange={(event) => updateField('wardName', event.target.value)} placeholder="Ward name" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="area">Area</Label>
                                                        <Input id="area" value={form.area} onChange={(event) => updateField('area', event.target.value)} placeholder="Area or locality" />
                                                    </div>
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <Label htmlFor="address">Address</Label>
                                                        <Input id="address" value={form.address} onChange={(event) => updateField('address', event.target.value)} placeholder="House no, street, landmark" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="pincode">Pincode</Label>
                                                        <Input id="pincode" value={form.pincode} onChange={(event) => updateField('pincode', event.target.value)} placeholder="6-digit pincode" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        <Button type="submit" className="h-11 w-full">{mode === 'login' ? t('auth.sendLoginOtp') : t('auth.sendRegisterOtp')}</Button>
                                    </form>
                                ) : (
                                    <form className="space-y-3 rounded-xl border bg-slate-50 p-4" onSubmit={verifyOtp}>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="otp">{t('auth.otpCode')}</Label>
                                            <Input id="otp" value={form.otp} onChange={(event) => updateField('otp', event.target.value)} maxLength={6} placeholder="Enter 6-digit OTP" />
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <Button type="button" variant="outline" className="h-11" onClick={() => setStep('credentials')}>{t('report.back')}</Button>
                                            <Button type="submit" className="h-11">{t('common.verifyOtp')}</Button>
                                        </div>
                                    </form>
                                )}

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
                            <p className="text-muted-foreground">{user.phone ? `+91 ${user.phone}` : user.email}</p>
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
