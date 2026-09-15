import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useLocation } from 'wouter';
import { 
  useGetBusinessClaimModeration, 
  getGetBusinessClaimModerationQueryKey,
  useDecideBusinessClaim,
  useGetDealModeration,
  getGetDealModerationQueryKey,
  useDecideBusinessDeal,
  ModerationDecisionDecision,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { 
  Check, X, Building2, Store, Tag, Clock, 
  AlertCircle, Globe, Mail, Phone, ChevronRight, FileImage, 
  ArrowUpRight, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useEditorAccess } from '@/lib/editorAccess';
import { featureFlags } from '@/lib/featureFlags';
import { BusinessReviewPanel } from './BusinessReviewPanel';
import { AccountSupportPanel } from './AccountSupportPanel';
import { accountSupportTranslations, businessReviewTranslations, reviewWorkspaceTranslations } from '@/lib/i18n';
import { useAppLanguage } from '@/lib/useAppLanguage';

// Minimal editor check based on role - assuming editor access checks are done elsewhere, 
// but we just render if logged in as per requirement.

export default function BusinessModerationView() {
  const { isSignedIn, isLoaded, isEditor } = useEditorAccess();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('claims');
  const [reviewLanguage] = useAppLanguage();
  const supportCopy = accountSupportTranslations[reviewLanguage];
  const workspaceCopy = reviewWorkspaceTranslations[reviewLanguage];
  const accessCopy = businessReviewTranslations[reviewLanguage].access;
  const tabCopy = businessReviewTranslations[reviewLanguage].tabs;
  const tabCount = 2 + (featureFlags.businessPublication ? 3 : 0) + (featureFlags.accounts ? 2 : 0);
  
  // Claim Queries & Mutations
  const { data: claims, isLoading: claimsLoading } = useGetBusinessClaimModeration(
    { status: 'pending' }, 
    { query: { enabled: !!isSignedIn && isEditor, queryKey: getGetBusinessClaimModerationQueryKey({ status: 'pending' }) } }
  );
  const decideClaim = useDecideBusinessClaim();

  // Deal Queries & Mutations
  const { data: deals, isLoading: dealsLoading } = useGetDealModeration(
    { status: 'pending' },
    { query: { enabled: !!isSignedIn && isEditor, queryKey: getGetDealModerationQueryKey({ status: 'pending' }) } }
  );
  const decideDeal = useDecideBusinessDeal();

  // Dialog State
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionItem, setDecisionItem] = useState<{ type: 'claim' | 'deal'; id: number; action: ModerationDecisionDecision; version?: number } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    document.title = workspaceCopy.documentTitle;
  }, [workspaceCopy.documentTitle]);

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4">{accessCopy.signedOutTitle}</h1>
        <p className="text-muted-foreground mb-6">{accessCopy.signedOutBody}</p>
        <Button onClick={() => setLocation('/')}>{accessCopy.signedOutAction}</Button>
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-accent/20">
        <div className="max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-6 opacity-80" />
          <h1 className="text-3xl font-extrabold text-foreground mb-4">{accessCopy.notEditorTitle}</h1>
          <p className="text-muted-foreground mb-8 text-lg">{accessCopy.notEditorBody}</p>
          <Button onClick={() => setLocation('/')}>{accessCopy.notEditorAction}</Button>
        </div>
      </div>
    );
  }

  const openDecisionModal = (type: 'claim' | 'deal', id: number, action: ModerationDecisionDecision, version?: number) => {
    setDecisionItem({ type, id, action, version });
    setReviewNote('');
    setIsDecisionModalOpen(true);
  };

  const submitDecision = () => {
    if (!decisionItem) return;
    
    const payload = {
      decision: decisionItem.action,
      reviewNote: reviewNote || undefined
    };

    if (decisionItem.type === 'claim') {
      decideClaim.mutate({
        id: decisionItem.id,
        // The decision is bound to the claim version shown in this queue; a stale tab gets 409.
        data: { ...payload, expectedVersion: decisionItem.version }
      }, {
        onSuccess: () => {
          toast.success(`Claim ${decisionItem.action === 'approve' ? 'goedgekeurd' : decisionItem.action === 'request_changes' ? 'teruggestuurd voor wijzigingen' : 'afgewezen'}`);
          setIsDecisionModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetBusinessClaimModerationQueryKey({ status: 'pending' }) });
        },
        onError: (error: unknown) => {
          const status = (error as { response?: { status?: number }; status?: number })?.response?.status ?? (error as { status?: number })?.status;
          toast.error(status === 409
            ? 'Deze claim is intussen gewijzigd. De wachtrij is ververst; beoordeel de actuele versie.'
            : 'Beslissing kon niet worden opgeslagen.');
          setIsDecisionModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetBusinessClaimModerationQueryKey({ status: 'pending' }) });
        }
      });
    } else {
      decideDeal.mutate({
        id: decisionItem.id,
        data: payload
      }, {
        onSuccess: () => {
          toast.success(`Deal ${decisionItem.action === 'approve' ? 'goedgekeurd' : 'afgewezen'}`);
          setIsDecisionModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetDealModerationQueryKey({ status: 'pending' }) });
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-accent/20 pb-20">
      <div className="bg-primary/5 py-10 border-b border-primary/10">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6">
          <Badge variant="outline" className="mb-4 bg-background text-primary border-primary/30 font-bold uppercase tracking-widest">
            {workspaceCopy.badge}
          </Badge>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3" data-testid="review-workspace-title">
            {workspaceCopy.title}
          </h1>
          <p className="text-muted-foreground mt-2" data-testid="review-workspace-intro">{workspaceCopy.intro}</p>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`flex flex-wrap justify-start gap-1 w-full ${tabCount >= 5 ? 'max-w-5xl' : tabCount > 2 ? 'max-w-3xl' : 'max-w-md'} mb-8 bg-card border-border/50 shadow-sm p-1 rounded-xl h-auto`} data-testid="review-workspace-tabs">
            <TabsTrigger value="claims" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg flex gap-2">
              Claims {claims && claims.length > 0 && <Badge variant="secondary" className="bg-primary text-primary-foreground text-[10px] py-0 px-1.5 h-4 min-w-4">{claims.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="deals" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg flex gap-2">
              Deals {deals && deals.length > 0 && <Badge variant="secondary" className="bg-primary text-primary-foreground text-[10px] py-0 px-1.5 h-4 min-w-4">{deals.length}</Badge>}
            </TabsTrigger>
            {featureFlags.businessPublication && (
              <>
                <TabsTrigger value="authority" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg" data-testid="tab-authority">{tabCopy.authority}</TabsTrigger>
                <TabsTrigger value="editorial" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg" data-testid="tab-editorial">{tabCopy.editorial}</TabsTrigger>
                <TabsTrigger value="publication" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg" data-testid="tab-publication">{tabCopy.publication}</TabsTrigger>
              </>
            )}
            {featureFlags.accounts && (
              <>
                <TabsTrigger value="account-requests" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg" data-testid="tab-account-requests">{supportCopy.tabRequests}</TabsTrigger>
                <TabsTrigger value="lifecycle-messages" className="flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto min-w-fit whitespace-nowrap px-4 py-2.5 font-bold data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg" data-testid="tab-lifecycle-messages">{supportCopy.tabMessages}</TabsTrigger>
              </>
            )}
          </TabsList>

          {featureFlags.accounts && (
            <>
              <TabsContent value="account-requests" className="mt-0"><AccountSupportPanel section="requests" enabled={activeTab === 'account-requests'} /></TabsContent>
              <TabsContent value="lifecycle-messages" className="mt-0"><AccountSupportPanel section="messages" enabled={activeTab === 'lifecycle-messages'} /></TabsContent>
            </>
          )}

          {featureFlags.businessPublication && (
            <>
              <TabsContent value="authority" className="mt-0"><BusinessReviewPanel section="authority" enabled={activeTab === 'authority'} /></TabsContent>
              <TabsContent value="editorial" className="mt-0"><BusinessReviewPanel section="editorial" enabled={activeTab === 'editorial'} /></TabsContent>
              <TabsContent value="publication" className="mt-0"><BusinessReviewPanel section="publication" enabled={activeTab === 'publication'} /></TabsContent>
            </>
          )}
          
          <TabsContent value="claims" className="space-y-6 mt-0">
            {claimsLoading ? (
              <div className="space-y-4">
                {[1, 2].map(i => (
                  <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl border border-border/50" />
                ))}
              </div>
            ) : claims?.length === 0 ? (
              <div className="text-center py-20 bg-card rounded-2xl border border-border/50 shadow-sm">
                <Check className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-foreground mb-2">Alle claims zijn verwerkt</h3>
                <p className="text-muted-foreground">Er zijn op dit moment geen openstaande claims.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {claims?.map(claim => (
                  <Card key={claim.id} className="border-border/60 shadow-sm overflow-hidden">
                    <div className="bg-muted/30 border-b border-border/40 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{claim.profile.name}</h3>
                          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Ingediend op {format(new Date(claim.createdAt), 'dd-MM-yyyy HH:mm', { locale: nl })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">Nieuwe Claim</Badge>
                    </div>
                    <CardContent className="p-6">
                      <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Contactpersoon</h4>
                            <div className="bg-muted/20 p-3 rounded-lg border border-border/40 space-y-1">
                              <p className="font-semibold text-foreground">{claim.contactName}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5"/> {claim.contactEmail}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{claim.relationship}</Badge></p>
                            </div>
                          </div>
                          {claim.message && (
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Bericht</h4>
                              <div className="bg-muted/20 p-3 rounded-lg border border-border/40 text-sm text-foreground italic border-l-4 border-l-primary/50">
                                "{claim.message}"
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Bewijs</h4>
                            {claim.authorityDeclaration && (
                              <p className="text-sm text-foreground p-3 mb-2 bg-muted/20 rounded-lg border border-border/40 whitespace-pre-wrap">
                                {claim.authorityDeclaration}
                              </p>
                            )}
                            {claim.evidenceReference && (
                              <p className="text-sm text-foreground p-3 mb-2 bg-muted/20 rounded-lg border border-border/40 break-words">
                                {claim.evidenceReference}
                              </p>
                            )}
                            {claim.status === 'disputed' && (
                              <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Betwist: dit bedrijf heeft al een geverifieerde eigenaar. Goedkeuren is niet mogelijk.</p>
                            )}
                            {claim.evidenceUrl ? (
                              <a href={claim.evidenceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-primary/5 text-primary hover:bg-primary/10 transition-colors rounded-lg border border-primary/20 font-medium text-sm">
                                <ExternalLink className="w-4 h-4 shrink-0" />
                                <span className="truncate">{claim.evidenceUrl}</span>
                              </a>
                            ) : (
                              <div className="p-3 bg-muted/20 rounded-lg border border-border/40 text-sm text-muted-foreground italic flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                Geen url opgegeven
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Huidig Profiel Adres</h4>
                            <p className="text-sm text-foreground p-3 bg-muted/20 rounded-lg border border-border/40">
                              {claim.profile.address || 'Geen adres ingevuld'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 bg-muted/10 border-t border-border/40 flex justify-end gap-3">
                      <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-bold" onClick={() => openDecisionModal('claim', claim.id, 'reject', claim.version)}>
                        <X className="w-4 h-4 mr-1.5" /> Afwijzen
                      </Button>
                      <Button variant="outline" className="font-bold" onClick={() => openDecisionModal('claim', claim.id, 'request_changes', claim.version)}>
                        Wijzigingen vragen
                      </Button>
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => openDecisionModal('claim', claim.id, 'approve', claim.version)}>
                        <Check className="w-4 h-4 mr-1.5" /> Goedkeuren
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="deals" className="space-y-6 mt-0">
            {dealsLoading ? (
               <div className="space-y-4">
                 {[1, 2].map(i => (
                   <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl border border-border/50" />
                 ))}
               </div>
             ) : deals?.length === 0 ? (
               <div className="text-center py-20 bg-card rounded-2xl border border-border/50 shadow-sm">
                 <Check className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
                 <h3 className="text-xl font-bold text-foreground mb-2">Alle deals zijn verwerkt</h3>
                 <p className="text-muted-foreground">Er zijn op dit moment geen openstaande deals.</p>
               </div>
             ) : (
               <div className="grid md:grid-cols-2 gap-6">
                 {deals?.map(deal => (
                   <Card key={deal.id} className="border-border/60 shadow-sm flex flex-col">
                     <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
                       <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2 text-sm font-bold text-secondary">
                           <Store className="w-4 h-4" />
                           {deal.businessName || `Bedrijf #${deal.businessProfileId}`}
                         </div>
                         <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">Review</Badge>
                       </div>
                       <CardTitle className="text-xl leading-tight">{deal.title}</CardTitle>
                     </CardHeader>
                     <CardContent className="pt-4 flex-1 space-y-4">
                       <div>
                         <p className="text-sm text-foreground">{deal.description}</p>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                           <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Categorie</span>
                           <p className="text-sm font-medium">{deal.category}</p>
                         </div>
                         <div className="space-y-1">
                           <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actietekst</span>
                           <p className="text-sm font-bold text-primary">{deal.offerText}</p>
                         </div>
                       </div>
                       
                       <div className="bg-muted/20 p-3 rounded-lg text-xs space-y-2 border border-border/40">
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Geldig vanaf:</span>
                           <span className="font-medium">{format(new Date(deal.validFrom), 'dd-MM-yyyy')}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">Geldig tot:</span>
                           <span className="font-medium">{format(new Date(deal.validUntil), 'dd-MM-yyyy')}</span>
                         </div>
                         {deal.couponCode && (
                           <div className="flex justify-between">
                             <span className="text-muted-foreground">Kortingscode:</span>
                             <span className="font-bold">{deal.couponCode}</span>
                           </div>
                         )}
                       </div>
                     </CardContent>
                     <CardFooter className="p-4 bg-muted/10 border-t border-border/40 flex justify-between gap-3 mt-auto">
                       <Button variant="outline" size="sm" className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-bold" onClick={() => openDecisionModal('deal', deal.id, 'reject')}>
                         <X className="w-4 h-4 mr-1.5" /> Afwijzen
                       </Button>
                       <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => openDecisionModal('deal', deal.id, 'approve')}>
                         <Check className="w-4 h-4 mr-1.5" /> Goedkeuren
                       </Button>
                     </CardFooter>
                   </Card>
                 ))}
               </div>
             )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isDecisionModalOpen} onOpenChange={setIsDecisionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionItem?.action === 'approve' ? 'Goedkeuren' : decisionItem?.action === 'request_changes' ? 'Wijzigingen vragen' : 'Afwijzen'}
            </DialogTitle>
            <DialogDescription>
              {decisionItem?.action === 'request_changes'
                ? 'De aanvrager ziet jouw reden en kan de aanvraag aanvullen en opnieuw indienen.'
                : `Weet je zeker dat je deze ${decisionItem?.type === 'claim' ? 'claim' : 'deal'} wilt ${decisionItem?.action === 'approve' ? 'goedkeuren' : 'afwijzen'}?`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <label className="text-sm font-bold text-foreground">
              {decisionItem?.action === 'request_changes' ? 'Reden (verplicht)' : 'Reden / Opmerking (optioneel)'}
            </label>
            <Textarea 
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Typ hier een bericht voor de gebruiker..."
              className="resize-none h-24"
            />
            {decisionItem?.action === 'reject' && (
              <p className="text-xs text-muted-foreground mt-2">
                Het is sterk aanbevolen om een reden op te geven bij een afwijzing.
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDecisionModalOpen(false)}>Annuleren</Button>
            <Button 
              variant={decisionItem?.action === 'approve' ? 'default' : 'destructive'} 
              className={decisionItem?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold' : 'font-bold'}
              onClick={submitDecision}
              disabled={decideClaim.isPending || decideDeal.isPending || (decisionItem?.action === 'request_changes' && reviewNote.trim().length === 0)}
            >
              {decideClaim.isPending || decideDeal.isPending ? 'Bezig...' : 'Bevestigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
