import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TAB_ROUTES = new Set(['raft', 'trawler', 'boarding', 'bottles', 'docs']);

export function middleware(request: NextRequest) {
  const segment = request.nextUrl.pathname.slice(1); // strip leading /
  if (TAB_ROUTES.has(segment)) {
    return NextResponse.rewrite(new URL('/', request.url));
  }
}

export const config = {
  matcher: ['/((?!api|_next|icon\\.png|favicon\\.ico).*)'],
};
