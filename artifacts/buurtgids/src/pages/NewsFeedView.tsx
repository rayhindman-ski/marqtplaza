import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useGetNews, type NewsSubcategory } from '@workspace/api-client-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { 
  ArrowLeft, Clock, ExternalLink, Newspaper, 
  MapPin, ShieldAlert, Briefcase, Landmark, Trophy, Users, ChevronRight
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
    <div className="min-h-screen bg-[#F2F0EA] text-[#1A1C1B] font-sans selection:bg-[#F36C21] selection:text-white">
      {/* BOLD EDITORIAL HEADER */}
      <header className="bg-[#072C1E] text-[#F2F0EA] pt-12 pb-16 px-6 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[50vw] h-[50vh] bg-[#0A3B2A] rounded-full blur-[100px] pointer-events-none opacity-50" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[40vw] h-[40vh] bg-[#F36C21] rounded-full blur-[120px] pointer-events-none opacity-20" />
        
        <div className="max-w-6xl mx-auto relative z-10">
          <button 
            onClick={() => setLocation('/')}
            className="group flex items-center gap-2 text-[#F2F0EA]/70 hover:text-white mb-12 transition-colors font-bold text-sm tracking-wide uppercase"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Terug naar kaart
          </button>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
            Haags <br/>
            <span className="text-[#F36C21]">Nieuws.</span>
          </h1>
          <p className="text-xl md:text-2xl text-[#F2F0EA]/80 font-medium max-w-2xl leading-relaxed">
            Lokaal verifiëerd nieuws uit Den Haag. Zonder ruis, zonder algoritmes. Gewoon wat er speelt in de stad.
          </p>
        </div>
      </header>

      {/* CATEGORY NAV */}
      <div className="sticky top-0 z-30 bg-[#F2F0EA]/90 backdrop-blur-xl border-b border-[#072C1E]/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex gap-3 overflow-x-auto no-scrollbar items-center">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              "px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-300",
              selectedCategory === 'all' 
                ? "bg-[#072C1E] text-[#F2F0EA] shadow-md" 
                : "bg-white/50 text-[#072C1E] border border-[#072C1E]/10 hover:border-[#072C1E]/30"
            )}
          >
            Alle nieuws
          </button>
          
          {availableSubcategories.map(sub => {
            const Icon = SUBCATEGORY_ICONS[sub] || Newspaper;
            const isSelected = selectedCategory === sub;
            return (
              <button
                key={sub}
                onClick={() => setSelectedCategory(sub)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-300 flex items-center gap-2",
                  isSelected 
                    ? "bg-[#072C1E] text-[#F2F0EA] shadow-md" 
                    : "bg-white/50 text-[#072C1E] border border-[#072C1E]/10 hover:border-[#072C1E]/30"
                )}
              >
                <Icon className={cn("w-4 h-4", isSelected ? "text-[#F36C21]" : "text-[#072C1E]/50")} />
                {SUBCATEGORY_LABELS[sub] || sub}
              </button>
            );
          })}
        </div>
      </div>

      {/* FEED CONTENT */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="space-y-4">
                <div className="h-4 w-24 bg-[#072C1E]/10 rounded-full" />
                <div className="h-8 w-full bg-[#072C1E]/10 rounded-lg" />
                <div className="h-24 w-full bg-[#072C1E]/10 rounded-lg" />
                <div className="h-4 w-32 bg-[#072C1E]/10 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-8 rounded-r-2xl">
            <h3 className="text-xl font-bold text-red-900 mb-2">Kon nieuws niet laden</h3>
            <p className="text-red-700 mb-6">Er ging iets mis bij het ophalen van het laatste nieuws.</p>
            <button 
              onClick={() => refetch()}
              className="px-6 py-2 bg-red-100 text-red-900 font-bold rounded-full hover:bg-red-200 transition-colors"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {!isLoading && !isError && articles.length === 0 && (
          <div className="py-24 text-center flex flex-col items-center">
            <Newspaper className="w-16 h-16 text-[#072C1E]/20 mb-6" />
            <h2 className="text-2xl font-black text-[#072C1E] mb-2">Geen nieuws gevonden</h2>
            <p className="text-[#072C1E]/60 max-w-sm mx-auto">
              Er zijn momenteel geen artikelen beschikbaar in deze categorie. Probeer later opnieuw.
            </p>
          </div>
        )}

        {!isLoading && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {articles.map((article, idx) => {
              const isHero = idx === 0 && selectedCategory === 'all';
              const Icon = SUBCATEGORY_ICONS[article.subcategory] || Newspaper;
              
              return (
                <article 
                  key={article.id} 
                  className={cn(
                    "group cursor-pointer flex flex-col",
                    isHero ? "md:col-span-2 lg:col-span-2 border-b-2 border-[#072C1E] pb-12 mb-4" : "border-b border-[#072C1E]/10 pb-8"
                  )}
                  onClick={() => setLocation(`/nieuws/${article.id}`)}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#F36C21]">
                      <Icon className="w-3.5 h-3.5" />
                      {SUBCATEGORY_LABELS[article.subcategory] || article.subcategory}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-[#072C1E]/20" />
                    <span className="text-xs font-bold text-[#072C1E]/50 uppercase tracking-widest">
                      {article.sourceName}
                    </span>
                  </div>

                  <h2 className={cn(
                    "font-serif font-bold text-[#072C1E] leading-[1.1] mb-4 group-hover:text-[#F36C21] transition-colors",
                    isHero ? "text-4xl md:text-5xl lg:text-6xl" : "text-2xl md:text-3xl"
                  )}>
                    {decodeHtml(article.title)}
                  </h2>

                  <p className={cn(
                    "text-[#072C1E]/70 font-medium leading-relaxed mb-6 flex-1",
                    isHero ? "text-lg md:text-xl max-w-3xl" : "text-base line-clamp-3"
                  )}>
                    {decodeHtml(article.summary)}
                  </p>

                  <div className="flex items-center justify-between mt-auto pt-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#072C1E]/50">
                      <Clock className="w-4 h-4" />
                      <time dateTime={article.publishedAt || ''}>
                        {article.publishedAt 
                          ? format(parseISO(article.publishedAt), 'd MMM yyyy, HH:mm', { locale: nl })
                          : 'Recent'
                        }
                      </time>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#072C1E]/5 flex items-center justify-center group-hover:bg-[#F36C21] group-hover:text-white transition-colors text-[#072C1E]">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
