import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import CategoryPicker from '@/components/CategoryPicker.jsx';
import MapPicker from '@/components/MapPicker.jsx';
import FullscreenMapPicker from '@/components/FullscreenMapPicker.jsx';
import { findAdminWardByCoordinates } from '@/lib/adminWardLookup.js';
import { categories as defaultCategories } from '@/data/categories.js';
import { CheckCircle2, ArrowLeft, ArrowRight, Camera, Home, MapPin, Maximize2, Image, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { createIssue, fetchMeta } from '@/lib/api.js';
import { getCategoryLabel } from '@/lib/categoryLabel.js';
import imageCompression from 'browser-image-compression';

const REDIRECT_SECONDS = 4;

const ReportIssue = () => {
    const { t, language } = useTranslation();
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [location, setLocation] = useState(null);
    const [detectedWard, setDetectedWard] = useState(null);
    const [wardHintId, setWardHintId] = useState('');
    const [locationDescription, setLocationDescription] = useState('');
    const [category, setCategory] = useState(null);
    const [categoryOptions, setCategoryOptions] = useState(defaultCategories);
    const [wardOptions, setWardOptions] = useState([]);
    const [wardSourceInfo, setWardSourceInfo] = useState(null);
    const [photoPreview, setPhotoPreview] = useState([]);
    const [photoFiles, setPhotoFiles] = useState([]);
    const [compressing, setCompressing] = useState(false);
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('medium');
    const [anonymous, setAnonymous] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [ticketId, setTicketId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [duplicateIssues, setDuplicateIssues] = useState([]);
    const [wardError, setWardError] = useState('');
    const [isDetectingWard, setIsDetectingWard] = useState(false);
    const [redirectSeconds, setRedirectSeconds] = useState(REDIRECT_SECONDS);
    const [showFullscreenMap, setShowFullscreenMap] = useState(false);

    useEffect(() => {
        let isMounted = true;

        fetchMeta()
            .then((response) => {
                if (!isMounted) {
                    return;
                }

                if (Array.isArray(response.categories) && response.categories.length > 0) {
                    setCategoryOptions(response.categories);
                }

                if (Array.isArray(response.wards)) {
                    setWardOptions(response.wards);
                }

                if (response.wardDataSource) {
                    setWardSourceInfo(response.wardDataSource);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setCategoryOptions(defaultCategories);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!submitted) {
            return;
        }

        setRedirectSeconds(REDIRECT_SECONDS);

        const intervalId = window.setInterval(() => {
            setRedirectSeconds((current) => (current <= 1 ? 0 : current - 1));
        }, 1000);

        const timeoutId = window.setTimeout(() => {
            navigate('/');
        }, REDIRECT_SECONDS * 1000);

        return () => {
            window.clearInterval(intervalId);
            window.clearTimeout(timeoutId);
        };
    }, [navigate, submitted]);

    const handleLocationSelect = useCallback(async (lat, lng) => {
        setLocation({ lat, lng });
        setDetectedWard(null);
        setWardError('');
        setIsDetectingWard(true);

        try {
            const ward = await findAdminWardByCoordinates(lat, lng);

            if (!ward) {
                setWardError(t('report.outsideBoundary'));
                return;
            }

            setDetectedWard(ward);
            setWardHintId(String(ward.id));
        }
        catch (error) {
            setWardError(error.message || t('report.wardDetectError'));
        }
        finally {
            setIsDetectingWard(false);
        }
    }, [t]);

    const handlePhotoUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        setCompressing(true);
        const compressed = [];
        const previews = [];

        for (const file of files) {
            try {
                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                    fileType: 'image/jpeg',
                };
                const compressedFile = await imageCompression(file, options);
                compressed.push(compressedFile);

                const reader = new FileReader();
                const preview = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(compressedFile);
                });
                previews.push(preview);
            } catch (error) {
                console.error('Compression failed:', error);
                compressed.push(file);
                const reader = new FileReader();
                const preview = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                previews.push(preview);
            }
        }

        setPhotoFiles(prev => [...prev, ...compressed].slice(0, 5));
        setPhotoPreview(prev => [...prev, ...previews].slice(0, 5));
        setCompressing(false);
    };

    const removePhoto = (index) => {
        setPhotoFiles(prev => prev.filter((_, i) => i !== index));
        setPhotoPreview(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!location || !category) {
            return;
        }

        setSubmitting(true);
        setSubmitError('');
        setDuplicateIssues([]);

        const formData = new FormData();
        formData.append('category', category);
        formData.append('description', description || t('report.citizenReported'));
        formData.append('severity', severity);
        formData.append('anonymous', String(anonymous));
        formData.append('latitude', String(location.lat));
        formData.append('longitude', String(location.lng));
        formData.append('locationDescription', locationDescription.trim());

        if (photoFiles.length > 0) {
            photoFiles.forEach((file) => {
                formData.append('photos', file);
            });
        }

        try {
            const response = await createIssue(formData);
            setTicketId(response.issue.id);
            setSubmitted(true);
        }
        catch (error) {
            setSubmitError(error.message);
            setDuplicateIssues(error.payload?.duplicates || []);
        }
        finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setStep(1);
        setSubmitted(false);
        setLocation(null);
        setDetectedWard(null);
        setWardHintId('');
        setLocationDescription('');
        setCategory(null);
        setPhotoFiles([]);
        setPhotoPreview([]);
        setDescription('');
        setSeverity('medium');
        setAnonymous(false);
        setSubmitError('');
        setDuplicateIssues([]);
        setWardError('');
    };

    const severityOptions = [
        { value: 'low', label: t('report.low'), color: 'border-secondary bg-secondary/10' },
        { value: 'medium', label: t('report.medium'), color: 'border-warning bg-warning/10' },
        { value: 'high', label: t('report.high'), color: 'border-primary bg-primary/10' },
        { value: 'critical', label: t('report.critical'), color: 'border-destructive bg-destructive/10' },
    ];
    const severityLabelMap = {
        low: t('report.low'),
        medium: t('report.medium'),
        high: t('report.high'),
        critical: t('report.critical'),
    };

    const steps = [t('report.step1'), t('report.step2'), t('report.step3'), t('report.step4')];
    const shouldStickActionBarOnMobile = step !== 1;

    if (submitted) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-secondary/20">
                    <CheckCircle2 className="h-10 w-10 text-secondary" />
                </div>
                <h1 className="mb-2 text-3xl font-bold">{t('report.success')}</h1>
                <p className="mb-4 text-muted-foreground">{t('report.ticketId')}</p>
                <p className="font-mono text-2xl font-bold text-primary">{ticketId}</p>
                <p className="mt-4 text-sm text-muted-foreground">Redirecting to home in {redirectSeconds}s</p>
                <div className="mt-8 flex items-center justify-center gap-2">
                    <Button variant="outline" onClick={resetForm}>{t('nav.report')}</Button>
                    <Button onClick={() => navigate('/')} className="gap-1">
                        <Home className="h-4 w-4" />
                        {t('notFound.returnHome')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
            <h1 className="mb-6 text-2xl font-bold">{t('report.title')}</h1>

            {showFullscreenMap && (
                <FullscreenMapPicker
                    initialValue={location}
                    onLocationSelect={handleLocationSelect}
                    onClose={() => setShowFullscreenMap(false)}
                />
            )}

            <div className="mb-8 flex items-center gap-2">
                {steps.map((label, index) => (
                    <div key={label} className="flex-1">
                        <div className={cn('h-2 rounded-full transition-colors', index + 1 <= step ? 'bg-primary' : 'bg-muted')} />
                        <p className={cn('mt-1 text-center text-[11px] sm:text-xs', index + 1 === step ? 'font-medium text-primary' : 'text-muted-foreground')}>
                            {label}
                        </p>
                    </div>
                ))}
            </div>

            <Card>
                <CardContent className="p-4 sm:p-6 pb-24 sm:pb-6">
                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="font-semibold">{t('report.selectLocation')}</h3>
                                <p className="text-sm text-muted-foreground">{t('report.mapHint')}</p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>{t('report.wardFound')}</Label>
                                    <Select
                                        value={wardHintId}
                                        onValueChange={(value) => {
                                            setWardHintId(value);
                                            const ward = wardOptions.find((entry) => String(entry.id) === value);

                                            if (ward) {
                                                handleLocationSelect(ward.officeLat, ward.officeLng);
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select ward" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[1200]">
                                            {wardOptions.map((ward) => (
                                                <SelectItem key={ward.id} value={String(ward.id)}>
                                                    {language === 'mr' ? ward.nameMr : ward.nameEn}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="location-description">Location Description</Label>
                                    <Input
                                        id="location-description"
                                        value={locationDescription}
                                        onChange={(event) => setLocationDescription(event.target.value)}
                                        placeholder="Near school, lane, landmark"
                                        maxLength={200}
                                    />
                                </div>
                            </div>

                            {wardSourceInfo?.lastVerifiedOn ? (
                                <p className="text-xs text-muted-foreground">
                                    Ward data source: {wardSourceInfo.source} | Verified on {wardSourceInfo.lastVerifiedOn}
                                </p>
                            ) : null}

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">Map Location</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowFullscreenMap(true)}
                                        className="gap-2"
                                    >
                                        <Maximize2 className="h-4 w-4" />
                                        Open Full Map
                                    </Button>
                                </div>
                                <MapPicker value={location} onLocationSelect={handleLocationSelect} />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="issue-latitude">{t('report.latitude')}</Label>
                                    <Input
                                        id="issue-latitude"
                                        value={location ? location.lat.toFixed(6) : ''}
                                        placeholder={t('report.pickOnMap')}
                                        readOnly
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="issue-longitude">{t('report.longitude')}</Label>
                                    <Input
                                        id="issue-longitude"
                                        value={location ? location.lng.toFixed(6) : ''}
                                        placeholder={t('report.pickOnMap')}
                                        readOnly
                                    />
                                </div>
                            </div>

                            {isDetectingWard ? (
                                <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
                                    {t('report.autoDetect')}
                                </div>
                            ) : null}

                            {detectedWard && (
                                <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-sm">
                                    <span className="font-medium text-secondary">{t('report.wardFound')}:</span>{' '}
                                    {language === 'mr' ? detectedWard.nameMr : detectedWard.nameEn}
                                </div>
                            )}

                            {wardError ? (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                    {wardError}
                                </div>
                            ) : null}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="font-semibold">{t('report.selectCat')}</h3>
                            <CategoryPicker selected={category} onSelect={setCategory} options={categoryOptions} />
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-5">
                            <div>
                                <Label className="mb-3 block text-base font-semibold">{t('report.addPhoto')} (Max 5)</Label>
                                
                                {photoPreview.length > 0 && (
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {photoPreview.map((preview, index) => (
                                            <div key={index} className="relative group">
                                                <img 
                                                    src={preview} 
                                                    alt={`Preview ${index + 1}`} 
                                                    className="w-full h-32 rounded-lg object-cover border-2 border-border" 
                                                />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    onClick={() => removePhoto(index)}
                                                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {photoPreview.length < 5 && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-6 transition-all hover:border-primary hover:bg-primary/10 active:scale-95">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-md mb-3">
                                                <Camera className="h-6 w-6 text-white" />
                                            </div>
                                            <span className="text-sm font-medium text-center">Take Photo</span>
                                            <span className="text-xs text-muted-foreground mt-1">Use Camera</span>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                capture="environment"
                                                multiple
                                                className="hidden" 
                                                onChange={handlePhotoUpload}
                                                disabled={compressing}
                                            />
                                        </label>

                                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-green-500/50 bg-green-50 dark:bg-green-950/20 p-6 transition-all hover:border-green-500 hover:bg-green-100 dark:hover:bg-green-950/30 active:scale-95">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-md mb-3">
                                                <Image className="h-6 w-6 text-white" />
                                            </div>
                                            <span className="text-sm font-medium text-center">Choose Photos</span>
                                            <span className="text-xs text-muted-foreground mt-1">From Gallery</span>
                                            <input 
                                                type="file" 
                                                accept="image/*"
                                                multiple
                                                className="hidden" 
                                                onChange={handlePhotoUpload}
                                                disabled={compressing}
                                            />
                                        </label>
                                    </div>
                                )}

                                {compressing && (
                                    <p className="text-sm text-muted-foreground mt-2">Compressing images...</p>
                                )}
                            </div>

                            <div>
                                <Label className="mb-2 block">{t('report.addNote')}</Label>
                                <Textarea
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder={t('report.addNote')}
                                    rows={3}
                                />
                            </div>

                            <div>
                                <Label className="mb-2 block">{t('report.severity')}</Label>
                                <div className="grid grid-cols-4 gap-2">
                                    {severityOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => setSeverity(option.value)}
                                            className={cn(
                                                'rounded-lg border-2 py-2 text-sm font-medium transition-all',
                                                severity === option.value ? option.color : 'border-border'
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>{t('report.anonymous')}</Label>
                                <Switch checked={anonymous} onCheckedChange={setAnonymous} />
                            </div>
                            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
                            {duplicateIssues.length > 0 ? (
                                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                                    <p className="font-medium text-amber-900">Similar issues found nearby. You can open one and tap "Me Too".</p>
                                    <div className="space-y-2">
                                        {duplicateIssues.map((issue) => (
                                            <button
                                                key={issue.id}
                                                type="button"
                                                onClick={() => navigate(`/issues/${issue.id}`)}
                                                className="block w-full rounded-md border border-amber-300 bg-white p-2 text-left hover:bg-amber-100"
                                            >
                                                <p className="font-semibold">{issue.id}</p>
                                                <p className="text-xs text-muted-foreground line-clamp-1">{language === 'mr' ? issue.titleMr : issue.title}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
                                <p><strong>{t('report.locationSummary')}:</strong> {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '-'}</p>
                                <p><strong>{t('admin.ward')}:</strong> {detectedWard ? (language === 'mr' ? detectedWard.nameMr : detectedWard.nameEn) : '-'}</p>
                                <p><strong>Location Description:</strong> {locationDescription || '-'}</p>
                                <p><strong>{t('report.categorySummary')}:</strong> {category ? getCategoryLabel(category, t, categoryOptions) : '-'}</p>
                                <p><strong>{t('report.severity')}:</strong> {severityLabelMap[severity] || severity}</p>
                                <p><strong>{t('report.photoAttached')}:</strong> {photoPreview.length > 0 ? `${photoPreview.length} photo(s)` : t('common.no')}</p>
                            </div>
                        </div>
                    )}

                    <div
                        className={cn(
                            'mt-6 flex justify-between gap-2 rounded-xl border bg-background/95 p-3 backdrop-blur',
                            shouldStickActionBarOnMobile ? 'fixed bottom-20 left-0 right-0 mx-4 z-40' : 'static',
                            'sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:mx-0'
                        )}
                    >
                        {step > 1 ? (
                            <Button variant="outline" onClick={() => setStep(step - 1)} className="h-11 gap-1">
                                <ArrowLeft className="h-4 w-4" />
                                {t('report.back')}
                            </Button>
                        ) : (
                            <div />
                        )}
                        {step < 4 ? (
                            <Button onClick={() => setStep(step + 1)} disabled={(step === 1 && (!location || !detectedWard || isDetectingWard)) || (step === 2 && !category)} className="h-11 gap-1">
                                {t('report.next')}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleSubmit} className="h-11 gap-1" disabled={submitting}>
                                {t('report.submit')}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ReportIssue;
