'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/app/context/LanguageContext';

interface TranslatedTextProps {
  text: string;
  as?: 'span' | 'div' | 'p' | 'strong' | 'em';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders dynamic text (from DB/API) with automatic translation.
 * Shows the original text immediately, then replaces with translated version when ready.
 */
const TranslatedText: React.FC<TranslatedTextProps> = ({ text, as = 'span', className, style }) => {
  const { translateDynamic, locale } = useLanguage();
  const [translated, setTranslated] = useState(text);

  useEffect(() => {
    if (!text || locale === 'tr') {
      setTranslated(text);
      return;
    }

    let cancelled = false;
    translateDynamic(text).then((result) => {
      if (!cancelled) setTranslated(result);
    });

    return () => { cancelled = true; };
  }, [text, locale, translateDynamic]);

  const Tag = as;
  return React.createElement(Tag, { className, style }, translated);
};

export default TranslatedText;
