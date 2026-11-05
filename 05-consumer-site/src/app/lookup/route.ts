import { NextResponse, type NextRequest } from 'next/server';
import { isValidSscc } from '@/contract/contract';
import { pickLang, withLang } from '@/lib/lang';

/** Manual lot-number entry on the home page. Works without JavaScript: a plain GET form that redirects to the GS1 Digital Link route. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lang = pickLang(q.get('lang') ?? undefined);
  const sscc = (q.get('sscc') ?? '').replace(/[\s-]/g, '');
  const target = isValidSscc(sscc) ? withLang(`/00/${sscc}`, lang) : withLang('/?invalid=1', lang);
  return NextResponse.redirect(new URL(target, req.url));
}
