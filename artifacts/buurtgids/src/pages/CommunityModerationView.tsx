import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { enUS, nl as nlLocale } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, LoaderCircle, MapPin, Calendar, Search } from 'lucide-react';

import {
  useGetCommunityModerationPosts,
  getGetCommunityModerationPostsQueryKey,
  useDecideCommunityPost,
  type GetCommunityModerationPostsStatus,
  type CommunityPost
} from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useEditorAccess } from '../lib/editorAccess';

type Language = 'en' | 'nl';

const t = {
  en: {
    back: 'Back to sources',
    title: 'Community Moderation',
    intro: 'Review community submissions. Approve appropriate content and reject spam or inappropriate posts.',
    workspace: 'Editorial Workspace',
    status_pending: 'Pending',
    status_approved: 'Approved',
    status_rejected: 'Rejected',
    status_all: 'All',
    approve: 'Approve',
    reject: 'Reject',
    rejectDialogTitle: 'Reject Post',
    rejectDialogDesc: 'Are you sure you want to reject this post? Provide an optional reason.',
    rejectReason: 'Reason for rejection (optional)',
    cancel: 'Cancel',
    confirmReject: 'Confirm Rejection',
    loading: 'Loading queue...',
    emptyTitle: 'No posts found',
    emptyDesc: 'The moderation queue is clear.',
    error: 'Failed to load posts.',
    successApprove: 'Post approved successfully.',
    successReject: 'Post rejected successfully.',
    errorDecision: 'Failed to apply decision.',
    type: 'Type',
    city: 'City',
    neighborhood: 'Neighborhood',
    submittedAt: 'Submitted',
  },
  nl: {
    back: 'Terug naar bronnen',
    title: 'Community Moderatie',
    intro: 'Beoordeel ingezonden berichten. Keur geschikte inhoud goed en wijs spam of ongepaste berichten af.',
    workspace: 'Redactie Omgeving',
    status_pending: 'In Afwachting',
    status_approved: 'Goedgekeurd',
    status_rejected: 'Afgewezen',
    status_all: 'Alles',
    approve: 'Goedkeuren',
    reject: 'Afwijzen',
    rejectDialogTitle: 'Bericht Afwijzen',
    rejectDialogDesc: 'Weet je zeker dat je dit bericht wilt afwijzen? Geef eventueel een reden op.',
    rejectReason: 'Reden voor afwijzing (optioneel)',
    cancel: 'Annuleren',
    confirmReject: 'Afwijzing Bevestigen',
    loading: 'Wachtrij laden...',
    emptyTitle: 'Geen berichten gevonden',
    emptyDesc: 'De moderatiewachtrij is leeg.',
    error: 'Kon berichten niet laden.',
    successApprove: 'Bericht succesvol goedgekeurd.',
    successReject: 'Bericht succesvol afgewezen.',
    errorDecision: 'Beslissing kon niet worden toegepast.',
    type: 'Type',
    city: 'Stad',
    neighborhood: 'Buurt',
    submittedAt: 'Ingezonden',
  }
};

export default function CommunityModerationView() {
  const { isLoaded, isEditor } = useEditorAccess();
  const queryClient = useQueryClient();
  
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem('buurtplaza-language') === 'nl' ? 'nl' : 'en';
  });

  useEffect(() => {
    window.localStorage.setItem('buurtplaza-language', language);
    document.documentElement.lang = language;
  }, [language]);

  const copy = t[language];
  const dateLocale = language === 'nl' ? nlLocale : enUS;

  const [status, setStatus] = useState<GetCommunityModerationPostsStatus>('pending');
  const [rejectingPost, setRejectingPost] = useState<CommunityPost | null>(null);

  const queryParams = { status: status === 'all' ? undefined : status };

  const { data: posts, isLoading, isError, error, refetch } = useGetCommunityModerationPosts(queryParams, {
    query: {
      queryKey: getGetCommunityModerationPostsQueryKey(queryParams)
    }
  });

  const decideMutation = useDecideCommunityPost();

  const handleApprove = (id: number) => {
    decideMutation.mutate({
      id,
      data: { decision: 'approve' }
    }, {
      onSuccess: () => {
        toast.success(copy.successApprove);
        queryClient.invalidateQueries({ queryKey: getGetCommunityModerationPostsQueryKey() });
      },
      onError: () => {
        toast.error(copy.errorDecision);
      }
    });
  };

  if (isLoaded && !isEditor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-5 max-w-md">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground font-medium">You need editorial privileges to view the community moderation queue.</p>
          <Button asChild className="rounded-full font-bold px-8 mt-4"><Link href="/">Return to Home</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-background pb-20 font-sans">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-7">
          <Link href="/bronnen" className="rounded-full p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-0.5">{copy.workspace}</p>
            <h1 className="truncate text-lg font-extrabold tracking-tight text-foreground sm:text-xl">{copy.title}</h1>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <div className="inline-flex rounded-full border border-border bg-background p-0.5">
              {(['nl', 'en'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setLanguage(option)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    language === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--accent)),_transparent_62%)]">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-7">
          <div className="max-w-2xl">
            <h2 className="mb-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl leading-tight">
              {copy.title}
            </h2>
            <p className="text-base font-medium leading-relaxed text-muted-foreground">
              {copy.intro}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
        <div className="mb-8 flex flex-wrap items-center gap-2.5 bg-muted/50 p-1.5 rounded-full w-max">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary",
                status === s 
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border" 
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              {copy[`status_${s}` as keyof typeof copy]}
              {posts && s === status && ` (${posts.length})`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-4 text-muted-foreground">
            <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-bold uppercase tracking-wider">{copy.loading}</p>
          </div>
        ) : isError ? (
          <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center text-destructive max-w-md mx-auto mt-8">
            <AlertCircle className="mx-auto mb-3 h-10 w-10 opacity-80" />
            <p className="font-extrabold text-lg mb-1">{copy.error}</p>
            <p className="text-sm font-medium opacity-80 mb-6">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <Button onClick={() => refetch()} variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 font-bold rounded-full">
              Retry
            </Button>
          </div>
        ) : posts && posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-24 text-center shadow-sm">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-5">
              <Search className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h2 className="mb-2 text-xl font-extrabold text-foreground">{copy.emptyTitle}</h2>
            <p className="text-sm font-medium text-muted-foreground">{copy.emptyDesc}</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {posts?.map(post => (
              <ModerationCard 
                key={post.id} 
                post={post}
                copy={copy}
                dateLocale={dateLocale}
                onApprove={() => handleApprove(post.id)}
                onReject={() => setRejectingPost(post)}
                isApproving={decideMutation.isPending && decideMutation.variables?.id === post.id && decideMutation.variables?.data.decision === 'approve'}
              />
            ))}
          </div>
        )}
      </div>

      <RejectDialog 
        post={rejectingPost}
        open={!!rejectingPost}
        onOpenChange={(open) => !open && setRejectingPost(null)}
        copy={copy}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: getGetCommunityModerationPostsQueryKey() });
        }}
      />
    </main>
  );
}

