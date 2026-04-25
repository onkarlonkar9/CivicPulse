import { Badge } from '@/components/ui/badge.jsx';
import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { getStatusColor } from '@/data/status.js';
const StatusBadge = ({ status }) => {
    const { t } = useTranslation();
    return (<Badge className={`${getStatusColor(status)} border-0`}>
      {t(`status.${status === 'inprog' ? 'inprog' : status}`)}
    </Badge>);
};
export default StatusBadge;
