import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { format, addDays, parseISO } from 'date-fns';
import { enUS, nl as nlLocale } from 'date-fns/locale';
import {
  ArrowLeft, Calendar, MapPin, AlertCircle, LoaderCircle, MessageSquare, Megaphone, HelpCircle, Lightbulb, HandHeart, Plus, Heart, CircleCheck
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

import {
  getGetRegistrationQueryKey,
  useGetCommunityPosts,
  getGetCommunityPostsQueryKey,
  useGetRegistration,
  useCreateCommunityPost,
  useToggleCommunityPostParticipation,
  type CommunityPost,
  CommunityPostType,
} from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { persistLanguage } from '@/lib/useAppLanguage';

type Language = 'en' | 'nl';

const t = {
  en: {
    back: 'Back',
    title: 'Community Board',
    intro: 'Connect with your neighbors. Share tips, ask for help, or announce local events.',
    newPost: 'New Post',
    filters: 'Filters',
    allTypes: 'All Categories',
    type_event: 'Event',
    type_question: 'Question',
    type_help_offer: 'Help Offered',
    type_help_request: 'Help Wanted',
    type_tip: 'Tip',
    type_announcement: 'Announcement',
    emptyTitle: 'No posts yet',
    emptyDesc: 'Be the first to post something in this area.',
    loading: 'Loading posts...',
    error: 'Failed to load posts.',
    retry: 'Retry',
    expires: 'Expires on',
    starts: 'Starts at',
    postDialogTitle: 'Create a Post',
    postDialogDesc: 'Share something with your neighborhood.',
    submit: 'Post',
    cancel: 'Cancel',
    formCity: 'City',
    formNeighborhood: 'Neighborhood (optional)',
    formType: 'Category',
    formTitle: 'Title',
    formBody: 'Message',
    formStartsAt: 'Event date (optional)',
    formExpiresAt: 'Expires On',
    city_dhg: 'Den Haag',
    city_ams: 'Amsterdam',
    city_rot: 'Rotterdam',
    city_utr: 'Utrecht',
    city_ein: 'Eindhoven',
    signInToPost: 'Sign in to post',
    signInToParticipate: 'Sign in to show your interest',
    interestAction: 'Interested',
    attendanceAction: "I'm going",
    participationError: 'Failed to update your response.',
    pendingApproval: 'Your post is pending review and will be visible shortly.',
    publishError: 'Failed to create post.',
    selectCity: 'Select a city',
    selectType: 'Select a category'
  },
  nl: {
    back: 'Terug',
    title: 'Buurtplein',
    intro: 'Kom in contact met je buren. Deel tips, vraag om hulp of kondig lokale evenementen aan.',
    newPost: 'Nieuw Bericht',
    filters: 'Filters',
    allTypes: 'Alle Categorieën',
    type_event: 'Evenement',
    type_question: 'Vraag',
    type_help_offer: 'Hulp Aangeboden',
    type_help_request: 'Hulp Gevraagd',
    type_tip: 'Tip',
    type_announcement: 'Aankondiging',
    emptyTitle: 'Nog geen berichten',
    emptyDesc: 'Wees de eerste die hier iets deelt.',
    loading: 'Berichten laden...',
    error: 'Kon berichten niet laden.',
    retry: 'Probeer opnieuw',
    expires: 'Verloopt op',
    starts: 'Begint op',
    postDialogTitle: 'Plaats een Bericht',
    postDialogDesc: 'Deel iets met je buurt.',
    submit: 'Plaatsen',
    cancel: 'Annuleren',
    formCity: 'Stad',
    formNeighborhood: 'Buurt (optioneel)',
    formType: 'Categorie',
    formTitle: 'Titel',
    formBody: 'Bericht',
    formStartsAt: 'Datum evenement (optioneel)',
    formExpiresAt: 'Verloopt op',
    city_dhg: 'Den Haag',
    city_ams: 'Amsterdam',
    city_rot: 'Rotterdam',
    city_utr: 'Utrecht',
    city_ein: 'Eindhoven',
    signInToPost: 'Log in om te plaatsen',
    signInToParticipate: 'Log in om je interesse te tonen',
    interestAction: 'Interesse',
    attendanceAction: 'Ik ga',
    participationError: 'Je reactie kon niet worden bijgewerkt.',
    pendingApproval: 'Je bericht wacht op goedkeuring en zal binnenkort zichtbaar zijn.',
    publishError: 'Bericht plaatsen mislukt.',
    selectCity: 'Kies een stad',
    selectType: 'Kies een categorie'
  }
};

const TYPE_ICONS = {
  event: Calendar,
  question: HelpCircle,
  help_offer: HandHeart,
  help_request: HandHeart,
  tip: Lightbulb,
  announcement: Megaphone,
};

const CITIES = ['dhg', 'ams', 'rot', 'utr', 'ein'] as const;

export default function CommunityFeedView() {
  const [_, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const registrationQuery = useGetRegistration({
    query: {
      enabled: Boolean(isLoaded && isSignedIn),
      queryKey: getGetRegistrationQueryKey(),
    },
  });
  const queryClient = useQueryClient();
  
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('buurtplaza-language') === 'nl' ? 'nl' : 'en';
  });

  useEffect(() => {
    persistLanguage(language);
  }, [language]);

  const copy = t[language];
  const dateLocale = language === 'nl' ? nlLocale : enUS;

  const [cityId, setCityId] = useState<string>('dhg');
  const [type, setType] = useState<CommunityPostType | 'all'>('all');
  const [isPostDialogOpen, setIsPostDialogOpen] = useState(false);

  const queryParams = {
    cityId,
    ...(type !== 'all' ? { type } : {})
  };

  const { data: posts, isLoading, isError, refetch } = useGetCommunityPosts(queryParams, {
    query: {
      queryKey: getGetCommunityPostsQueryKey(queryParams)
    }
  });
  const participationMutation = useToggleCommunityPostParticipation();

  const handleParticipation = (post: CommunityPost, action: 'interested' | 'attending') => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLocation('/sign-in');
      return;
    }
    if (registrationQuery.isLoading) return;
    if (!registrationQuery.data?.registered) {
      setLocation('/onboarding');
      return;
    }

    const active = action === 'attending' ? post.attendingByMe : post.interestedByMe;
    const nextActive = !active;
    const queryKey = getGetCommunityPostsQueryKey(queryParams);
    const patchPost = (current: CommunityPost[] | undefined, summary: {
      interestCount: number;
      attendanceCount: number;
      interestedByMe: boolean;
      attendingByMe: boolean;
    }) => current?.map((item) => item.id === post.id ? { ...item, ...summary } : item);

    queryClient.setQueryData<CommunityPost[]>(queryKey, (current) => patchPost(current, {
      interestCount: post.interestCount + (action === 'interested' ? (nextActive ? 1 : -1) : 0),
      attendanceCount: post.attendanceCount + (action === 'attending' ? (nextActive ? 1 : -1) : 0),
      interestedByMe: action === 'interested' ? nextActive : post.interestedByMe,
      attendingByMe: action === 'attending' ? nextActive : post.attendingByMe,
    }));

    participationMutation.mutate({
      id: post.id,
      data: { action, active: nextActive },
    }, {
      onSuccess: (summary) => {
        queryClient.setQueryData<CommunityPost[]>(queryKey, (current) => patchPost(current, summary));
      },
      onError: () => {
        queryClient.setQueryData<CommunityPost[]>(queryKey, (current) => patchPost(current, post));
        toast.error(copy.participationError);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    });
  };

  const handleNewPostClick = () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLocation('/sign-in');
    } else if (registrationQuery.isLoading) {
      return;
    } else if (!registrationQuery.data?.registered) {
      setLocation('/onboarding');
    } else {
      setIsPostDialogOpen(true);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#FDFBF7] text-[#1C1917] font-sans flex flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-bold text-stone-500 hover:text-stone-900 transition-colors w-24">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{copy.back}</span>
          </Link>

          <div className="flex items-center justify-center flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-stone-900 truncate">buurtplaza.nl</h1>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 w-24">
            <div className="inline-flex rounded-full border border-stone-200 bg-white p-0.5">
              {(['nl', 'en'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setLanguage(option)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors',
                    language === option ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-900'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12">
        <div className="flex flex-col md:flex-row gap-6 mb-10 items-start md:items-end justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-stone-900 mb-4 leading-tight">
              {copy.title}
            </h2>
            <p className="text-stone-600 text-base sm:text-lg leading-relaxed">
              {copy.intro}
            </p>
          </div>
          
          <Button onClick={handleNewPostClick} className="shrink-0 gap-2 rounded-full font-bold shadow-sm h-12 px-6 bg-stone-900 text-white hover:bg-stone-800 w-full md:w-auto">
            <Plus className="w-5 h-5" />
            {copy.newPost}
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 mb-10 p-4 bg-white rounded-2xl shadow-sm border border-stone-100">
          <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{copy.formCity}</label>
            <Select value={cityId} onValueChange={setCityId}>
              <SelectTrigger className="border-stone-200 bg-stone-50/50 font-semibold h-10 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map(c => (
                  <SelectItem key={c} value={c} className="font-medium cursor-pointer">
                    {copy[`city_${c}` as keyof typeof copy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col gap-1.5 w-full sm:w-[240px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{copy.formType}</label>
            <Select value={type} onValueChange={(v) => setType(v as CommunityPostType | 'all')}>
              <SelectTrigger className="border-stone-200 bg-stone-50/50 font-semibold h-10 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-medium cursor-pointer">{copy.allTypes}</SelectItem>
                {Object.values(CommunityPostType).map(t => (
                  <SelectItem key={t} value={t} className="font-medium cursor-pointer">
                    {copy[`type_${t}` as keyof typeof copy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-400 gap-4">
            <LoaderCircle className="w-8 h-8 animate-spin" />
            <p className="font-bold uppercase tracking-wider text-xs">{copy.loading}</p>
          </div>
        ) : isError ? (
          <div className="bg-red-50 text-red-700 p-8 rounded-2xl text-center flex flex-col items-center border border-red-100 mt-8">
            <AlertCircle className="w-10 h-10 mb-4 opacity-80" />
            <h3 className="text-lg font-bold mb-2">{copy.error}</h3>
            <Button onClick={() => refetch()} variant="outline" className="border-red-200 text-red-700 hover:bg-red-100 font-bold rounded-full">
              {copy.retry}
            </Button>
          </div>
        ) : posts && posts.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-3xl p-12 sm:p-20 text-center flex flex-col items-center shadow-sm">
            <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-6 border border-stone-100">
              <MessageSquare className="w-8 h-8 text-stone-400" />
            </div>
            <h3 className="text-2xl font-extrabold text-stone-900 mb-3">{copy.emptyTitle}</h3>
            <p className="text-stone-500 font-medium max-w-sm">{copy.emptyDesc}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {posts?.map(post => {
              const Icon = TYPE_ICONS[post.type] || MessageSquare;
              return (
                <article key={post.id} className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm hover:shadow-md transition-shadow flex flex-col group">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 text-stone-700 text-xs font-bold uppercase tracking-wide group-hover:bg-stone-200 transition-colors">
                      <Icon className="w-3.5 h-3.5" />
                      {copy[`type_${post.type}` as keyof typeof copy]}
                    </span>
                    {post.neighborhood && (
                      <span className="text-xs font-semibold text-stone-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {post.neighborhood}
                      </span>
                    )}
                  </div>
                  
                  <h3 className="text-xl sm:text-2xl font-extrabold text-stone-900 mb-4 leading-snug">{post.title}</h3>
                  <p className="text-stone-600 leading-relaxed whitespace-pre-wrap flex-1 mb-8 font-medium">{post.body}</p>
                  
                  <div className="pt-5 border-t border-stone-100 flex flex-col sm:flex-row flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-stone-400 mt-auto">
                    {post.startsAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-stone-300" />
                        <span className="uppercase tracking-wide">{copy.starts}:</span> 
                        <span className="text-stone-600">{format(parseISO(post.startsAt), 'PPp', { locale: dateLocale })}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-stone-300" />
                      <span className="uppercase tracking-wide">{copy.expires}:</span> 
                      <span className="text-stone-600">{format(parseISO(post.expiresAt), 'PP', { locale: dateLocale })}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-5">
                    <button
                      type="button"
                      onClick={() => handleParticipation(post, 'interested')}
                      disabled={participationMutation.isPending && participationMutation.variables?.id === post.id}
                      aria-pressed={post.interestedByMe}
                      aria-label={`${copy.interestAction} (${post.interestCount})`}
                      className={cn(
                        'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-extrabold transition-colors disabled:cursor-wait disabled:opacity-60',
                        post.interestedByMe
                          ? 'border-stone-900 bg-stone-900 text-white'
                          : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-400 hover:bg-white hover:text-stone-900'
                      )}
                    >
                      {participationMutation.isPending && participationMutation.variables?.id === post.id && participationMutation.variables?.data.action === 'interested'
                        ? <LoaderCircle className="h-4 w-4 animate-spin" />
                        : <Heart className={cn('h-4 w-4', post.interestedByMe && 'fill-current')} />}
                      <span>{copy.interestAction}</span>
                      <span className={cn('tabular-nums', post.interestedByMe ? 'text-stone-300' : 'text-stone-400')}>{post.interestCount}</span>
                    </button>
                    {post.type === 'event' && (
                      <button
                        type="button"
                        onClick={() => handleParticipation(post, 'attending')}
                        disabled={participationMutation.isPending && participationMutation.variables?.id === post.id}
                        aria-pressed={post.attendingByMe}
                        aria-label={`${copy.attendanceAction} (${post.attendanceCount})`}
                        className={cn(
                          'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-extrabold transition-colors disabled:cursor-wait disabled:opacity-60',
                          post.attendingByMe
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-emerald-400 hover:bg-white hover:text-emerald-800'
                        )}
                      >
                        {participationMutation.isPending && participationMutation.variables?.id === post.id && participationMutation.variables?.data.action === 'attending'
                          ? <LoaderCircle className="h-4 w-4 animate-spin" />
                          : <CircleCheck className="h-4 w-4" />}
                        <span>{copy.attendanceAction}</span>
                        <span className={cn('tabular-nums', post.attendingByMe ? 'text-emerald-100' : 'text-stone-400')}>{post.attendanceCount}</span>
                      </button>
                    )}
                    {!isSignedIn && isLoaded && (
                      <span className="ml-1 text-[11px] font-semibold text-stone-400">{copy.signInToParticipate}</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      <CreatePostDialog 
        open={isPostDialogOpen} 
        onOpenChange={setIsPostDialogOpen} 
        language={language}
        copy={copy}
        defaultCityId={cityId}
      />
    </div>
  );
}

function CreatePostDialog({ open, onOpenChange, copy, defaultCityId }: { open: boolean, onOpenChange: (o: boolean) => void, language: Language, copy: any, defaultCityId: string }) {
  const queryClient = useQueryClient();
  const mutation = useCreateCommunityPost();

  const formSchema = z.object({
    cityId: z.string().min(1, copy.formCity),
    neighborhood: z.string().optional(),
    type: z.enum(['event', 'question', 'help_offer', 'help_request', 'tip', 'announcement']),
    title: z.string().min(3).max(120),
    body: z.string().min(10).max(2000),
    startsAt: z.string().optional(),
    expiresAt: z.string().min(1),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cityId: defaultCityId,
      neighborhood: '',
      type: 'question',
      title: '',
      body: '',
      startsAt: '',
      expiresAt: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    }
  });

  useEffect(() => {
    if (open) {
      form.reset({
        cityId: defaultCityId,
        neighborhood: '',
        type: 'question',
        title: '',
        body: '',
        startsAt: '',
        expiresAt: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
      });
    }
  }, [open, defaultCityId, form]);

  const onSubmit = (values: FormValues) => {
    mutation.mutate({
      data: {
        cityId: values.cityId,
        neighborhood: values.neighborhood || null,
        type: values.type as CommunityPostType,
        title: values.title,
        body: values.body,
        startsAt: values.startsAt || null,
        expiresAt: values.expiresAt,
      }
    }, {
      onSuccess: () => {
        toast.success(copy.pendingApproval);
        queryClient.invalidateQueries({ queryKey: getGetCommunityPostsQueryKey() });
        onOpenChange(false);
      },
      onError: () => {
        toast.error(copy.publishError);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden bg-white border-stone-200 shadow-xl rounded-2xl">
        <div className="bg-stone-50 px-6 sm:px-8 py-6 border-b border-stone-100">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-stone-900 flex items-center gap-3">
              <MessageSquare className="w-6 h-6 text-stone-400" />
              {copy.postDialogTitle}
            </DialogTitle>
            <DialogDescription className="text-base font-medium text-stone-500 mt-2">
              {copy.postDialogDesc}
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 sm:px-8 py-6 flex flex-col gap-5">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="cityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formCity}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-stone-50 border-stone-200 font-semibold h-11 shadow-none">
                          <SelectValue placeholder={copy.selectCity} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CITIES.map(c => (
                          <SelectItem key={c} value={c} className="font-medium cursor-pointer">
                            {copy[`city_${c}` as keyof typeof copy]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formType}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-stone-50 border-stone-200 font-semibold h-11 shadow-none">
                          <SelectValue placeholder={copy.selectType} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(CommunityPostType).map(t => (
                          <SelectItem key={t} value={t} className="font-medium cursor-pointer">
                            {copy[`type_${t}` as keyof typeof copy]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formNeighborhood}</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-stone-50 border-stone-200 font-medium h-11 shadow-none px-4" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formTitle}</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-stone-50 border-stone-200 font-medium h-11 shadow-none px-4" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formBody}</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="bg-stone-50 border-stone-200 font-medium min-h-[140px] resize-none shadow-none p-4" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formStartsAt}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="bg-stone-50 border-stone-200 font-medium h-11 shadow-none px-4" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-stone-900 text-xs uppercase tracking-wider">{copy.formExpiresAt}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="bg-stone-50 border-stone-200 font-medium h-11 shadow-none px-4" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="mt-6 pt-5 border-t border-stone-100 sm:justify-between items-center flex-row gap-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full h-11 px-6">
                {copy.cancel}
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="font-bold gap-2 rounded-full h-11 px-8 bg-stone-900 text-white hover:bg-stone-800">
                {mutation.isPending && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {copy.submit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
