import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;
const DEFAULT_LOCALE = 'tr';

// Matches any valid 2-letter ISO locale code in URL path
const LOCALE_REGEX = /^\/([a-z]{2})(\/|$)/;

// Known reserved paths that should NOT be treated as locale prefixes
const RESERVED_PREFIXES = ['admin', 'account', 'agency', 'driver', 'track', 'login', 'register', 'contact', 'sayfa', 'rate', 'transfer', 'api', 'partner'];

// Supported languages for Accept-Language detection (must match tenant's supportedLanguages)
const KNOWN_LOCALES = ['tr', 'en', 'de', 'ru', 'ar', 'fr', 'es', 'it', 'nl', 'pt', 'ja', 'ko', 'zh', 'pl', 'uk', 'cs', 'sv', 'da', 'fi', 'el', 'hu', 'ro', 'bg'];

/**
 * Middleware handles locale routing:
 * - / → Turkish (default, no prefix)
 * - /{locale}/... → Any supported language
 * 
 * Detection priority:
 * 1. URL prefix (/en/, /de/) → rewrite and serve
 * 2. Explicit cookie (user switched language via UI) → redirect to their choice
 * 3. First visit (no cookie) → detect Accept-Language header → redirect
 * 4. Default: Turkish (no prefix)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, API routes, _next
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ─── 1. URL has locale prefix → rewrite to actual path ───
  const localeMatch = pathname.match(LOCALE_REGEX);
  const potentialLocale = localeMatch?.[1];

  if (potentialLocale && potentialLocale !== DEFAULT_LOCALE && !RESERVED_PREFIXES.includes(potentialLocale)) {
    const newPathname = pathname.replace(`/${potentialLocale}`, '') || '/';
    const url = request.nextUrl.clone();
    url.pathname = newPathname;
    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', potentialLocale);
    // Do NOT set cookie here — only the client language switcher sets the cookie
    // This prevents stale cookies from overriding user's explicit choice
    return response;
  }

  // ─── 2. No locale prefix — determine if redirect is needed ───
  const cookieLocale = request.cookies.get('locale')?.value;

  // 2a. User has explicitly set a language via the language switcher (cookie exists)
  if (cookieLocale && /^[a-z]{2}$/.test(cookieLocale) && !RESERVED_PREFIXES.includes(cookieLocale)) {
    if (cookieLocale !== DEFAULT_LOCALE) {
      // User explicitly chose a non-default language → redirect
      const url = request.nextUrl.clone();
      url.pathname = `/${cookieLocale}${pathname}`;
      return NextResponse.redirect(url);
    }
    // Cookie is 'tr' (default) → serve normally
    const response = NextResponse.next();
    response.headers.set('x-locale', DEFAULT_LOCALE);
    return response;
  }

  // ─── 3. First visit (no cookie) → detect from Accept-Language header ───
  const acceptLang = request.headers.get('accept-language') || '';
  const detectedLocale = detectFromAcceptLanguage(acceptLang);

  if (detectedLocale && detectedLocale !== DEFAULT_LOCALE) {
    // First-time visitor with non-Turkish browser → redirect to their language
    const url = request.nextUrl.clone();
    url.pathname = `/${detectedLocale}${pathname}`;
    const response = NextResponse.redirect(url);
    // Set cookie so we don't detect again on every page load
    response.cookies.set('locale', detectedLocale, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
    return response;
  }

  // ─── 4. Default: Turkish ───
  const response = NextResponse.next();
  response.headers.set('x-locale', DEFAULT_LOCALE);
  // Set cookie to mark that we've already detected (prevents re-detection)
  if (!cookieLocale) {
    response.cookies.set('locale', DEFAULT_LOCALE, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
  }
  return response;
}

/**
 * Parse Accept-Language header and return best matching locale.
 * Example header: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7,tr;q=0.6"
 * Returns: 'de'
 */
function detectFromAcceptLanguage(header: string): string | null {
  if (!header) return null;

  const langs = header.split(',').map(part => {
    const [lang, qPart] = part.trim().split(';');
    const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1.0;
    const code = lang.split('-')[0].toLowerCase();
    return { code, q };
  }).sort((a, b) => b.q - a.q);

  for (const { code } of langs) {
    if (code && KNOWN_LOCALES.includes(code) && code !== DEFAULT_LOCALE) {
      return code;
    }
  }

  return null;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)).*)',
  ],
};
