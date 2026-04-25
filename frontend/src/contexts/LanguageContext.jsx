import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations } from '@/data/translations.clean.js';
const LanguageContext = createContext(undefined);
export const LanguageProvider = ({ children }) => {
    const [language, setLang] = useState(() => {
        return localStorage.getItem('civicpulse_lang') || 'mr';
    });
    const setLanguage = useCallback((lang) => {
        setLang(lang);
        localStorage.setItem('civicpulse_lang', lang);
    }, []);
    const toggleLanguage = useCallback(() => {
        setLanguage(language === 'en' ? 'mr' : 'en');
    }, [language, setLanguage]);
    const t = useCallback((key) => {
        return translations[key]?.[language] || key;
    }, [language]);
    return (<LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>);
};
export const useTranslation = () => {
    const context = useContext(LanguageContext);
    if (!context)
        throw new Error('useTranslation must be used within LanguageProvider');
    return context;
};
