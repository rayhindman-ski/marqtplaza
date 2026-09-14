import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useAuth, SignInButton } from '@clerk/react';
import { 
  useGetMyBusinessProfiles, 
  getGetMyBusinessProfilesQueryKey,
  useGetMyBusinessClaims,
  getGetMyBusinessClaimsQueryKey,
  useUpdateBusinessProfile,
  useCreateBusinessDeal,
  useUpdateBusinessDeal,
  useWithdrawBusinessClaim,
  type ApiError,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { 
  Building2, Store, Tag, Plus, Edit3, Image as ImageIcon, 
  MapPin, Clock, Globe, Phone, Mail, AlertCircle, CheckCircle2, 
  XCircle, Loader2, Calendar
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { businessIntakeTranslations } from '@/lib/i18n';
import { claimPresentation } from '@/lib/claimPresentation';
import { useAppLanguage } from '@/lib/useAppLanguage';

function apiErrorFrom(error: unknown): ApiError | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === 'object' && 'code' in data ? data as ApiError : null;
}

const profileSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(160),
  tagline: z.string().max(160).optional(),
  description: z.string().max(2400).optional(),
  websiteUrl: z.string().url('Ongeldige URL.').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  email: z.string().email('Ongeldig e-mailadres.').optional().or(z.literal('')),
  openingHours: z.string().max(600).optional(),
  logoUrl: z.string().url('Ongeldige URL.').optional().or(z.literal('')),
  coverUrl: z.string().url('Ongeldige URL.').optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const dealSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(1200),
  category: z.string().min(2).max(80),
  offerText: z.string().min(2).max(140),
  redemptionUrl: z.string().url('Ongeldige URL').optional().or(z.literal('')),
  couponCode: z.string().max(80).optional(),
  imageUrl: z.string().url('Ongeldige URL').optional().or(z.literal('')),
  validFrom: z.string().min(1, 'Kies een startdatum'),
  validUntil: z.string().min(1, 'Kies een einddatum'),
});

type DealFormValues = z.infer<typeof dealSchema>;

