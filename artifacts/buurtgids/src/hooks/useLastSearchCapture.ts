import { useEffect } from 'react';
import { getGetAccountLastSearchQueryKey, getGetAccountMeQueryKey, useGetAccountMe, usePutAccountLastSearch, type AccountLastSearchInput } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccountAuth } from '@/lib/accountAuth';
import { featureFlags } from '@/lib/featureFlags';
import { parseDiscoveryUrlState } from '@/lib/discoveryUrlState';

/**
 * Reads the already public URL and existing discovery context. It does not
 * update discovery state, invoke geolocation, or start a provider search.
 */
export function useLastSearchCapture(context: {
  cityId: string;
  viewport: { center: { lat: number; lng: number }; zoom: number } | null;
  selectedListing: { source: 'google_maps' | 'openstreetmap' | 'curated' | 'source_scan'; id: string } | null;
  neighborhoodNames: string[];
  categoryNames: string[];
  locale: 'nl' | 'en';
}) {
  const auth = useAccountAuth();
  const client = useQueryClient();
  const enabled = featureFlags.lastSearch && auth.isLoaded && auth.isSignedIn && !!auth.userId;
  const me = useGetAccountMe({ query: { enabled, queryKey: [...getGetAccountMeQueryKey(), auth.userId], retry: false } });
  const put = usePutAccountLastSearch();
  const { cityId, viewport, selectedListing, neighborhoodNames, categoryNames } = context;
  const publicSearch = typeof window === 'undefined' ? '' : window.location.search;
  useEffect(() => {
    if (!enabled || !me.data || me.data.preferences?.retainLastSearch === false) return;
    if (!window.location.pathname.startsWith('/activiteiten/')) return;
    const publicParams = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV) publicParams.delete('e2eAccountAuth');
    const parsed = parseDiscoveryUrlState(publicParams);
    if (!parsed.valid) return;
    const state = parsed.state;
    const fingerprint = JSON.stringify({
      publicSearch, neighborhoodNames, categoryNames, selectedListing,
      zoom: viewport?.zoom, lat: viewport?.center.lat, lng: viewport?.center.lng,
    });
    const restoreMarkerKey = 'buurtplaza-last-search-restore';
    const markerRaw = window.sessionStorage.getItem(restoreMarkerKey);
    if (markerRaw) {
      try {
        const marker = JSON.parse(markerRaw) as { userId: string; savedAt: number; fingerprint?: string };
        if (marker.userId === auth.userId && Date.now() - marker.savedAt < 60_000) {
          if (!marker.fingerprint) window.sessionStorage.setItem(restoreMarkerKey, JSON.stringify({ ...marker, fingerprint }));
          if (!marker.fingerprint || marker.fingerprint === fingerprint) return;
        }
      } catch { /* Discard malformed session marker. */ }
      window.sessionStorage.removeItem(restoreMarkerKey);
    }
    const data: AccountLastSearchInput = {
      cityId,
      section: state.section,
      neighborhoodIds: neighborhoodNames.slice(0, 20).map((name) =>
        `dhg:${name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`),
      categoryIds: categoryNames.slice(0, 20).map((name) =>
        `category:${name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`),
      ...(state.postcode ? { query: state.postcode } : {}),
      locale: context.locale,
      sourceScope: state.scope,
      presentationMode: 'map',
      ...(selectedListing ? { selectedListing } : {}),
      ...(viewport && Number.isFinite(viewport.zoom) ? {
        zoom: Math.round(viewport.zoom),
        centerLat: viewport.center.lat,
        centerLng: viewport.center.lng,
      } : {}),
    };
    const timer = window.setTimeout(() => {
      void put.mutateAsync({ data }).then(() => {
        void client.invalidateQueries({ queryKey: [...getGetAccountLastSearchQueryKey(), auth.userId] });
      }).catch(() => { /* Capture must never interrupt discovery. */ });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [auth.userId, cityId, client, enabled, me.data, context.locale, publicSearch, selectedListing?.id, selectedListing?.source, viewport?.zoom, viewport?.center.lat, viewport?.center.lng, neighborhoodNames.join(','), categoryNames.join(',')]);
}