function ModerationCard({ 
  post, 
  copy, 
  dateLocale, 
  onApprove, 
  onReject, 
  isApproving 
}: { 
  post: CommunityPost;
  copy: any;
  dateLocale: any;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
}) {
  return (
    <article className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md sm:flex-row sm:items-stretch group">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
            post.status === 'pending' ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
            post.status === 'approved' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
            "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          )}>
            {copy[`status_${post.status}`]}
          </span>
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
            {post.type}
          </span>
          <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            {post.cityId}
          </span>
        </div>
        
        <h3 className="mb-3 text-xl font-extrabold leading-snug text-foreground">
          {post.title}
        </h3>
        
        <p className="mb-6 text-base font-medium leading-relaxed text-muted-foreground whitespace-pre-wrap flex-1">
          {post.body}
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-muted-foreground mt-auto pt-4 border-t border-border">
          {post.neighborhood && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 opacity-50" />
              <span className="uppercase tracking-wide">{copy.neighborhood}:</span> 
              <span className="text-foreground">{post.neighborhood}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 opacity-50" />
            <span className="uppercase tracking-wide">{copy.submittedAt}:</span> 
            <span className="text-foreground">{format(parseISO(post.createdAt), 'PPp', { locale: dateLocale })}</span>
          </div>
        </div>
        
        {post.reviewNote && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive font-medium border border-destructive/10">
            <span className="font-extrabold uppercase tracking-wider text-[11px] block mb-1 opacity-80">Review Note</span> 
            {post.reviewNote}
          </div>
        )}
      </div>

      {post.status === 'pending' && (
        <div className="flex shrink-0 flex-col justify-center gap-3 border-t border-border pt-5 sm:w-48 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <Button 
            onClick={onApprove} 
            disabled={isApproving}
            className="w-full justify-center gap-2 font-bold h-12 rounded-full shadow-sm"
          >
            {isApproving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {copy.approve}
          </Button>
          <Button 
            variant="outline" 
            onClick={onReject}
            className="w-full justify-center gap-2 font-bold h-12 rounded-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <XCircle className="h-5 w-5" />
            {copy.reject}
          </Button>
        </div>
      )}
    </article>
  );
}

function RejectDialog({ 
  post, 
  open, 
  onOpenChange, 
  copy, 
  onSuccess 
}: { 
  post: CommunityPost | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  copy: any;
  onSuccess: () => void;
}) {
  const mutation = useDecideCommunityPost();
  const [reason, setReason] = useState('');

  // Reset reason when dialog opens
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleReject = () => {
    if (!post) return;
    mutation.mutate({
      id: post.id,
      data: {
        decision: 'reject',
        reviewNote: reason.trim() || undefined
      }
    }, {
      onSuccess: () => {
        toast.success(copy.successReject);
        onSuccess();
        onOpenChange(false);
      },
      onError: () => {
        toast.error(copy.errorDecision);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden border-border bg-card rounded-2xl shadow-xl">
        <div className="bg-destructive/5 px-6 py-5 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-destructive text-xl font-extrabold">
              <AlertCircle className="h-6 w-6" />
              {copy.rejectDialogTitle}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground mt-2">
              {copy.rejectDialogDesc}
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="px-6 py-6">
          <label className="text-[11px] font-black uppercase tracking-wider text-foreground mb-2.5 block">{copy.rejectReason}</label>
          <Textarea 
            value={reason} 
            onChange={e => setReason(e.target.value)} 
            className="resize-none min-h-[100px] font-medium bg-background border-border shadow-none p-3"
            placeholder="..."
          />
        </div>
        
        <DialogFooter className="px-6 py-5 border-t border-border bg-muted/30 sm:justify-between items-center flex-row gap-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold rounded-full h-11 px-6 text-muted-foreground hover:text-foreground">
            {copy.cancel}
          </Button>
          <Button variant="destructive" onClick={handleReject} disabled={mutation.isPending} className="font-bold rounded-full h-11 px-8 gap-2">
            {mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {copy.confirmReject}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
