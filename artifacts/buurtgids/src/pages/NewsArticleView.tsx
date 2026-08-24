import React from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetNewsArticle } from '@workspace/api-client-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  ArrowLeft, Clock, ExternalLink, Newspaper,
  MapPin, ShieldAlert, Briefcase, Landmark, Trophy, Users
} from 'lucide-react';
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
      <div className="min-h-screen bg-[#F2F0EA] flex items-center justify-center flex-col">
        <div className="w-12 h-12 border-4 border-[#072C1E]/20 border-t-[#F36C21] rounded-full animate-spin mb-6" />
        <p className="text-[#072C1E]/60 font-bold tracking-widest uppercase text-sm">Artikel laden...</p>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="min-h-screen bg-[#F2F0EA] flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#072C1E]/10 mx-auto mb-8">
            <Newspaper className="w-8 h-8 text-[#072C1E]/30" />
          </div>
          <h1 className="font-serif text-3xl font-black text-[#072C1E] mb-4">Artikel niet gevonden</h1>
          <p className="text-[#072C1E]/60 mb-8">
            Het artikel dat je zoekt bestaat niet meer of de link is onjuist.
          </p>
          <button 
            onClick={() => setLocation('/nieuws')}
            className="px-8 py-3 bg-[#072C1E] text-[#F2F0EA] font-bold rounded-full hover:bg-[#F36C21] transition-colors uppercase tracking-widest text-sm"
          >
            Terug naar nieuws
          </button>
        </div>
      </div>
    );
  }

  const Icon = SUBCATEGORY_ICONS[article.subcategory] || Newspaper;

  return (
    <div className="min-h-screen bg-[#F2F0EA] text-[#1A1C1B] font-sans selection:bg-[#F36C21] selection:text-white flex flex-col">
      {/* Top Nav */}
      <header className="bg-[#F2F0EA] border-b border-[#072C1E]/10 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={() => setLocation('/nieuws')}
            className="group flex items-center gap-2 text-xs font-bold text-[#072C1E]/60 hover:text-[#072C1E] transition-colors uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Terug naar overzicht
          </button>
          
          <a 
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[#072C1E]/50 hover:text-[#F36C21] transition-colors text-xs font-bold uppercase tracking-widest"
          >
            <span className="hidden sm:inline">Origineel op</span> {article.sourceName} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* Article Content */}
      <article className="flex-1 max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-32 w-full">
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-[#F36C21] flex items-center gap-1.5">
            <Icon className="w-4 h-4" />
            {SUBCATEGORY_LABELS[article.subcategory] || article.subcategory}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#072C1E]/20" />
          <span className="text-xs font-bold text-[#072C1E]/50 uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            {article.publishedAt
              ? format(parseISO(article.publishedAt), 'd MMMM yyyy, HH:mm', { locale: nl })
              : 'Recent'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#072C1E]/20" />
          <span className="text-xs font-bold text-[#072C1E]/50 uppercase tracking-widest">
            {article.sourceName}
          </span>
        </div>

        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-black text-[#072C1E] leading-[1.1] tracking-tight mb-10">
          {decodeHtml(article.title)}
        </h1>

        <div className="w-16 h-1 bg-[#F36C21] mb-12" />

        <p className="text-xl md:text-2xl text-[#072C1E]/80 font-serif leading-relaxed mb-16">
          {decodeHtml(article.summary)}
        </p>

        {/* Call to action */}
        <div className="border-t border-[#072C1E]/20 pt-16 mt-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#072C1E]/5 rounded-full flex items-center justify-center mb-6">
            <Newspaper className="w-8 h-8 text-[#072C1E]/40" />
          </div>
          <h2 className="font-serif text-3xl font-bold text-[#072C1E] mb-4">Lees het volledige artikel</h2>
          <p className="text-[#072C1E]/70 mb-8 max-w-md font-medium">
            Dit nieuwsbericht is afkomstig van <strong className="text-[#072C1E]">{article.sourceName}</strong>. Om het hele verhaal te lezen, inclusief eventuele foto's en details, ga je naar hun website.
          </p>
          
          <a 
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-[#072C1E] text-[#F2F0EA] font-bold text-sm md:text-base uppercase tracking-wider rounded-none hover:bg-[#F36C21] hover:-translate-y-1 transition-all duration-300 shadow-xl shadow-[#072C1E]/10"
          >
            Lees verder op {article.sourceName}
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </article>

      {/* Footer */}
      <footer className="bg-[#072C1E] border-t border-[#072C1E]/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 flex flex-col items-center text-center">
          <p className="text-[#F2F0EA]/50 text-xs font-bold tracking-widest uppercase mb-6">Onderdeel van</p>
          <img
            src="/marqtplaza-logo.png"
            alt="marqtplaza.com"
            className="h-10 w-auto opacity-70 hover:opacity-100 transition-opacity"
          />
        </div>
      </footer>
    </div>
  );
}
