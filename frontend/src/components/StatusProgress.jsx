import { Check, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/contexts/LanguageContext.jsx';

const statusFlow = ['new', 'ack', 'inprog', 'resolved'];

export default function StatusProgress({ currentStatus, estimatedDays }) {
    const { t } = useTranslation();

    const getStatusIndex = (status) => {
        if (status === 'verified' || status === 'closed') return 4;
        if (status === 'reopened') return 2;
        if (status === 'escalated') return 3;
        return statusFlow.indexOf(status);
    };

    const currentIndex = getStatusIndex(currentStatus);

    const getStepStatus = (index) => {
        if (index < currentIndex) return 'completed';
        if (index === currentIndex) return 'current';
        return 'pending';
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                {statusFlow.map((status, index) => {
                    const stepStatus = getStepStatus(index);
                    const isLast = index === statusFlow.length - 1;

                    return (
                        <div key={status} className="flex flex-1 items-center">
                            <div className="flex flex-col items-center">
                                <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                                        stepStatus === 'completed'
                                            ? 'border-secondary bg-secondary text-white'
                                            : stepStatus === 'current'
                                              ? 'border-primary bg-primary text-white'
                                              : 'border-gray-300 bg-white text-gray-400'
                                    }`}
                                >
                                    {stepStatus === 'completed' ? (
                                        <Check className="h-4 w-4" />
                                    ) : stepStatus === 'current' ? (
                                        <Clock className="h-4 w-4" />
                                    ) : (
                                        <div className="h-2 w-2 rounded-full bg-gray-300" />
                                    )}
                                </div>
                                <p className="mt-1 text-xs font-medium">{t(`status.${status}`)}</p>
                            </div>
                            {!isLast && (
                                <div
                                    className={`mx-1 h-0.5 flex-1 transition-colors ${
                                        index < currentIndex ? 'bg-secondary' : 'bg-gray-300'
                                    }`}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {estimatedDays && currentStatus !== 'resolved' && currentStatus !== 'verified' && currentStatus !== 'closed' && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-blue-900">
                        Estimated resolution: <strong>{estimatedDays} {estimatedDays === 1 ? 'day' : 'days'}</strong>
                    </span>
                </div>
            )}

            {(currentStatus === 'resolved' || currentStatus === 'verified' || currentStatus === 'closed') && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-900">
                        <strong>Issue resolved!</strong> Thank you for your patience.
                    </span>
                </div>
            )}
        </div>
    );
}
