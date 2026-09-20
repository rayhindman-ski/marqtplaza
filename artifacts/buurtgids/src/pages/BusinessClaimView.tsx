import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth, SignInButton } from '@clerk/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCreateBusinessClaim, getGetMyBusinessClaimsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Store, Briefcase, User, Mail, ChevronRight, FileImage, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { sanitizeReturnPath } from '@/lib/returnPath';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const claimSchema = z.object({
  contactName: z.string().min(2, 'Naam moet minimaal 2 karakters lang zijn.').max(120),
  contactEmail: z.string().email('Ongeldig e-mailadres.'),
  relationship: z.string().min(2, 'Vul je functie/relatie in.').max(120),
  evidenceUrl: z.string().url('Ongeldige URL.').optional().or(z.literal('')),
  message: z.string().max(1200, 'Bericht is te lang.').optional().or(z.literal('')),
});

type ClaimFormValues = z.infer<typeof claimSchema>;

export default function BusinessClaimView() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const authReturnPath = sanitizeReturnPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    basePath,
  );
  const forceRedirectUrl = `${basePath}${authReturnPath ?? '/account'}`;
  
  const listingId = searchParams.get('listingId');
  const cityId = searchParams.get('cityId');
  const listingSource = searchParams.get('listingSource');
  const name = searchParams.get('name') || '';
  const address = searchParams.get('address') || '';

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      contactName: '',
      contactEmail: '',
      relationship: '',
      evidenceUrl: '',
      message: '',
    },
  });

  const createClaim = useCreateBusinessClaim();

  useEffect(() => {
    document.title = 'Bedrijf Claimen | Buurtplaza';
  }, []);

  if (!listingId || !cityId || !listingSource || !name) {
    return (
      <div className="container max-w-2xl py-20 text-center">
        <h1 className="text-3xl font-bold text-foreground mb-4">Oeps, er ontbreekt informatie</h1>
        <p className="text-muted-foreground mb-8">We konden de locatie die je wilt claimen niet vinden. Ga terug naar de kaart en probeer het opnieuw.</p>
        <Button onClick={() => setLocation('/')} variant="outline">Terug naar de kaart</Button>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-accent/30">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Log in om je bedrijf te claimen</h1>
          <p className="text-lg text-muted-foreground">
            Je staat op het punt om <strong>{name}</strong> te claimen op Buurtplaza. Log in of maak een account aan om verder te gaan.
          </p>
          <div className="pt-4">
            <SignInButton mode="modal" forceRedirectUrl={forceRedirectUrl}>
              <Button size="lg" className="w-full font-bold text-lg h-14">
                Inloggen / Registreren
              </Button>
            </SignInButton>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = (data: ClaimFormValues) => {
    createClaim.mutate({
      data: {
        listing: {
          listingId,
          cityId,
          listingSource,
          name,
          address,
        },
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        relationship: data.relationship,
        evidenceUrl: data.evidenceUrl || undefined,
        message: data.message || undefined,
      }
    }, {
      onSuccess: () => {
        toast.success('Claim succesvol ingediend', {
          description: 'We zullen je aanvraag zo snel mogelijk beoordelen.'
        });
        queryClient.invalidateQueries({ queryKey: getGetMyBusinessClaimsQueryKey() });
        setLocation('/mijn-bedrijf');
      },
      onError: (error) => {
        toast.error('Er is iets misgegaan', {
          description: error instanceof Error ? error.message : 'Kon de claim niet indienen.'
        });
      }
    });
  };

  return (
    <div className="min-h-screen bg-accent/20 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">Claim dit bedrijf</h1>
          <p className="text-lg text-muted-foreground">Beheer je vermelding en bereik de buurt.</p>
        </div>

        <Card className="border-primary/20 shadow-md">
          <CardHeader className="bg-card pb-6 border-b border-border/50">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl sm:text-2xl">{name}</CardTitle>
                {address && <CardDescription className="text-base mt-1">{address}</CardDescription>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground"/> Jouw naam</FormLabel>
                        <FormControl>
                          <Input placeholder="Jan de Vries" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground"/> Zakelijk e-mailadres</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jan@bedrijf.nl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="relationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-muted-foreground"/> Functie / Rol</FormLabel>
                      <FormControl>
                        <Input placeholder="Eigenaar, Bedrijfsleider, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted/30 p-5 rounded-xl border border-border/50 space-y-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <FileImage className="w-5 h-5 text-primary" />
                    Bewijs van eigenaarschap
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Om fraude te voorkomen, vragen we om een link naar een webpagina, social media post, of ander publiek bewijs dat aantoont dat jij bij dit bedrijf hoort.
                  </p>
                  
                  <FormField
                    control={form.control}
                    name="evidenceUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL (optioneel, maar aanbevolen)</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-muted-foreground"/> Extra toelichting voor de redactie (optioneel)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Bijvoorbeeld: we hebben net een nieuwe locatie geopend..." className="resize-none h-24" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setLocation('/')}>
                    Annuleren
                  </Button>
                  <Button type="submit" disabled={createClaim.isPending} className="font-bold">
                    {createClaim.isPending ? 'Bezig...' : 'Claim indienen'}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
