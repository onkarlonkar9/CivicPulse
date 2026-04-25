import { useEffect, useState } from 'react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import IssueCard from '@/components/IssueCard.jsx';
import { FileWarning, CheckCircle2, MapPin, Clock, ArrowRight } from 'lucide-react';
import { fetchDashboardSummary } from '@/lib/api.js';
const Landing = () => {
    const { t } = useTranslation();
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let isMounted = true;
        fetchDashboardSummary()
            .then((response) => {
                if (isMounted) {
                    setSummary(response);
                }
            })
            .catch((loadError) => {
                if (isMounted) {
                    setError(loadError.message);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);
    const stats = [
        { label: t('landing.totalIssues'), value: summary?.stats.total ?? '...', icon: FileWarning, color: 'text-primary' },
        { label: t('landing.resolved'), value: summary?.stats.resolved ?? '...', icon: CheckCircle2, color: 'text-secondary' },
        { label: t('landing.activeWards'), value: summary?.stats.activeWards ?? '...', icon: MapPin, color: 'text-accent' },
        { label: t('landing.avgResolution'), value: summary?.stats.avgResolutionDays == null ? '...' : `${summary.stats.avgResolutionDays} ${t('landing.days')}`, icon: Clock, color: 'text-primary' },
    ];
    return (<div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10 py-12 md:py-24">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            {t('landing.pmcLabel')}
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight md:text-6xl">
            {t('landing.title')}
          </h1>
          <p className="mb-3 text-lg font-semibold text-primary md:text-xl">
            {t('landing.tagline')}
          </p>
          <p className="mx-auto mb-8 max-w-2xl text-sm text-muted-foreground md:text-base">
            {t('landing.subtitle')}
          </p>
          <div className="mx-auto flex max-w-sm flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
            <Link to="/report" className="w-full sm:w-auto">
              <Button size="lg" className="h-12 w-full gap-2 text-base sm:w-auto">
                <FileWarning className="h-5 w-5"/>
                {t('landing.reportCta')}
              </Button>
            </Link>
            <Link to="/issues" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="h-12 w-full gap-2 text-base sm:w-auto">
                {t('landing.viewIssues')}
                <ArrowRight className="h-5 w-5"/>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 mx-auto -mt-6 max-w-7xl px-4 md:-mt-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((stat) => (<Card key={stat.label} className="text-center">
              <CardContent className="p-4 md:p-6">
                <stat.icon className={`h-6 w-6 mx-auto mb-2 ${stat.color}`}/>
                <p className="text-2xl font-bold md:text-3xl">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>))}
        </div>
      </section>

      {/* Recent Issues */}
      <section className="mx-auto max-w-7xl px-4 py-10 md:py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold md:text-2xl">{t('landing.recentIssues')}</h2>
          <Link to="/issues">
            <Button variant="ghost" className="gap-1">
              {t('landing.viewIssues')}
              <ArrowRight className="h-4 w-4"/>
            </Button>
          </Link>
        </div>
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(summary?.recentIssues || []).map((issue) => (<IssueCard key={issue.id} issue={issue}/>))}
        </div>
      </section>
    </div>);
};
export default Landing;