export default function MyBusinessWorkspace() {
  const clerkAuth = useAuth();
  const accountAuth = useAccountAuth();
  const { isSignedIn, isLoaded } = featureFlags.businessIntake ? accountAuth : clerkAuth;
  const [language] = useAppLanguage();
  const intakeCopy = businessIntakeTranslations[language];
  const queryClient = useQueryClient();
  
  const { data: profiles, isLoading: profilesLoading } = useGetMyBusinessProfiles({
    query: { enabled: !!isSignedIn, queryKey: getGetMyBusinessProfilesQueryKey() }
  });
  
  const { data: claims, isLoading: claimsLoading } = useGetMyBusinessClaims({
    query: { enabled: !!isSignedIn, queryKey: getGetMyBusinessClaimsQueryKey() }
  });

  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  
  // Modals
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<number | null>(null);

  const updateProfile = useUpdateBusinessProfile();
  const createDeal = useCreateBusinessDeal();
  const updateDeal = useUpdateBusinessDeal();
  const withdrawClaim = useWithdrawBusinessClaim();

  useEffect(() => {
    document.title = 'Mijn Bedrijf | Buurtplaza';
  }, []);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '', tagline: '', description: '', websiteUrl: '',
      phone: '', email: '', openingHours: '', logoUrl: '', coverUrl: ''
    }
  });

  const dealForm = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: '', description: '', category: '', offerText: '',
      redemptionUrl: '', couponCode: '', imageUrl: '', 
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: ''
    }
  });

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-accent/30">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Mijn Bedrijf</h1>
          <p className="text-lg text-muted-foreground">Log in om je bedrijfsprofielen en acties te beheren op Buurtplaza.</p>
          <div className="pt-4">
            <SignInButton mode="modal" forceRedirectUrl={window.location.href}>
              <Button size="lg" className="w-full font-bold text-lg h-14">Inloggen</Button>
            </SignInButton>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = profilesLoading || claimsLoading;
  
  // Set default active profile if not set
  if (profiles && profiles.length > 0 && activeProfileId === null) {
    setActiveProfileId(profiles[0].id);
  }
  
  const activeProfile = profiles?.find(p => p.id === activeProfileId);

  const openProfileEdit = () => {
    if (activeProfile) {
      profileForm.reset({
        name: activeProfile.name,
        tagline: activeProfile.tagline || '',
        description: activeProfile.description || '',
        websiteUrl: activeProfile.websiteUrl || '',
        phone: activeProfile.phone || '',
        email: activeProfile.email || '',
        openingHours: activeProfile.openingHours || '',
        logoUrl: activeProfile.logoUrl || '',
        coverUrl: activeProfile.coverUrl || '',
      });
      setIsEditProfileOpen(true);
    }
  };

  const onProfileSubmit = (data: ProfileFormValues) => {
    if (!activeProfileId) return;
    
    // Coerce empty strings to undefined for url and email fields
    const payload = {
      ...data,
      websiteUrl: data.websiteUrl || undefined,
      email: data.email || undefined,
      logoUrl: data.logoUrl || undefined,
      coverUrl: data.coverUrl || undefined,
    };
    
    updateProfile.mutate({
      id: activeProfileId,
      data: payload
    }, {
      onSuccess: () => {
        toast.success('Profiel bijgewerkt');
        setIsEditProfileOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetMyBusinessProfilesQueryKey() });
      },
      onError: () => toast.error('Fout bij opslaan')
    });
  };

  const openDealCreate = () => {
    setEditingDealId(null);
    dealForm.reset({
      title: '', description: '', category: '', offerText: '',
      redemptionUrl: '', couponCode: '', imageUrl: '', 
      validFrom: new Date().toISOString().split('T')[0],
      validUntil: ''
    });
    setIsDealModalOpen(true);
  };

  const openDealEdit = (deal: any) => {
    setEditingDealId(deal.id);
    dealForm.reset({
      title: deal.title,
      description: deal.description,
      category: deal.category,
      offerText: deal.offerText,
      redemptionUrl: deal.redemptionUrl || '',
      couponCode: deal.couponCode || '',
      imageUrl: deal.imageUrl || '',
      validFrom: deal.validFrom.split('T')[0],
      validUntil: deal.validUntil.split('T')[0],
    });
    setIsDealModalOpen(true);
  };

  const onDealSubmit = (data: DealFormValues) => {
    if (!activeProfileId) return;

    const payload = {
      ...data,
      redemptionUrl: data.redemptionUrl || undefined,
      imageUrl: data.imageUrl || undefined,
      validFrom: data.validFrom,
      validUntil: data.validUntil,
    };

    if (editingDealId) {
      updateDeal.mutate({
        id: activeProfileId,
        dealId: editingDealId,
        data: payload
      }, {
        onSuccess: () => {
          toast.success('Deal bijgewerkt');
          setIsDealModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetMyBusinessProfilesQueryKey() });
        }
      });
    } else {
      createDeal.mutate({
        id: activeProfileId,
        data: payload
      }, {
        onSuccess: () => {
          toast.success('Deal aangemaakt');
          setIsDealModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetMyBusinessProfilesQueryKey() });
        }
      });
    }
  };

  const withdrawDeal = (dealId: number) => {
    if (!activeProfileId) return;
    if (!confirm('Weet je zeker dat je deze deal wilt intrekken?')) return;
    
    updateDeal.mutate({
      id: activeProfileId,
      dealId,
      data: { status: 'withdrawn' }
    }, {
      onSuccess: () => {
        toast.success('Deal ingetrokken');
        queryClient.invalidateQueries({ queryKey: getGetMyBusinessProfilesQueryKey() });
      }
    });
  };

  const onWithdrawClaim = (claim: NonNullable<typeof claims>[number]) => {
    if (!confirm(intakeCopy.withdrawConfirm)) return;
    withdrawClaim.mutate({ id: claim.id, data: { expectedVersion: claim.version ?? 1 } }, {
      onSuccess: () => {
        toast.success(intakeCopy.withdrawn);
        queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
      },
      onError: (error) => {
        if (apiErrorFrom(error)?.code === 'VERSION_CONFLICT') {
          toast.error(intakeCopy.conflict);
          queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
        } else {
          toast.error(intakeCopy.withdrawFailed);
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-accent/20 pb-20">
      <div className="bg-primary/5 border-b border-primary/10">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-4xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <Store className="w-10 h-10 text-primary" />
            Mijn Bedrijf
          </h1>
          <p className="text-lg text-muted-foreground mt-2">Beheer je profielen en bereik de buurt met acties.</p>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded-lg w-1/3" />
            <div className="h-64 bg-card animate-pulse rounded-2xl border border-border/50" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Claims Status */}
            {claims && claims.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground">Claim Statussen</h2>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {claims.map(claim => {
                    const status = claim.status;
                    const view = claimPresentation(claim, language, featureFlags.businessIntake);
                    const tone = view.tone === 'success'
                      ? 'border-emerald-500/30 text-emerald-700 bg-emerald-500/10'
                      : view.tone === 'danger'
                        ? 'border-destructive/30 text-destructive bg-destructive/10'
                        : view.tone === 'muted'
                          ? 'border-border text-muted-foreground bg-muted/40'
                          : 'border-amber-500/30 text-amber-700 bg-amber-500/10';
                    return (
                      <Card key={claim.id} className="border-border/50 shadow-sm">
                        <CardContent className="p-4 flex items-start gap-4">
                          <div className="shrink-0 pt-1">
                            {status === 'approved' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : status === 'rejected' || status === 'disputed' ? (
                              <XCircle className="w-5 h-5 text-destructive" />
                            ) : status === 'withdrawn' ? (
                              <XCircle className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-foreground line-clamp-1">{claim.profile.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Status labels are always truthful, regardless of the intake flag. */}
                              <Badge variant="outline" className={tone} data-testid={`claim-status-${claim.id}`}>
                                {view.label}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{view.nextAction}</p>
                            {claim.reviewNote && (
                              <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded-md border border-border/40">
                                <span className="font-semibold block mb-1">{intakeCopy.editorNote}</span>
                                {claim.reviewNote}
                              </p>
                            )}
                            {/* Only the gated actions depend on the flag; after a rollback the claim stays readable. */}
                            {view.canContinue || view.canWithdraw ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {view.canContinue ? (
                                  <Button asChild size="sm"><Link href={`/bedrijf-nieuw?claim=${claim.id}`}>{intakeCopy.continueDraft}</Link></Button>
                                ) : null}
                                {view.canWithdraw ? (
                                  <Button type="button" size="sm" variant="outline" disabled={withdrawClaim.isPending} onClick={() => onWithdrawClaim(claim)}>{intakeCopy.withdraw}</Button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
            {featureFlags.businessIntake ? (
              <Button asChild variant="outline"><Link href="/bedrijf-zoeken">{intakeCopy.addAnother}</Link></Button>
            ) : null}

            {!profiles || profiles.length === 0 ? (
              <Card className="text-center py-20 border-dashed border-2 bg-transparent shadow-none">
                <CardContent>
                  <Building2 className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-foreground mb-2">Je hebt nog geen goedgekeurde profielen</h3>
                  <p className="text-muted-foreground mb-6">Zoek je bedrijf op de kaart en claim je vermelding, of wacht tot je claim is goedgekeurd.</p>
                  <Button variant="outline" onClick={() => window.location.href = '/'}>
                    Zoek op de kaart
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid lg:grid-cols-4 gap-8">
                {/* Sidebar Navigation */}
                <div className="lg:col-span-1 space-y-2">
                  <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4 px-2">Jouw Profielen</h3>
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProfileId(p.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl transition-all font-semibold text-sm ${
                        activeProfileId === p.id 
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="line-clamp-1">{p.name}</div>
                    </button>
                  ))}
                </div>

                {/* Main Workspace area */}
                <div className="lg:col-span-3">
                  {activeProfile && (
                    <Tabs defaultValue="profiel" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-8 bg-card border-border/50 shadow-sm p-1 rounded-xl h-auto">
                        <TabsTrigger value="profiel" className="py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">Profiel</TabsTrigger>
                        <TabsTrigger value="deals" className="py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg">Deals & Acties</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="profiel" className="space-y-6">
                        <Card className="border-border/60 shadow-sm">
                          <CardHeader className="flex flex-row items-start justify-between bg-muted/20 border-b border-border/40 pb-6">
                            <div>
                              <CardTitle className="text-2xl flex items-center gap-2">
                                {activeProfile.name}
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-xs py-0">Actief</Badge>
                              </CardTitle>
                              {activeProfile.tagline && <CardDescription className="text-base mt-1">{activeProfile.tagline}</CardDescription>}
                            </div>
                            {featureFlags.businessPublication ? (
                              <Button asChild variant="outline" size="sm" className="font-bold gap-1.5 shrink-0">
                                <Link href={`/mijn-bedrijf/${activeProfile.id}/profiel`} data-testid="open-revision-editor">
                                  <Edit3 className="w-4 h-4" /> {language === 'nl' ? 'Profiel bewerken' : 'Edit profile'}
                                </Link>
                              </Button>
                            ) : (
                              <Button onClick={openProfileEdit} variant="outline" size="sm" className="font-bold gap-1.5 shrink-0">
                                <Edit3 className="w-4 h-4" /> Bewerken
                              </Button>
                            )}
                          </CardHeader>
                          <CardContent className="pt-6 grid sm:grid-cols-2 gap-8">
                            <div className="space-y-6">
                              <div>
                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Over</h4>
                                <p className="text-sm text-foreground whitespace-pre-wrap">{activeProfile.description || <span className="italic text-muted-foreground">Geen beschrijving ingevuld.</span>}</p>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Contact & Adres</h4>
                                <ul className="space-y-2 text-sm text-foreground">
                                  {activeProfile.address && <li className="flex gap-2"><MapPin className="w-4 h-4 text-primary shrink-0"/> {activeProfile.address}</li>}
                                  {activeProfile.phone && <li className="flex gap-2"><Phone className="w-4 h-4 text-primary shrink-0"/> {activeProfile.phone}</li>}
                                  {activeProfile.email && <li className="flex gap-2"><Mail className="w-4 h-4 text-primary shrink-0"/> {activeProfile.email}</li>}
                                  {activeProfile.websiteUrl && <li className="flex gap-2"><Globe className="w-4 h-4 text-primary shrink-0"/> {activeProfile.websiteUrl}</li>}
                                </ul>
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div>
                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Openingstijden</h4>
                                <p className="text-sm text-foreground whitespace-pre-wrap">{activeProfile.openingHours || <span className="italic text-muted-foreground">Geen tijden ingevuld.</span>}</p>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Beeldmateriaal</h4>
                                <div className="flex gap-4">
                                  <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
                                    {activeProfile.logoUrl ? <img src={activeProfile.logoUrl} className="w-full h-full object-cover"/> : <ImageIcon className="w-6 h-6 text-muted-foreground/50"/>}
                                  </div>
                                  <div className="flex-1 h-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden relative">
                                    {activeProfile.coverUrl ? <img src={activeProfile.coverUrl} className="w-full h-full object-cover"/> : <span className="text-xs font-medium text-muted-foreground">Coverfoto</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="deals" className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-2xl font-bold text-foreground">Jouw Deals</h2>
                            <p className="text-muted-foreground text-sm">Bereik bewoners met acties en kortingen.</p>
                          </div>
                          <Button onClick={openDealCreate} className="font-bold gap-2 shadow-sm">
                            <Plus className="w-4 h-4" /> Nieuwe Deal
                          </Button>
                        </div>

                        {activeProfile.deals && activeProfile.deals.length > 0 ? (
                          <div className="grid sm:grid-cols-2 gap-6">
                            {activeProfile.deals.map(deal => (
                              <Card key={deal.id} className={`border-border/60 shadow-sm flex flex-col ${deal.status === 'withdrawn' ? 'opacity-60 grayscale' : ''}`}>
                                <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
                                  <div className="flex items-start justify-between gap-2">
                                    <Badge variant="outline" className={
                                      deal.status === 'approved' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' :
                                      deal.status === 'pending' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' :
                                      deal.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                                      'bg-muted text-muted-foreground'
                                    }>
                                      {deal.status === 'approved' ? 'Actief' : 
                                       deal.status === 'pending' ? 'In afwachting' :
                                       deal.status === 'rejected' ? 'Afgewezen' : 'Ingetrokken'}
                                    </Badge>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDealEdit(deal)}>
                                        <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                                      </Button>
                                    </div>
                                  </div>
                                  <CardTitle className="text-lg leading-tight mt-2">{deal.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4 flex-1">
                                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{deal.description}</p>
                                  <div className="inline-block bg-primary/10 text-primary font-bold px-2.5 py-1 rounded-md text-xs mb-3 border border-primary/20">
                                    {deal.offerText}
                                  </div>
                                  
                                  {deal.reviewNote && (
                                    <div className="bg-destructive/5 text-destructive text-xs p-2 rounded border border-destructive/20 mt-2">
                                      <span className="font-bold block">Let op:</span>
                                      {deal.reviewNote}
                                    </div>
                                  )}
                                </CardContent>
                                <CardFooter className="pt-0 border-t border-border/40 pb-4 flex justify-between items-center bg-muted/5 mt-auto">
                                  <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mt-3">
                                    <Calendar className="w-3 h-3" />
                                    T/m {format(new Date(deal.validUntil), 'd MMM yyyy', { locale: nl })}
                                  </div>
                                  {deal.status !== 'withdrawn' && (
                                    <Button variant="ghost" size="sm" onClick={() => withdrawDeal(deal.id)} className="h-7 mt-3 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                      Intrekken
                                    </Button>
                                  )}
                                </CardFooter>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-16 bg-card rounded-2xl border border-border/50">
                            <Tag className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-foreground mb-2">Geen deals</h3>
                            <p className="text-muted-foreground text-sm">Je hebt nog geen deals aangemaakt voor dit profiel.</p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Profile Edit Dialog */}
      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bedrijfsprofiel bewerken</DialogTitle>
            <DialogDescription>
              Pas de openbare gegevens van je bedrijf aan.
            </DialogDescription>
          </DialogHeader>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={profileForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Bedrijfsnaam</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={profileForm.control} name="tagline" render={({ field }) => (
                  <FormItem><FormLabel>Korte slogan</FormLabel><FormControl><Input placeholder="De beste koffie in town" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={profileForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Beschrijving</FormLabel><FormControl><Textarea className="h-24" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={profileForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Telefoon</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={profileForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>E-mail (openbaar)</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={profileForm.control} name="websiteUrl" render={({ field }) => (
                <FormItem><FormLabel>Website URL</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <FormField control={profileForm.control} name="openingHours" render={({ field }) => (
                <FormItem><FormLabel>Openingstijden</FormLabel><FormControl><Textarea placeholder="Ma: 09:00 - 18:00&#10;Di: ..." className="h-24" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={profileForm.control} name="logoUrl" render={({ field }) => (
                  <FormItem><FormLabel>Logo URL</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={profileForm.control} name="coverUrl" render={({ field }) => (
                  <FormItem><FormLabel>Cover URL</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsEditProfileOpen(false)}>Annuleren</Button>
                <Button type="submit" disabled={updateProfile.isPending}>Opslaan</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Deal Create/Edit Dialog */}
      <Dialog open={isDealModalOpen} onOpenChange={setIsDealModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDealId ? 'Deal bewerken' : 'Nieuwe deal aanmaken'}</DialogTitle>
            <DialogDescription>
              Vul de details van je actie in. Nieuwe of gewijzigde deals worden door de redactie beoordeeld.
            </DialogDescription>
          </DialogHeader>
          <Form {...dealForm}>
            <form onSubmit={dealForm.handleSubmit(onDealSubmit)} className="space-y-4 py-4">
              <FormField control={dealForm.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Titel</FormLabel><FormControl><Input placeholder="2e kopje koffie gratis" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={dealForm.control} name="category" render={({ field }) => (
                  <FormItem><FormLabel>Categorie</FormLabel><FormControl><Input placeholder="Horeca, Kleding, etc." {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={dealForm.control} name="offerText" render={({ field }) => (
                  <FormItem><FormLabel>Korte Actietekst</FormLabel><FormControl><Input placeholder="50% korting, 1+1, etc." {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={dealForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Beschrijving</FormLabel><FormControl><Textarea className="h-20" placeholder="Uitgebreide omschrijving van de actie en voorwaarden..." {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={dealForm.control} name="validFrom" render={({ field }) => (
                  <FormItem><FormLabel>Geldig vanaf</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={dealForm.control} name="validUntil" render={({ field }) => (
                  <FormItem><FormLabel>Geldig tot</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={dealForm.control} name="couponCode" render={({ field }) => (
                  <FormItem><FormLabel>Kortingscode (optioneel)</FormLabel><FormControl><Input placeholder="ZOMER2024" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={dealForm.control} name="redemptionUrl" render={({ field }) => (
                  <FormItem><FormLabel>Webshop URL (optioneel)</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={dealForm.control} name="imageUrl" render={({ field }) => (
                <FormItem><FormLabel>Afbeelding URL (optioneel)</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsDealModalOpen(false)}>Annuleren</Button>
                <Button type="submit" disabled={createDeal.isPending || updateDeal.isPending}>Opslaan</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
