import { useContext } from 'react';
import { LanguageContext } from '@/contexts/languageContextStore.js';

export function useTranslation() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useTranslation must be used within LanguageProvider');
    }
    return context;
}
