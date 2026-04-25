import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils.js';

const statusIcons = {
    new: Circle,
    ack: Clock,
    inprog: Clock,
    resolved: CheckCircle2,
    verified: CheckCircle2,
    closed: CheckCircle2,
    reopened: AlertTriangle,
    escalated: AlertTriangle,
};

const StatusTimelineLocalized = ({ timeline }) => {
    const { t, language } = useTranslation();
    const locale = language === 'mr' ? 'mr-IN' : 'en-IN';

    return (
        <div className="space-y-0">
            {timeline.map((entry, index) => {
                const Icon = statusIcons[entry.status] || Circle;
                const isLast = index === timeline.length - 1;
                const date = new Date(entry.timestamp);

                return (
                    <div key={index} className="flex gap-3">
                        <div className="flex flex-col items-center">
                            <Icon className={cn('h-5 w-5 flex-shrink-0', isLast ? 'text-primary' : 'text-muted-foreground')} />
                            {!isLast ? <div className="my-1 w-0.5 flex-1 bg-border" /> : null}
                        </div>
                        <div className={cn('pb-4', isLast && 'pb-0')}>
                            <p className={cn('text-sm font-medium', isLast && 'text-primary')}>
                                {t(`status.${entry.status}`)}
                            </p>
                            {entry.note ? <p className="mt-0.5 text-xs text-muted-foreground">{entry.note}</p> : null}
                            <p className="text-xs text-muted-foreground">
                                {date.toLocaleDateString(locale)} · {date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default StatusTimelineLocalized;
