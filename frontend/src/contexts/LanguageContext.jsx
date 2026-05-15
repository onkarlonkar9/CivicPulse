import React, { useState, useCallback, useEffect } from 'react';
import { translations } from '@/data/translations.clean.js';
import { LanguageContext } from '@/contexts/languageContextStore.js';

const SUPPORTED_LANGUAGES = ['en', 'mr'];

export const LanguageProvider = ({ children }) => {
    const [language, setLang] = useState(() => {
        const savedLanguage = localStorage.getItem('civicpulse_lang');
        return SUPPORTED_LANGUAGES.includes(savedLanguage) ? savedLanguage : 'mr';
    });

    const setLanguage = useCallback((lang) => {
        if (!SUPPORTED_LANGUAGES.includes(lang)) {
            return;
        }
        setLang(lang);
        localStorage.setItem('civicpulse_lang', lang);
    }, []);

    const toggleLanguage = useCallback(() => {
        setLang((currentLanguage) => {
            const nextLanguage = currentLanguage === 'en' ? 'mr' : 'en';
            localStorage.setItem('civicpulse_lang', nextLanguage);
            return nextLanguage;
        });
    }, []);

    useEffect(() => {
        document.documentElement.lang = language === 'mr' ? 'mr-IN' : 'en-IN';
    }, [language]);

    const t = useCallback((key) => {
        return translations[key]?.[language] || key;
    }, [language]);
    return (<LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>);
};
