import React from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetNewsArticle } from '@workspace/api-client-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ArrowLeft, Clock, ExternalLink, Newspaper, MapPin, ShieldAlert, Briefcase, Landmark, Trophy, Users } from 'lucide-react';
import { cn } from '../lib/utils';

const SUBCATEGORY_ICONS: Record<string, React.ElementType> = {
  city: MapPin,
  politics: Landmark,
  safety: ShieldAlert,
  culture: Newspaper,
  sport: Trophy,
  business: Briefcase,
  community: Users,
};

const SUBCATEGORY_LABELS: Record<string, string> = {
  city: 'Stadsnieuws',
  politics: 'Politiek',
  safety: 'Veiligheid',
  culture: 'Cultuur',
  sport: 'Sport',
  business: 'Zakelijk',
  community: 'Samenleving',
};

const decodeHtml = (str: string) => {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
};

export default function NewsArticleView() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const articleId = params.id ? parseInt(params.id, 10) : 0;

  const { data: article, isLoading, isError } = useGetNewsArticle(articleId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F2F0EA] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-[#072C1E] border-t-[#F36C21] rounded-full animate-spin mb-4" />
          <p className="text-[#072C1E] font-bold tracking-widest uppercase">Nieuws laden...</p>
        </div>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="min-h-screen bg-[#F2F0EA] flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <Newspaper className="w-16 h-16 text-[#072C1E]/20 mx-auto mb-6" />
          <h1 className="text-3xl font-black text-[#072C1E] mb-4">Artikel niet gevonden</h1>
          <p className="text-[#072C1E]/70 mb-8">
            Het artikel dat je zoekt bestaat niet of is verwijderd.
          </p>
          <button 
            onClick={() => setLocation('/nieuws')}
            className="px-8 py-3 bg-[#072C1E] text-[#F2F0EA] font-bold rounded-full hover:bg-[#0A3B2A] transition-colors"
          >
            Terug naar overzicht
          </button>
        </div>
      </div>
    );
  }

  const Icon = SUBCATEGORY_ICONS[article.subcategory] || Newspaper;

  return (
    <div className="min-h-screen bg-[#F2F0EA] text-[#1A1C1B] font-sans selection:bg-[#F36C21] selection:text-white pb-24">
      {/* Top Nav */}
      <div className="sticky top-0 z-40 bg-[#F2F0EA]/90 backdrop-blur-xl border-b border-[#072C1E]/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button 
            onClick={() => setLocation('/nieuws')}
            className="group flex items-center gap-2 text-[#072C1E] hover:text-[#F36C21] transition-colors font-bold text-sm tracking-wide uppercase"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Nieuws
          </button>
          
          <a 
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[#072C1E]/50 hover:text-[#072C1E] transition-colors font-bold text-xs uppercase tracking-widest"
          >
            Lees bij {article.sourceName} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 pt-16 md:pt-24">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-4 mb-8">
            <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wider text-[#F36C21]">
              <Icon className="w-4 h-4" />
              {SUBCATEGORY_LABELS[article.subcategory] || article.subcategory}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#072C1E]/20" />
            <span className="flex items-center gap-2 text-sm font-bold text-[#072C1E]/50 uppercase tracking-widest">
              <Clock className="w-4 h-4" />
              {article.publishedAt 
                ? format(parseISO(article.publishedAt), 'd MMMM yyyy, HH:mm', { locale: nl })
                : 'Recent'}
            </span>
          </div>

          <h1 className="font-serif font-bold text-[#072C1E] text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-8">
            {decodeHtml(article.title)}
          </h1>

          <div className="h-1 w-24 bg-[#F36C21] mb-8" />

          {/* Lead Paragraph / Summary */}
          <p className="text-xl md:text-2xl text-[#072C1E]/80 font-medium leading-relaxed">
            {decodeHtml(article.summary)}
          </p>
        </header>

        {/* Call to action to read full */}
        <div className="mt-16 p-8 md:p-12 bg-[#072C1E] text-[#F2F0EA] rounded-[2rem] text-center shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#F36C21] rounded-full blur-[80px] pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
          
          <h2 className="text-2xl md:text-3xl font-bold mb-4 relative z-10">Lees het volledige verhaal</h2>
          <p className="text-[#F2F0EA]/70 mb-8 max-w-md mx-auto relative z-10">
            Dit artikel is gepubliceerd door {article.sourceName}. Lees verder op hun website voor de volledige context en details.
          </p>
          
          <a 
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-[#F36C21] text-white font-black text-lg rounded-full hover:bg-[#FF8540] hover:-translate-y-1 transition-all duration-300 shadow-xl shadow-[#F36C21]/20 relative z-10"
          >
            Lees verder bij {article.sourceName}
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </article>
    </div>
  );
}
