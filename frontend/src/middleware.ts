import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;
const SUPPORTED_LOCALES = ['tr', 'en', 'de', 'ru'];
const DEFAULT_LOCALE = 'tr';

/**
 * Middleware handles locale routing:
 * - / → Turkish (default, no prefix)
 * - /en/... → English
 * - /de/... → German
 * - /ru/... → Russian
 * 
 * For first-time visitors without a locale preference,
 * detects browser language and redirects accordingly.
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

  // Check if URL already has a locale prefix
  const pathnameLocale = SUPPORTED_LOCALES.find(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameLocale) {
    // URL has locale prefix — rewrite to actual path and pass locale as header
    const newPathname = pathname.replace(`/${pathnameLocale}`, '') || '/';
    const url = request.nextUrl.clone();
    url.pathname = newPathname;
    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', pathnameLocale);
    response.cookies.set('locale', pathnameLocale, { path: '/', maxAge: 365 * 24 * 60 * 60 });
    return response;
  }

  // No locale prefix — check if user should be redirected to a non-default locale
  // If locale cookie exists and it's not TR, redirect
  const cookieLocale = request.cookies.get('locale')?.value;
  
  if (cookieLocale && cookieLocale !== DEFAULT_LOCALE && SUPPORTED_LOCALES.includes(cookieLocale)) {
    // User has a non-default locale preference — redirect to locale-prefixed URL
    const url = request.nextUrl.clone();
    url.pathname = `/${cookieLocale}${pathname}`;
    return NextResponse.redirect(url);
  }

  // No cookie — detect from Accept-Language header for first-time visitors
  // But DON'T redirect on first visit — let them see TR and choose
  // Only set header for SSR locale detection
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
