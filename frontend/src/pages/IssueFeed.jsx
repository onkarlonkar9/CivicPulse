import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import IssueCard from '@/components/IssueCard.jsx';
import StatusProgress from '@/components/StatusProgress.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Map } from 'lucide-react';
import { fetchIssues, fetchMeta } from '@/lib/api.js';

const statusFilters = ['all', 'new', 'ack', 'inprog', 'resolved', 'escalated'];

const IssueFeed = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('all');
    const [catFilter, setCatFilter] = useState('all');
    const [categories, setCategories] = useState([]);
    const [issues, setIssues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;

        fetchMeta()
            .then((response) => {
                if (isMounted) {
                    setCategories(response.categories || []);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setCategories([]);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadIssues = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetchIssues({
                    status: statusFilter,
                    category: catFilter,
                });

                if (isMounted) {
                    setIssues(response.issues);
                }
            }
            catch (loadError) {
                if (isMounted) {
                    setError(loadError.message);
                }
            }
            finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadIssues();

        return () => {
            isMounted = false;
        };
    }, [catFilter, statusFilter]);

    return (
        <div className="mx-auto max-w-4xl px-4 py-8">
            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-2xl font-bold">{t('feed.title')}</h1>
                <Button variant="outline" size="sm" onClick={() => navigate('/map')} className="gap-2">
                    <Map className="h-4 w-4" />
                    View Map
                </Button>
            </div>

            <div className="mb-3">
                <p className="mb-2 text-sm font-medium text-muted-foreground">Status</p>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                    {statusFilters.map((status) => (
                        <Button key={status} variant={statusFilter === status ? 'default' : 'outline'} size="sm" className="shrink-0" onClick={() => setStatusFilter(status)}>
                            {status === 'all' ? t('feed.all') : t(`status.${status}`)}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <p className="mb-2 text-sm font-medium text-muted-foreground">Category</p>
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                    <Button variant={catFilter === 'all' ? 'secondary' : 'ghost'} size="sm" className="shrink-0" onClick={() => setCatFilter('all')}>
                        {t('feed.all')}
                    </Button>
                    {categories.slice(0, 8).map((category) => (
                        <Button
                            key={category.id}
                            variant={catFilter === category.id ? 'secondary' : 'ghost'}
                            size="sm"
                            className="shrink-0"
                            onClick={() => setCatFilter(category.id)}
                        >
                            {t(category.translationKey)}
                        </Button>
                    ))}
                </div>
            </div>

            {loading ? <p className="py-12 text-center text-muted-foreground">{t('common.loading')}</p> : null}
            {error ? <p className="py-12 text-center text-destructive">{error}</p> : null}

            {!loading && !error ? (
                <div className="grid gap-4">
                    {issues.length > 0 ? issues.map((issue) => <IssueCard key={issue.id} issue={issue} />) : <p className="py-12 text-center text-muted-foreground">{t('feed.noIssues')}</p>}
                </div>
            ) : null}
        </div>
    );
};

export default IssueFeed;
