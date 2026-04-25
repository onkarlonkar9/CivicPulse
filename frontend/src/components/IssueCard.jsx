import { Card, CardContent } from '@/components/ui/card.jsx';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import { MapPin, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge.jsx';
import { getCategoryLabel } from '@/lib/categoryLabel.js';

const IssueCard = ({ issue }) => {
    const { language, t } = useTranslation();
    const title = language === 'mr' ? issue.titleMr : issue.title;
    const ward = language === 'mr' ? issue.wardNameMr : issue.wardName;
    const timeAgo = getTimeAgo(issue.createdAt, language);
    
    return (
        <Link to={`/issues/${issue.id}`}>
            <Card className="overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="flex flex-col sm:flex-row">
                    <div className="h-48 w-full sm:h-auto sm:w-40 flex-shrink-0">
                        <img src={issue.imageUrl} alt={title} className="h-full w-full object-cover"/>
                    </div>
                    <CardContent className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={issue.status}/>
                            <Badge variant="outline">{getCategoryLabel(issue.category, t)}</Badge>
                            {issue.adminVerified ? (
                                <Badge variant="secondary" className="gap-1">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Verified
                                </Badge>
                            ) : null}
                        </div>
                        <h3 className="font-semibold leading-tight line-clamp-2">{title}</h3>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5"/>
                                {ward}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5"/>
                                {timeAgo}
                            </span>
                        </div>
                        {issue.estimatedResolutionDays && !['resolved', 'verified', 'closed'].includes(issue.status) && (
                            <div className="flex items-center gap-1 text-xs text-blue-600">
                                <AlertCircle className="h-3 w-3" />
                                <span>Est. {issue.estimatedResolutionDays}d</span>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-auto">
                            {issue.id}
                        </p>
                    </CardContent>
                </div>
            </Card>
        </Link>
    );
};

function getTimeAgo(dateStr, language) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    const locale = language === 'mr' ? 'mr' : 'en';
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (hours < 1) {
        return formatter.format(0, 'hour');
    }

    if (hours < 24) {
        return formatter.format(-hours, 'hour');
    }

    const days = Math.floor(hours / 24);
    return formatter.format(-days, 'day');
}

export default IssueCard;
