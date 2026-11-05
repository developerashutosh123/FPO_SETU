import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isValidSscc } from '@/contract/contract';
import { ProvenanceView } from '@/components/Provenance';
import { Shell } from '@/components/Shell';
import { getProvenance } from '@/lib/api';
import { dictFor, fill, pickLang, withLang } from '@/lib/lang';

type Props = { params: Promise<{ sscc: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// The data fetch is cached for 60 s (lib/api.ts). The language comes from ?lang=, so the page itself renders per request.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { sscc } = await params;
  const t = dictFor(pickLang((await searchParams).lang));
  if (!isValidSscc(sscc)) return { title: t.notFound.title, robots: { index: false } };
  const r = await getProvenance(sscc);
  if (r.status !== 'ok') return { title: r.status === 'not_found' ? t.notFound.title : t.unreachable.title, robots: { index: false } };
  return { title: `${t.commodity[r.data.commodity]} · ${r.data.village}`, robots: { index: false } };
}

function Message({ title, body, back }: { title: string; body: string; back: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[2rem] font-bold leading-tight tracking-tight">{title}</h1>
      <p className="mt-4 text-lg text-ink-2">{body}</p>
      <p className="mt-6">{back}</p>
    </div>
  );
}

export default async function LotPage({ params, searchParams }: Props) {
  const { sscc } = await params;
  const lang = pickLang((await searchParams).lang);
  const t = dictFor(lang);
  const path = `/00/${sscc}`;
  const back = (
    <Button asChild variant="outline" size="sm">
      <Link href={withLang('/', lang)}>
        <ArrowLeft aria-hidden />
        {t.lot.back}
      </Link>
    </Button>
  );

  let body: React.ReactNode;
  if (!isValidSscc(sscc)) {
    body = <Message title={t.notFound.title} body={fill(t.notFound.bad, { sscc: sscc.slice(0, 24) })} back={back} />;
  } else {
    const r = await getProvenance(sscc);
    if (r.status === 'ok') {
      body = (
        <>
          <p className="mb-5">{back}</p>
          <ProvenanceView p={r.data} t={t} indexOnly={r.mode === 'index-only'} />
        </>
      );
    } else if (r.status === 'not_found') {
      body = <Message title={t.notFound.title} body={fill(t.notFound.body, { sscc })} back={back} />;
    } else {
      body = <Message title={t.unreachable.title} body={t.unreachable.body} back={back} />;
    }
  }
  return <Shell lang={lang} t={t} path={path}>{body}</Shell>;
}
