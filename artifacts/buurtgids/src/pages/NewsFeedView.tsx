import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useGetNews, type NewsSubcategory } from '@workspace/api-client-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  ArrowLeft, Clock, ExternalLink, Newspaper, 
  MapPin, ShieldAlert, Briefcase, Landmark, Trophy, Users, ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';

const SUBCATEGORY_ICONS: Record<NewsSubcategory, React.ElementType> = {
  city: MapPin,
  politics: Landmark,
  safety: ShieldAlert,
  culture: Newspaper,
  sport: Trophy,
  business: Briefcase,
  community: Users,
};

const SUBCATEGORY_LABELS: Record<NewsSubcategory, string> = {
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

export default function NewsFeedView() {
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<NewsSubcategory | 'all'>('all');

  const { data, isLoading, isError, refetch } = useGetNews(
    selectedCategory === 'all' ? undefined : { subcategory: selectedCategory }
  );

  const articles = data?.articles || [];
  const availableSubcategories = data?.availableSubcategories || [];

  return (
    <div className="min-h-screen bg-[#F2F0EA] text-[#1A1C1B] font-sans selection:bg-[#F36C21] selection:text-white flex flex-col">
      {/* TOP HEADER WITH LOGO */}
      <header className="border-b border-[#072C1E]/10 bg-[#F2F0EA] relative z-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-24 flex items-center justify-between">
          <button 
            onClick={() => setLocation('/')}
            className="group flex items-center gap-2 text-xs md:text-sm font-bold text-[#072C1E]/60 hover:text-[#072C1E] transition-colors uppercase tracking-wider w-[100px]"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="hidden sm:inline">Terug</span>
          </button>

          <div className="flex-1 flex justify-center">
            <Link href="/">
              <img
                src="/marqtplaza-logo-nl.svg"
                alt="Marqtplaza - De digitale dorpskern"
                className="h-12 md:h-16 w-auto"
              />
            </Link>
          </div>

          <div className="w-[100px] flex justify-end">
            <span className="text-xs font-bold text-[#072C1E]/40 uppercase tracking-widest hidden md:inline-block">
              {format(new Date(), 'd MMM yyyy', { locale: nl })}
            </span>
          </div>
        </div>
      </header>

      {/* EDITORIAL HERO */}
      <div className="bg-[#F2F0EA] pt-12 pb-10 md:pt-20 md:pb-16 border-b border-[#072C1E]/10">
        <div className="max-w-4xl mx-auto px-4 md:px-8 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#072C1E]/5 text-[#072C1E] rounded-full text-xs font-bold uppercase tracking-widest mb-6">
            <MapPin className="w-3.5 h-3.5 text-[#F36C21]" />
            Den Haag
          </div>
          <h1 className="news-title text-6xl md:text-8xl lg:text-9xl font-extrabold text-[#072C1E] tracking-tight mb-6 leading-[0.88]">
            Haags<span className="text-[#F36C21] ml-1 md:ml-2">Nieuws</span>
          </h1>
          <p className="text-lg md:text-xl text-[#072C1E]/70 max-w-2xl font-medium leading-relaxed">
            Lokaal geverifieerd nieuws. Zonder ruis, zonder algoritmes. Gewoon wat er speelt in de stad.
          </p>
        </div>
      </div>

      {/* CATEGORY NAV */}
      <div className="sticky top-0 z-30 bg-[#F2F0EA]/95 backdrop-blur-md border-b border-[#072C1E]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 overflow-x-auto no-scrollbar flex items-center gap-6 md:justify-center">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              "py-4 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2",
              selectedCategory === 'all' 
                ? "border-[#F36C21] text-[#072C1E]"
                : "border-transparent text-[#072C1E]/50 hover:text-[#072C1E] hover:border-[#072C1E]/30"
            )}
          >
            Alle nieuws
          </button>
          
          {availableSubcategories.map(sub => {
            const isSelected = selectedCategory === sub;
            return (
              <button
                key={sub}
                onClick={() => setSelectedCategory(sub)}
                className={cn(
                  "py-4 text-xs md:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2 flex items-center gap-2",
                  isSelected 
                    ? "border-[#F36C21] text-[#072C1E]"
                    : "border-transparent text-[#072C1E]/50 hover:text-[#072C1E] hover:border-[#072C1E]/30"
                )}
              >
                {SUBCATEGORY_LABELS[sub] || sub}
              </button>
            );
          })}
        </div>
      </div>

      {/* FEED CONTENT */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-12">
        {isLoading && (
          <div className="animate-pulse">
            <div className="flex flex-col md:flex-row gap-8 md:gap-16 mb-16 pb-16 border-b border-[#072C1E]/10">
              <div className="flex-1 space-y-6">
                <div className="flex gap-3"><div className="h-4 w-24 bg-[#072C1E]/10 rounded" /><div className="h-4 w-32 bg-[#072C1E]/5 rounded" /></div>
                <div className="h-12 md:h-16 w-full bg-[#072C1E]/10 rounded" />
                <div className="h-12 md:h-16 w-3/4 bg-[#072C1E]/10 rounded" />
              </div>
              <div className="flex-1 flex flex-col justify-center space-y-4">
                <div className="h-4 w-full bg-[#072C1E]/5 rounded" />
                <div className="h-4 w-full bg-[#072C1E]/5 rounded" />
                <div className="h-4 w-2/3 bg-[#072C1E]/5 rounded" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex flex-col space-y-4">
                  <div className="flex gap-3"><div className="h-3 w-20 bg-[#072C1E]/10 rounded" /><div className="h-3 w-24 bg-[#072C1E]/5 rounded" /></div>
                  <div className="h-8 w-full bg-[#072C1E]/10 rounded" />
                  <div className="h-8 w-4/5 bg-[#072C1E]/10 rounded" />
                  <div className="h-4 w-full bg-[#072C1E]/5 rounded mt-4" />
                  <div className="h-4 w-5/6 bg-[#072C1E]/5 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="py-16 px-8 bg-red-50 border border-red-100 rounded-2xl text-center max-w-2xl mx-auto my-12">
            <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-6" />
            <h3 className="font-serif text-2xl font-bold text-red-900 mb-3">Nieuws kon niet geladen worden</h3>
            <p className="text-red-700/80 mb-8">Er was een probleem met het ophalen van de laatste updates. Probeer het later nog eens.</p>
            <button 
              onClick={() => refetch()}
              className="px-8 py-3 bg-[#072C1E] text-[#F2F0EA] font-bold rounded-full hover:bg-[#F36C21] transition-colors shadow-sm uppercase tracking-widest text-sm"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {!isLoading && !isError && articles.length === 0 && (
          <div className="py-24 flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#072C1E]/10 mb-8">
              <Newspaper className="w-8 h-8 text-[#072C1E]/30" />
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#072C1E] mb-4">Geen artikelen gevonden</h2>
            <p className="text-[#072C1E]/60 text-lg max-w-md">
              Er is momenteel geen nieuws in deze categorie. Controleer later opnieuw of kies een andere categorie.
            </p>
          </div>
        )}

        {!isLoading && articles.length > 0 && (
          <div className="space-y-16">
            {/* HERO ARTICLE */}
            {selectedCategory === 'all' && (
              <article
                className="group flex flex-col md:flex-row gap-6 md:gap-16 cursor-pointer pb-16 border-b-2 border-[#072C1E]"
                onClick={() => setLocation(`/nieuws/${articles[0].id}`)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#F36C21] flex items-center gap-1.5">
                      {React.createElement(SUBCATEGORY_ICONS[articles[0].subcategory] || Newspaper, { className: "w-4 h-4" })}
                      {SUBCATEGORY_LABELS[articles[0].subcategory] || articles[0].subcategory}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#072C1E]/20" />
                    <span className="text-xs md:text-sm font-semibold text-[#072C1E]/50 uppercase tracking-widest">
                      {articles[0].sourceName}
                    </span>
                  </div>

                  <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-black text-[#072C1E] leading-[1.05] mb-6 group-hover:text-[#F36C21] transition-colors">
                    {decodeHtml(articles[0].title)}
                  </h2>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-lg md:text-xl text-[#072C1E]/70 font-sans leading-relaxed mb-8">
                    {decodeHtml(articles[0].summary)}
                  </p>

                  <div className="flex items-center justify-between pt-6 border-t border-[#072C1E]/20 mt-auto">
                    <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-[#072C1E]/50">
                      <Clock className="w-4 h-4" />
                      <time dateTime={articles[0].publishedAt || ''}>
                        {articles[0].publishedAt
                          ? format(parseISO(articles[0].publishedAt), 'd MMM yyyy', { locale: nl })
                          : 'Recent'}
                      </time>
                    </div>
                    <span className="text-xs md:text-sm font-bold text-[#072C1E] flex items-center gap-2 uppercase tracking-wider group-hover:text-[#F36C21] transition-colors">
                      Lees artikel <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
              </article>
            )}

            {/* GRID ARTICLES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
              {(selectedCategory === 'all' ? articles.slice(1) : articles).map((article) => {
                const Icon = SUBCATEGORY_ICONS[article.subcategory] || Newspaper;

                return (
                  <article
                    key={article.id}
                    className="group flex flex-col cursor-pointer border-t border-[#072C1E]/10 pt-6"
                    onClick={() => setLocation(`/nieuws/${article.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#F36C21] flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        {SUBCATEGORY_LABELS[article.subcategory] || article.subcategory}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-[#072C1E]/20" />
                      <span className="text-xs font-semibold text-[#072C1E]/50 uppercase tracking-widest truncate">
                        {article.sourceName}
                      </span>
                    </div>

                    <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#072C1E] leading-snug mb-4 group-hover:text-[#F36C21] transition-colors decoration-[#F36C21]/30 underline-offset-4 group-hover:underline">
                      {decodeHtml(article.title)}
                    </h2>

                    <p className="text-[#072C1E]/70 font-sans text-base leading-relaxed mb-8 flex-1 line-clamp-4">
                      {decodeHtml(article.summary)}
                    </p>

                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#072C1E]/5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#072C1E]/40">
                        <Clock className="w-3.5 h-3.5" />
                        <time dateTime={article.publishedAt || ''}>
                          {article.publishedAt
                            ? format(parseISO(article.publishedAt), 'd MMM yyyy', { locale: nl })
                            : 'Recent'}
                        </time>
                      </div>
                      <span className="text-xs font-bold text-[#F36C21] flex items-center gap-1 uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                        Lees <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-[#072C1E] border-t border-[#072C1E]/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 flex flex-col items-center text-center">
          <p className="text-[#F2F0EA]/50 text-xs font-bold tracking-widest uppercase mb-8">Onderdeel van</p>
          <img
            src="/marqtplaza-logo.png"
            alt="marqtplaza.com"
            className="h-12 w-auto mb-8 opacity-80 hover:opacity-100 transition-opacity drop-shadow-md"
          />
          <div className="w-12 h-0.5 bg-[#F36C21]/50 mb-8" />
          <p className="text-[#F2F0EA]/60 text-sm max-w-md leading-relaxed font-medium">
            Lokale informatie, verbonden door marqtplaza.com. <br />
            © {new Date().getFullYear()} Alle rechten voorbehouden.
          </p>
        </div>
      </footer>
    </div>
  );
}
