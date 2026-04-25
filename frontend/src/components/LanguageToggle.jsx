import { useTranslation } from '@/contexts/LanguageContext.jsx';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
const LanguageToggle = () => {
    const { toggleLanguage, t } = useTranslation();
    return (<Button variant="outline" size="sm" onClick={toggleLanguage} className="gap-1.5 font-medium">
      <Globe className="h-4 w-4"/>
      {t('common.language')}
    </Button>);
};
export default LanguageToggle;
