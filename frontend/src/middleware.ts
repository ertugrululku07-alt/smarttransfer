import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;
const DEFAULT_LOCALE = 'tr';

// Matches any valid 2-letter ISO locale code in URL path
// This allows dynamically added languages (ar, fr, es, etc.) to work
const LOCALE_REGEX = /^\/([a-z]{2})(\/|$)/;

// Known reserved paths that should NOT be treated as locale prefixes
const RESERVED_PREFIXES = ['admin', 'account', 'agency', 'driver', 'track', 'login', 'register', 'contact', 'sayfa', 'rate', 'transfer', 'api'];

/**
 * Middleware handles locale routing:
 * - / → Turkish (default, no prefix)
 * - /{locale}/... → Any language supported by the tenant
 * 
 * Languages are dynamic — added from admin panel.
 * Any valid 2-letter code that isn't a reserved path is treated as a locale.
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

  // Check if URL has a 2-letter locale prefix
  const localeMatch = pathname.match(LOCALE_REGEX);
  const potentialLocale = localeMatch?.[1];

  if (potentialLocale && potentialLocale !== DEFAULT_LOCALE && !RESERVED_PREFIXES.includes(potentialLocale)) {
    // URL has locale prefix — rewrite to actual path and pass locale as header
    const newPathname = pathname.replace(`/${potentialLocale}`, '') || '/';
    const url = request.nextUrl.clone();
    url.pathname = newPathname;
    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', potentialLocale);
    response.cookies.set('locale', potentialLocale, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    return response;
  }

  // No locale prefix — check if user should be redirected to a non-default locale
  const cookieLocale = request.cookies.get('locale')?.value;
  
  if (cookieLocale && cookieLocale !== DEFAULT_LOCALE && /^[a-z]{2}$/.test(cookieLocale) && !RESERVED_PREFIXES.includes(cookieLocale)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${cookieLocale}${pathname}`;
    return NextResponse.redirect(url);
  }

  // Default locale — no prefix needed
  const response = NextResponse.next();
  response.headers.set('x-locale', DEFAULT_LOCALE);
  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)).*)',
  ],
};
