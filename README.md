# buurtplaza.nl / marqtplaza.com — recreation prompt

Use the following single prompt to recreate the application as it currently exists:

> Build a polished, responsive web app called **buurtplaza.nl**, branded in the UI as **marqtplaza.com — The Digital Village Square**. It is a hyperlocal Dutch neighborhood guide: residents search a Dutch city or postcode, select neighborhoods, and discover events, businesses, food and drink, social-support locations, local news, deals, and community activity. The primary working city is **The Hague / Den Haag** (`dhg`), while the data model should remain extensible to Amsterdam, Rotterdam, Utrecht, and Eindhoven.
>
> ## Product principles
>
> - This is a neighborhood discovery product, not a generic nationwide directory.
> - Prefer trustworthy, current, local information over invented completeness.
> - Show the provenance of listings and make uncertainty visible.
> - Never silently turn missing or blocked source data into an empty successful result.
> - Events must remain events: do not replace an empty event result with generic attractions or businesses.
> - Keep the experience useful when external APIs are unavailable by showing clearly labeled curated, cached, OpenStreetMap, or coordinate fallback states.
> - Do not expose credentials in the client or in documentation. Use environment variables for integrations.
>
> ## Visual direction
>
> Recreate the existing visual language:
>
> - Warm off-white background (`hsl(40 33% 97%)`) with dark navy text (`hsl(216 32% 15%)`).
> - Vibrant Dutch orange primary color (`hsl(21 89% 54%)`) and deep Delft blue secondary color (`hsl(214 45% 25%)`).
> - Use **Plus Jakarta Sans** for interface text and **Playfair Display** sparingly for editorial or display moments.
> - Use generous rounded corners, typically 12–24px, thin cool-gray borders, soft shadows, subtle translucent cards, and restrained backdrop blur.
> - Use Lucide-style line icons. Do not use emoji as the primary icon system.
> - The brand logo is a large centered mark on the search screen and a compact cropped logo in authentication or compact headers. Preserve transparent logo padding by placing it in a cropped wrapper instead of distorting the image.
> - Orange map markers are circular, glossy, and high contrast: orange gradient, white border, category icon, shadow, saved badge, selected halo, and muted state for non-selected markers.
> - Use teal for selected neighborhood overlays: a translucent fill, strong outlined boundary, and a compact white pill label.
> - Motion should be subtle and purposeful: fade/slide-in for cards, smooth filter transitions, hover elevation, and accessible focus rings.
> - Support light and dark token definitions, but keep the current default light appearance.
>
> ## Technology and project shape
>
> Use a pnpm workspace with:
>
> - React + TypeScript + Vite for the web app.
> - Tailwind CSS with shadcn/Radix primitives where useful.
> - Wouter for client-side routing.
> - TanStack React Query for server data and generated API hooks.
> - Express 5 for the API server.
> - PostgreSQL with Drizzle ORM for persistent data.
> - Zod validation and an OpenAPI contract with generated React client types/hooks.
> - Clerk for authentication, with a client token bridge so authenticated API calls receive the current Clerk token.
> - `lucide-react` for icons, `date-fns` or equivalent for date presentation, and `@googlemaps/js-api-loader` for the Google map provider.
>
> The browser app must respect the artifact base path. Use `BASE_PATH`/`import.meta.env.BASE_URL` rather than hard-coding root-relative asset URLs that escape the mounted app. Bind servers to `process.env.PORT`, enable proxied hosts in Vite, and keep the API and web workflows separate.
>
> ## Search landing screen
>
> The `/` route opens on a centered search screen with:
>
> 1. A top horizontal category navigation bar using icons and tooltips:
>    - News
>    - Things to do
>    - Businesses
>    - Food & drink
>    - Social map
>    - Deals
> 2. A persistent language selector in the top-right with Dutch and English.
> 3. A persistent `UserRole` selector with `designer` and `user`, defaulting to `user`, stored in local storage under a stable app key. In `user` mode hide Capture and Sources navigation; in `designer` mode show all navigation icons.
> 4. The large marqtplaza logo, followed by copy such as “Zoek lokaal in Den Haag en ontdek verborgen plekken in jouw buurt.” / “Search locally in The Hague and discover hidden places in your neighborhood.”
> 5. A prominent rounded search field accepting:
>    - `Den Haag`
>    - `The Hague`
>    - a supported four-digit Dutch postcode prefix such as `2511`
>    - a full postcode such as `2511 AB`
> 6. An orange `Ontdek` / `Explore` action button. Validate blank input and unknown locations in the selected language.
> 7. Popular destination buttons. Selecting a city reveals neighborhood shortcuts; selecting a neighborhood immediately opens the discovery screen with that neighborhood selected. Include a “select all neighborhoods” action and a clear-selection action.
> 8. A saved-places shortcut when the user has saved items.
>
> Use Dutch as the default product content language when the user chooses Dutch, but default the initial browser language to English if no preference exists. Persist the language and set the document language attribute.
>
> ## Discovery screen
>
> `/activiteiten/den-haag` is the main discovery workspace. Preserve query parameters:
>
> - `?section=events|businesses|food-drink|social-map`
> - `?neighborhood=Centrum`
> - `?postcode=2511AB`
>
> Use a full-height split layout on desktop:
>
> - A resizable left sidebar, initially around 420px wide and bounded between roughly 320px and 640px.
> - A large map on the right.
> - On mobile, the list becomes a bottom/full-screen panel with a prominent map/list toggle.
>
> The sidebar header includes a back button, localized city name (`Den Haag` / `The Hague`), the count of filtered results, and a saved-places button with a count badge.
>
> Add collapsible filter panels:
>
> ### Quick choices
>
> - Nearby
> - Family
> - Indoor
> - Open now when Businesses or Food & drink is active
>
> Nearby must request browser geolocation only after the user explicitly activates it. Show locating, ready, and fallback states. The radius is 2.5 km. If permission is unavailable, fall back to the selected neighborhood or city center and explain that in the UI.
>
> Indoor and Open now must only match listings with explicit structured source information; do not infer them from vague descriptions.
>
> ### Top-level categories
>
> Show checkboxes and Select all / Deselect all actions for:
>
> - Events
> - Food & drink
> - Social map
> - Businesses
>
> Enabling a top-level category enables its child categories. Selecting a top-level shortcut should make it the only active top-level section. If every category is deselected, show the explicit empty state.
>
> ### Subcategories
>
> Show child filters only for active parents:
>
> - Events: Museums, Tours, Family, Entertainment, Outdoors, Markets
> - Businesses: Retail & Shopping, Health & Wellness, Beauty & Personal Care, Professional Services, Finance & Legal, Home & Repair, Automotive & Mobility, Education & Childcare, Hospitality & Travel, Arts, Culture & Entertainment, Fitness & Sports
> - Food & drink: Food & Drink
> - Social map: Geldzaken, Gezin en opvoeden, Gezondheid, Heilige plaatsen, Hobby’s en interesses, Ondersteuning, Ontmoeten en samenleven, Sporten en bewegen, Taal en computer, Vervoer, Werk en opleiding, Wonen en huishouden, Zorg voor een naaste
>
> The Businesses parent owns non-food business subcategories. Food & drink owns the Food & Drink category; do not duplicate Food & Drink under Businesses.
>
> ### Activity calendar
>
> When Events is active, include:
>
> - All dates
> - Today
> - This week
> - Free
> - Low cost
> - Meals
>
> Only show free, low-cost, meal, indoor, and open-now labels when the source explicitly states the relevant fact. Display accurate event price text, with `Free`, `Low cost`, `Paid`, or `Price unknown` fallbacks rather than inventing prices.
>
> ### Neighborhood and postcode filters
>
> Include a postcode search field and a neighborhood search field with a scrollable two-column checklist. Include:
>
> - An `All neighborhoods` checkbox
> - Select all
> - Deselect all
> - Visible selection count
> - An explicit `No neighborhoods selected` state
>
> Model neighborhood selection with three distinct states:
>
> - `all`: no neighborhood restriction and no selected-area overlays
> - `some`: selected neighborhoods restrict results and render overlays
> - `none`: zero results, zero event markers, and no neighborhood overlays
>
> For a `some` selection, ordinary listings and events are included when their coordinates are within 2.5 km of any selected neighborhood center. Social map items should match their explicit neighborhood name. The list and map must use the same filtered marker array so counts and displayed icons stay aligned.
>
> ## Map behavior
>
> Implement provider fallback in this order:
>
> 1. Google Maps when a valid browser-safe Google Maps key is configured.
> 2. OpenStreetMap raster tiles when Google Maps is unavailable.
> 3. A coordinate-based visual fallback when map tiles are unavailable.
>
> The Google Maps key must only be injected into the browser bundle when it matches the expected Google browser-key format. Never render or log secret values.
>
> All providers must render the same filtered marker set and the same selected-neighborhood overlays:
>
> - Google Maps: orange custom HTML marker overlays, Google map circles, and compact HTML neighborhood labels.
> - Tile map: draggable/zoomable OSM tiles, projected orange markers, and projected teal neighborhood circles/labels.
> - Coordinate fallback: a gradient/grid map surface with percentage-positioned markers and approximate teal neighborhood circles/labels.
>
> A selected neighborhood overlay is centered on the stored neighborhood coordinate and represents the same 2.5 km inclusion radius used by the list filter. It is an intentionally approximate area because the current data contains center coordinates rather than official polygon geometry. Every selected neighborhood must have its own visible label and outline. Overlays must disappear when the selection is cleared or set to `none`, and the map should still show selected outlines when there are no matching listings.
>
> Center/fitting behavior:
>
> - One neighborhood: pan/zoom around its center.
> - Multiple neighborhoods: fit all neighborhood centers.
> - No neighborhood restriction: fit the active city or visible marker bounds.
> - A selected marker should visually stand out and be scrolled into view in the list.
>
> Hovering/focusing a marker shows a preview with name, category, description, and practical details. Clicking a marker opens its detail route in a new tab. Include keyboard-accessible labels, focus rings, and `pointer-events` behavior that keeps map dragging usable.
>
> Add a weather strip above the map with localized current condition, temperature, apparent temperature, precipitation chance, wind, and last-updated time. Use Europe/Amsterdam time and show an explicit temporary-unavailable state if the weather provider fails.
>
> ## Listing cards and detail pages
>
> Cards should be rounded white panels with:
>
> - category icon
> - title
> - bookmark save/remove button
> - expand/collapse control
> - localized description
> - practical details
> - address or coordinate fallback
> - source/provider badge
> - trust and freshness indicators when available
> - neighborhood and taxonomy labels
>
> Event cards additionally show:
>
> - localized timing in Europe/Amsterdam
> - organizer, venue, recurrence, audience, meal type, and accurate price text when present
> - event activity badges such as Community, Culture, Learning, Movement, Meal, Family, Market, Outdoors, or Entertainment
> - a source link
> - Google Calendar and `.ics` actions
>
> Calendar behavior must handle:
>
> - date-only events as all-day events
> - naive Dutch local times with `TZID=Europe/Amsterdam`
> - explicitly zoned timestamps without double-converting them
> - escaped ICS text and a useful event UID
>
> Provide route links for car, bicycle, walking, and public transit. Do not treat generic words such as “walking”, “route”, or “directions” as a venue; render an unavailable/approximate venue message instead.
>
> Use `/activiteiten/den-haag/:eventId?section=...` for detail pages. Detail pages have a clean centered article layout, back navigation, category badge, cancellation warning when needed, description, timing/address/location cards, practical event metadata, calendar actions, route links, and source links. Missing listings receive a friendly localized not-found state.
>
> ## Saved places and event change warnings
>
> Let users save events, businesses, food listings, and social map items with bookmarks. Keep anonymous saved state locally, then synchronize it to the authenticated account after Clerk sign-in.
>
> The saved page should:
>
> - be reachable from the search and discovery headers
> - show the total saved count
> - group entries by category
> - support collapse/expand and removal
> - show a useful empty state
> - preserve source metadata and event snapshots
>
> For account-backed saves, implement operation-based synchronization with deletion tombstones so a deletion on one device is not resurrected by another device. Store event snapshots and alert fingerprints. If a saved event’s time, venue, or price changes, show a prominent alert. If it is cancelled, show a cancellation alert. Include links to the current event and its source.
>
> ## News, community, businesses, and editorial tools
>
> Include these routes and functional surfaces:
>
> - `/nieuws`: local news feed with category filters for city, politics, safety, culture, sport, business, and community.
> - `/nieuws/:id`: readable news article page with source attribution and link back to the source.
> - `/buurt`: moderated neighborhood community feed. Users can submit local posts/events, show interest, and for event posts indicate attendance. Do not add public profiles or private messaging.
> - `/capture`: designer/editor capture workspace for searching businesses by URL, name, postcode, or neighborhood; selecting businesses; scanning their web presence for event/news/deal results; and persisting scan results.
> - `/bronnen`: source directory for approved Den Haag activity sources, scan progress, blocked/error states, source health, and news-source statuses.
> - `/beoordelen`: editor-only event review queue for scanned candidates. Support inspect, approve, reject, and review notes.
> - `/beoordelen/sociale-kaart`: editor-only social map source review.
> - `/beoordelen/community`: editor-only community moderation queue.
> - `/deals`: public current deals view.
> - `/bedrijf/:slug`: public business profile.
> - `/bedrijf-claim`: authenticated business-owner claim flow. Resolve the listing server-side from the current source before accepting a claim; validate contact details and public evidence; prevent duplicate/pending claims transactionally.
> - `/mijn-bedrijf`: authenticated owner workspace for editing an approved business profile and creating/updating/withdrawing deals.
> - `/redactie/bedrijven`: editor-only moderation for business claims and deals.
> - `/sign-in` and `/sign-up`: Clerk path-based authentication screens styled with the same orange/navy design system.
>
> Restricted routes must distinguish loading, unauthenticated, authenticated-but-not-editor, and authorized states. Use server-side Clerk identity and editor checks; never trust the visual `UserRole` selector as a security boundary.
>
> ## Data and API contract
>
> Create an Express `/api` router with at least:
>
> - `GET /healthz`
> - `GET /listings?cityId=&section=&language=&neighborhoods=`
> - `GET /weather?cityId=`
> - `GET /news`, `GET /news/:id`, `GET /news/sources/status`, `POST /news/scan`
> - `GET /community-posts`, `POST /community-posts`, `PUT /community-posts/:id/participation`, plus editor moderation endpoints
> - `POST /capture/search`, `POST /capture/scan`, `POST /capture/persist`
> - `GET /sources/review`, `POST /sources/scan`, and source review endpoints
> - `GET/POST` social-map review endpoints
> - `GET /saved-events`, `POST /saved-events/sync`
> - business profile, claim, deal, and moderation endpoints
>
> Listings use a shared shape with id, city, category, name, description, address, latitude/longitude, source URL, source/provider name, neighborhood, event timing, venue, price metadata, trust/freshness metadata, review status, and approximate-location flags.
>
> For Den Haag:
>
> - Use curated seed listings for deterministic initial content.
> - Use Google Places Text Search for businesses and food/drink only after a postcode, neighborhood, or other search area is supplied.
> - Target selected neighborhood names in Google Places search text.
> - Use bounded overlapping city search areas, bounded pagination, deduplication, concurrency limits, timeouts, and a short cache.
> - Supplement with OpenStreetMap/Overpass where appropriate.
> - Keep different neighborhood selections in different cache keys.
> - Preserve explicit blocked/partial/error source results.
> - Scan only approved source IDs and preserve source evidence for events and news.
> - Localize event titles/details on the server or from verified bilingual fields; format event dates in Europe/Amsterdam.
> - Use Open-Meteo for weather, with a short server cache and strict finite-number validation.
>
> Use PostgreSQL/Drizzle tables for capture results, source/news statuses, community posts and participation, business profiles/members/claims/deals, and saved-event snapshots/alerts/tombstones. Validate request and response payloads with Zod and keep the OpenAPI specification, generated client, and generated schemas synchronized.
>
> ## Quality and acceptance checks
>
> The finished recreation is only complete when:
>
> 1. `pnpm typecheck` passes and the web/API workflows start on `PORT`.
> 2. `/` accepts `Den Haag`, `The Hague`, `2511`, and `2511 AB`, while invalid input shows a localized error.
> 3. `/activiteiten/den-haag?section=events&neighborhood=Centrum` shows an event count, event cards, event markers, a visible `Centrum` label, and a teal outlined 2.5 km area.
> 4. Selecting two neighborhoods produces two labels and two outlines; the list and map use the same active neighborhood filter.
> 5. Deselecting all neighborhoods shows the explicit no-neighborhood state, removes event results and map markers, and removes all neighborhood overlays.
> 6. Selecting all neighborhoods removes the neighborhood restriction and does not leave stale overlays behind.
> 7. Switching between map/list works on desktop and mobile; selecting a card highlights the corresponding marker and vice versa.
> 8. Google Maps failure falls back cleanly to tiles and then to coordinates without a blank or misleading map.
> 9. Language switching updates navigation, filters, cards, empty states, weather labels, event details, and calendar copy; the choice persists across reloads.
> 10. UserRole persistence changes only navigation visibility, while protected editor/owner routes remain server-authorized.
> 11. Saving/removing an item works anonymously and synchronizes after sign-in; event change/cancellation warnings render from stored snapshots.
> 12. Event calendar links and ICS downloads handle date-only and Europe/Amsterdam-local events correctly.
> 13. News/source/community/business moderation flows show loading, empty, blocked, error, unauthorized, and successful states rather than silently failing.
> 14. The UI is keyboard navigable, has accessible labels for icon buttons and map markers, and remains usable at mobile widths.
>
> Favor real behavior, explicit states, and source-aware data over placeholder screens. Keep the app visually coherent with the warm off-white, orange, Delft-blue, teal, rounded-card design described above.
