import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useGetDeals, getGetDealsQueryKey } from '@workspace/api-client-react';
import { Tag, Calendar, ChevronRight, Store, MapPin, Search, FilterX } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export default function DealsView() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: deals, isLoading, isError } = useGetDeals(
    { cityId: 'dhg' },
    { query: { queryKey: getGetDealsQueryKey({ cityId: 'dhg' }) } }
  );
  const dealItems = Array.isArray(deals) ? deals : [];

  useEffect(() => {
    document.title = 'Lokale Deals | Buurtplaza';
    
    // Create meta description if not exists
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Ontdek de beste lokale acties en deals van ondernemers in Den Haag op Buurtplaza.');
  }, []);

  const categories = Array.from(new Set(dealItems.map(deal => deal.category)));

  const filteredDeals = dealItems.filter(deal => {
    const matchesSearch = search === '' || 
      deal.title.toLowerCase().includes(search.toLowerCase()) || 
      deal.businessName?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || deal.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-accent/20">
      <div className="bg-primary/5 py-12 border-b border-primary/10">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-4 bg-background border-primary/30 text-primary font-bold">
              Buurtplaza Deals
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight mb-4">
              Ontdek de beste lokale acties
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Steun lokale ondernemers in Den Haag en profiteer van unieke aanbiedingen direct uit jouw buurt.
            </p>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op winkel of aanbieding..."
                className="pl-10 h-14 text-lg bg-background rounded-2xl shadow-sm border-primary/20 focus-visible:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 shrink-0 space-y-6">
            <div>
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-primary" />
                Categorieën
              </h3>
              {categories.length > 0 ? (
                <div className="space-y-2 flex flex-col items-start">
                  <Button
                    variant={selectedCategory === null ? 'default' : 'ghost'}
                    className="w-full justify-start font-medium"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Alles tonen
                  </Button>
                  {categories.map(cat => (
                    <Button
                      key={cat}
                      variant={selectedCategory === cat ? 'default' : 'ghost'}
                      className="w-full justify-start font-medium"
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Geen categorieën gevonden.</p>
              )}
            </div>
          </div>

          {/* Main Feed */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="overflow-hidden border-border/50">
                    <Skeleton className="h-48 w-full" />
                    <CardContent className="p-5">
                      <Skeleton className="h-6 w-3/4 mb-3" />
                      <Skeleton className="h-4 w-1/2 mb-4" />
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : isError ? (
              <div className="text-center py-20 bg-background rounded-2xl border border-destructive/20 shadow-sm">
                <FilterX className="w-12 h-12 text-destructive mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-foreground mb-2">Er ging iets mis</h3>
                <p className="text-muted-foreground">We konden de deals niet laden. Probeer het later opnieuw.</p>
              </div>
            ) : filteredDeals.length === 0 ? (
              <div className="text-center py-20 bg-background rounded-2xl border border-border/50 shadow-sm">
                <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-foreground mb-2">Geen deals gevonden</h3>
                <p className="text-muted-foreground">Probeer een andere zoekterm of categorie.</p>
                {(search || selectedCategory) && (
                  <Button 
                    variant="outline" 
                    className="mt-6 font-bold"
                    onClick={() => { setSearch(''); setSelectedCategory(null); }}
                  >
                    Wis filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {filteredDeals.map(deal => (
                  <Card key={deal.id} className="overflow-hidden flex flex-col group border-primary/10 hover:border-primary/30 transition-colors shadow-sm hover:shadow-md">
                    {deal.imageUrl ? (
                      <div className="h-48 overflow-hidden bg-muted relative">
                        <img 
                          src={deal.imageUrl} 
                          alt={deal.title} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-background/90 text-foreground backdrop-blur-sm border-none shadow-sm font-bold">
                            {deal.category}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 bg-primary/5 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary to-transparent" />
                        <Tag className="w-12 h-12 text-primary/40 mb-2" />
                        <span className="text-primary/60 font-bold uppercase tracking-widest text-sm">{deal.category}</span>
                      </div>
                    )}
                    
                    <CardHeader className="pb-3 pt-5">
                      <div className="flex items-center justify-between mb-2">
                        {deal.businessSlug ? (
                          <Link href={`/bedrijf/${deal.businessSlug}`} className="text-sm font-bold text-secondary hover:text-primary transition-colors flex items-center gap-1.5 line-clamp-1">
                            <Store className="w-4 h-4 shrink-0" />
                            {deal.businessName || 'Lokale winkel'}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground flex items-center gap-1.5 line-clamp-1">
                            <Store className="w-4 h-4 shrink-0" />
                            {deal.businessName || 'Lokale winkel'}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 shrink-0">
                          <MapPin className="w-3 h-3" />
                          Den Haag
                        </span>
                      </div>
                      <CardTitle className="text-xl leading-tight line-clamp-2">{deal.title}</CardTitle>
                    </CardHeader>
                    
                    <CardContent className="pb-4 flex-1">
                      <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                        {deal.description}
                      </p>
                      
                      <div className="inline-block bg-primary/10 text-primary font-extrabold px-3 py-1.5 rounded-lg border border-primary/20 text-sm">
                        {deal.offerText}
                      </div>
                    </CardContent>
                    
                    <CardFooter className="pt-0 pb-5 flex flex-wrap gap-3 items-center justify-between border-t border-border/40 mt-auto">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mt-4">
                        <Calendar className="w-4 h-4" />
                        Geldig t/m {format(new Date(deal.validUntil), 'd MMMM yyyy', { locale: nl })}
                      </div>
                      
                      {deal.redemptionUrl && (
                        <a 
                          href={deal.redemptionUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex mt-4 items-center justify-center rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground shadow hover:bg-secondary/90 transition-colors"
                        >
                          Bekijk Actie
                        </a>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
