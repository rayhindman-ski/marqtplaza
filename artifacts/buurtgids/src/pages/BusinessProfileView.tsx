import React, { useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { useGetBusinessProfile, getGetBusinessProfileQueryKey } from '@workspace/api-client-react';
import { MapPin, Phone, Globe, Clock, BadgeCheck, Tag, Calendar, Building2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLanguage } from '@/lib/useAppLanguage';
import { businessPublicationTranslations } from '@/lib/i18n';

export default function BusinessProfileView() {
  const [, params] = useRoute('/bedrijf/:slug');
  const slug = params?.slug || '';
  
  const { data: profile, isLoading, isError } = useGetBusinessProfile(slug, {
    query: {
      enabled: !!slug,
      queryKey: getGetBusinessProfileQueryKey(slug),
    }
  });

  const [language] = useAppLanguage();
  const publicationCopy = businessPublicationTranslations[language];
  // Localised editorial text comes only from the approved snapshot. English falls
  // back to Dutch per field; nothing is ever invented client-side.
  const approved = profile?.content ?? null;
  const localised = approved
    ? {
        tagline: (language === 'en' ? approved.en.tagline : null) ?? approved.nl.tagline,
        description: (language === 'en' ? approved.en.description : null) ?? approved.nl.description,
        openingHours: (language === 'en' ? approved.en.openingHours : null) ?? approved.nl.openingHours,
      }
    : profile
      ? { tagline: profile.tagline, description: profile.description, openingHours: profile.openingHours }
      : { tagline: null, description: null, openingHours: null };
  const provenance = profile?.provenance ?? null;

  useEffect(() => {
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    if (profile) {
      document.title = `${profile.name} | Buurtplaza`;
      metaDesc.setAttribute('content', localised.tagline || localised.description || `Bekijk het profiel van ${profile.name} op Buurtplaza.`);
    } else {
      document.title = 'Bedrijf | Buurtplaza';
      metaDesc.setAttribute('content', 'Bedrijfsprofiel op Buurtplaza.');
    }
  }, [profile, localised.tagline, localised.description]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-64 md:h-80 bg-muted animate-pulse" />
        <div className="container max-w-5xl mx-auto px-4 sm:px-6 -mt-16">
          <div className="bg-card rounded-2xl shadow-md border border-border/50 p-6 md:p-8 space-y-6">
            <div className="flex gap-6 items-start">
              <Skeleton className="w-24 h-24 rounded-2xl shrink-0" />
              <div className="space-y-3 flex-1 pt-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/5" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-accent/20">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-6 opacity-80" />
          <h1 className="text-3xl font-extrabold text-foreground mb-4">Bedrijf niet gevonden</h1>
          <p className="text-muted-foreground mb-8 text-lg">Dit profiel bestaat niet of is (nog) niet gepubliceerd.</p>
          <Link href="/deals">
            <Button size="lg" className="font-bold">Terug naar Deals</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-accent/10 pb-20">
      {/* Cover */}
      <div className="h-64 md:h-[400px] w-full bg-secondary relative overflow-hidden">
        {profile.coverUrl ? (
          <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover opacity-80 mix-blend-overlay" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-secondary to-primary/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
      </div>

      {/* Main Content */}
      <div className="container max-w-5xl mx-auto px-4 sm:px-6 -mt-20 md:-mt-32 relative z-10">
        <div className="bg-card rounded-3xl shadow-xl border border-border/60 p-6 md:p-10 mb-8">
          <div className="flex flex-col sm:flex-row gap-6 md:gap-10 items-start">
            {/* Logo */}
            <div className="w-24 h-24 md:w-32 md:h-32 shrink-0 rounded-2xl border-4 border-card bg-muted shadow-md overflow-hidden flex items-center justify-center">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt={`${profile.name} logo`} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-12 h-12 text-muted-foreground/40" />
              )}
            </div>
            
            {/* Header Info */}
            <div className="flex-1 space-y-4 pt-2">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight">{profile.name}</h1>
                  {profile.isClaimed && (
                    <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-none shadow-sm gap-1.5 py-1 px-3">
                      <BadgeCheck className="w-4 h-4" />
                      Geverifieerd eigenaar
                    </Badge>
                  )}
                </div>
                {localised.tagline && (
                  <p className="text-lg md:text-xl font-medium text-muted-foreground" data-testid="public-tagline">{localised.tagline}</p>
                )}
              </div>
              
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground">
                {profile.address && (
                  <a
                    href={profile.latitude !== null && profile.longitude !== null
                      ? `https://www.google.com/maps/search/?api=1&query=${profile.latitude},${profile.longitude}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/80 hover:text-primary transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-primary" />
                    {profile.address} {profile.neighborhood && `(${profile.neighborhood})`}
                  </a>
                )}
                {profile.phone && (
                  <a href={`tel:${profile.phone}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                    <Phone className="w-4 h-4 text-primary" />
                    {profile.phone}
                  </a>
                )}
                {profile.websiteUrl && (
                  <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-primary transition-colors">
                    <Globe className="w-4 h-4 text-primary" />
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Description & Hours */}
          <div className="mt-10 grid md:grid-cols-3 gap-8 pt-8 border-t border-border/50">
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xl font-bold text-foreground">Over {profile.name}</h3>
              {localised.description ? (
                <div className="prose prose-sm md:prose-base prose-neutral max-w-none text-muted-foreground" data-testid="public-description">
                  {localised.description.split('\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">Dit bedrijf heeft nog geen beschrijving toegevoegd.</p>
              )}
            </div>
            
            <div className="space-y-4 bg-accent/30 p-6 rounded-2xl border border-border/40">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Clock className="w-5 h-5 text-primary" />
                Openingstijden
              </h3>
              {localised.openingHours ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="public-opening-hours">{localised.openingHours}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Geen openingstijden bekend.</p>
              )}
            </div>
          </div>

          {provenance && (
            <section className="mt-8 pt-6 border-t border-border/50 text-xs text-muted-foreground space-y-2" aria-label={language === 'nl' ? 'Herkomst en controle' : 'Source and verification'} data-testid="public-provenance">
              <p className="font-bold uppercase tracking-wide text-[11px]">{language === 'nl' ? 'Herkomst en controle' : 'Source and verification'}</p>
              <p>
                {language === 'nl' ? 'Bron' : 'Source'}: {provenance.sourceUrl ? (
                  <a href={provenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">{provenance.listingSource}</a>
                ) : provenance.listingSource}
                {' · '}
                {language === 'nl' ? 'goedgekeurde versie' : 'approved version'} v{provenance.approvedVersion}
                {provenance.approvedAt ? ` (${new Date(provenance.approvedAt).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')})` : ''}
                {' · '}
                <span data-testid="public-freshness">{publicationCopy.freshness[provenance.freshness.status]}</span>
                {provenance.freshness.checkedOn ? ` (${publicationCopy.checkedOn} ${new Date(provenance.freshness.checkedOn).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')})` : ''}
              </p>
              {provenance.checks.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {provenance.checks.map((check) => (
                    <li key={check.field}>
                      {publicationCopy[check.field as keyof typeof publicationCopy] as string ?? check.field}: {publicationCopy.checkStatus[check.status] ?? check.status}
                      {check.checkedOn ? ` (${new Date(check.checkedOn).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Deals Section */}
        {profile.deals && profile.deals.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-foreground flex items-center gap-3">
              <Tag className="w-8 h-8 text-primary" />
              Actuele Deals
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {profile.deals.map((deal) => (
                <Card key={deal.id} className="overflow-hidden flex flex-col group border-primary/20 shadow-sm hover:shadow-md transition-all">
                  {deal.imageUrl && (
                    <div className="h-40 overflow-hidden bg-muted relative">
                      <img 
                        src={deal.imageUrl} 
                        alt={deal.title} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <Badge className="w-fit mb-3 bg-secondary text-secondary-foreground border-none font-bold">
                      {deal.category}
                    </Badge>
                    <CardTitle className="text-xl leading-tight">{deal.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 flex-1">
                    <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                      {deal.description}
                    </p>
                    <div className="inline-block bg-primary/10 text-primary font-extrabold px-3 py-1.5 rounded-lg border border-primary/20 text-sm">
                      {deal.offerText}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex flex-wrap gap-3 items-center justify-between border-t border-border/40 mt-auto bg-muted/20">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mt-4">
                      <Calendar className="w-4 h-4" />
                      Geldig t/m {format(new Date(deal.validUntil), 'd MMM yyyy', { locale: nl })}
                    </div>
                    {deal.redemptionUrl && (
                      <a 
                        href={deal.redemptionUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex mt-4 items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                      >
                        Bekijk Actie
                      </a>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
