import { useTranslation } from '@/contexts/useTranslation.js';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
const LanguageToggle = () => {
    const { language, toggleLanguage, t } = useTranslation();
    return (<Button variant="outline" size="sm" onClick={toggleLanguage} className="gap-1.5 font-medium">
      <Globe className="h-4 w-4"/>
      {language === 'mr' ? t('common.english') : t('common.marathi')}
    </Button>);
};
export default LanguageToggle;
