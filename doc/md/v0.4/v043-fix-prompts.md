# v0.43.1 Fix Prompt Record

## Record metadata

- Session date: 2026-09-21
- Recorded at: 2026-09-21T21:53:00+02:00
- Time zone: Europe/Amsterdam
- Prompt order: chronological
- Per-message timestamps: not exposed in the available chat transcript; no times have been invented
- Implementation commit after the recorded code changes: `85981521723b2663c2c13e90a02dc6a67d6526eb`
- Implementation commit timestamp: `2026-09-21T19:49:58Z` (`2026-09-21T21:49:58+02:00`)

## Prompts since work resumed

### Prompt 1

**Timestamp:** 2026-09-21; exact message time unavailable

> ok so for now lets re-tackle the multi-neighborhood select - icons disapearing problem described above ....
> can you remember that or do i need to repaste the evidence?

**Resulting implementation commit:** `85981521723b2663c2c13e90a02dc6a67d6526eb`

### Prompt 2

**Timestamp:** 2026-09-21; exact message time unavailable

> DO NOT CHANGE ANY MOTHERFUCKING THING ELSE

**Resulting implementation commit:** `85981521723b2663c2c13e90a02dc6a67d6526eb`

### Prompt 3

**Timestamp:** 2026-09-21; exact message time unavailable

> well is the multi-neighborhood-icon-vanishing bug fixed ?

**Resulting implementation commit:** No code change from this prompt; verification continued.

### Prompt 4

**Timestamp:** 2026-09-21; exact message time unavailable

> are you still working on it ?

**Resulting implementation commit:** No code change from this prompt; verification continued.

### Prompt 5

**Timestamp:** 2026-09-21; exact message time unavailable

> work in the foreground only I need to supervise your actions closely

**Resulting implementation commit:** No project code change from this prompt.

### Prompt 6

**Timestamp:** 2026-09-21; exact message time unavailable

> ok that shows the problem , correct ? adding a neighborhood does NOT increase the visible results.
> even when an independent selection of that 2nd nieighborhood DOES SHOW results.
> so they are ommitted

**Resulting implementation commit:** `85981521723b2663c2c13e90a02dc6a67d6526eb`

### Prompt 7

**Timestamp:** 2026-09-21; exact message time unavailable

> WHY is there a CAP at 200 for results ?

**Resulting implementation commit:** `85981521723b2663c2c13e90a02dc6a67d6526eb`

### Prompt 8

**Timestamp:** 2026-09-21; exact message time unavailable

> get the fuck out
> less than 1 hour ago i instructed you to REMOVE the google places API
>
> was that reverted somehow?

**Resulting implementation commit:** No code change from this prompt; repository history was inspected.

### Prompt 9

**Timestamp:** 2026-09-21; exact message time unavailable

> remove it and STOP WASTING TIME

**Resulting implementation commit:** `85981521723b2663c2c13e90a02dc6a67d6526eb`

### Prompt 10

**Timestamp:** 2026-09-21; exact message time unavailable

> record the prompt instructions sime we restarted into a file doc/md/v043-fix-prompts.md
> include timestamp, prompt text and commit hash after changes were made in the file

**Correction:**

> sime=> Since

**Resulting implementation commit:** This prompt created this record. Its documentation commit is reported after the commit is created because a commit cannot contain its own final hash.

### Prompt 11

**Timestamp:** 2026-09-21; exact message time unavailable
**Recorded at:** 2026-09-21T21:57:35+02:00

> continute to record to the v043-fix-prompts.md file
> - do you remember the instruction to simplify the header row icons ( remove the text label , make is a mouseover overlay )
> if not now you have the instruction again.
> make it so.

**Attached reference:** `attached_assets/image_1790020516559.png`

**Resulting implementation commit:** `154cd9f2f2cb2dd64546a4a5d47749c4f4a5543e`

### Prompt 12

**Timestamp:** 2026-09-21; exact message time unavailable
**Recorded at:** 2026-09-21T21:57:35+02:00

> WTF - did i say that !!!
>
> I’ll keep labels visible inside the mobile menu

**Resulting correction:** Removed the unrequested mobile exception. Header navigation labels are removed on all viewport sizes; labels remain only as accessible names and hover/focus overlays.

**Resulting implementation commit:** `154cd9f2f2cb2dd64546a4a5d47749c4f4a5543e`

### Prompt 13

**Timestamp:** 2026-09-21; exact message time unavailable
**Recorded at:** 2026-09-21T22:00:01+02:00

> ok move the file doc/md/v043-fix-prompts.md to doc/md/v0.4/v043-fix-prompts.md
>
> continue to record prompts to that file

**Resulting change:** Moved the prompt record to `doc/md/v0.4/v043-fix-prompts.md`. Future prompts are recorded at this path.

**Resulting documentation commit:** Reported after the commit is created because a commit cannot contain its own final hash.

### Prompt 14

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:36:20+02:00

> create a directory doc/md/v0.4/business-requirements

**Resulting change:** Created the tracked directory `doc/md/v0.4/business-requirements`.

**Resulting implementation commit:** `21fc1a84b60c3432d6db2ef31696516909302f20`

### Prompt 15

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:37:26+02:00

> move the files doc/md/v0.4/BR-??.md into the new directory doc/md/v0.4/business-requirements

**Resulting change:** Moved `BR-01.md` through `BR-12.md` into `doc/md/v0.4/business-requirements` without changing their contents.

**Resulting implementation commit:** `abb8ce85362e603ae5923829988e34484d3b9c6e`

### Prompt 16

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:38:33+02:00

> also move the file doc/md/v0.4/requirements.md to the dir doc/md/v0.4/business-requirements/

**Resulting change:** Moved `requirements.md` into `doc/md/v0.4/business-requirements` without changing its contents.

**Resulting implementation commit:** `f8857f659e248f6885b20d8912944027edff2dd2`

### Prompt 17

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:41:10+02:00

> should a school be classified as a business ? or a social listing? show your reasoning

**Resulting decision:** A school defaults to `Businesses → Education & Childcare`. It belongs on the Social map only when the listing represents a distinct community-support service rather than the school itself. If the word “Businesses” is too narrow for public schools, rename the parent directory to “Businesses & organizations” or “Local organizations” instead of misclassifying schools as social listings.

**Resulting implementation commit:** No product code change was made from this prompt.

### Prompt 18

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:49:37+02:00

> as a human, i find this behavior VERY annoying.
> I navigate from the main page to select a neighborhood
> I drill down into that neighborhood and then zoom the map to a specific resolution so i can see the individual icons instead of a cluster icons. then I select on one of the icons to drill down to its detail. once I've finished with the item detail page, i click on the '<- back' navigation link.
> at this point the map FORGOT my last coordinates, zoom level, etc.
>
> WHY

**Resulting diagnosis:** The discovery map unmounts when navigating to the separate detail route. The return-state snapshot restores neighborhoods and filters but does not store the map center or zoom. On return, a new map mounts and its automatic fit logic calculates a fresh viewport, replacing the manually chosen camera.

**Required correction:** Capture the map camera before detail navigation, restore it when returning to discovery, and suppress automatic fitting when a saved camera is being restored.

**Resulting implementation commit:** No product code change was made from this diagnostic prompt.

### Prompt 19

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:55:24+02:00

> the 'FIX IT' was implied

**Resulting correction:** Treated the reported broken behavior as an implementation request. Discovery now captures the exact map center and zoom before detail navigation, restores that camera on `restore=1`, and prevents automatic fitting from overwriting the restored viewport. The behavior is implemented for both the Google and OpenStreetMap tile renderers.

**Verification:** The frontend typecheck passed, all 10 pre-existing discovery-map regression tests passed, and the new focused regression confirmed exact latitude, longitude, and zoom restoration after the detail-return flow.

**Resulting implementation commit:** `f0116db980da41e953bc3851655413d48e521bbd`

### Prompt 20

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:59:30+02:00

> another annoyance.
> when i filter on a business, then on the left 'list' of businesses, i click on 'claim my business'
> I am shown the business card (edit option, i think)
> but you switched the language of the dialog to Dutch
> - WHERE it the language selector on this layout?
> - WHY would YOU decide to switch languages on a user? \

**Resulting diagnosis:** The language change was not intentional. Discovery could render English from `?locale=en` without persisting that URL-selected language. The claim link then discarded `locale`, and the standalone claim editor fell back to the older stored language, which could be Dutch. The claim editor also had no visible language selector.

**Resulting implementation commit:** `5fecab5d63886b0a32ee7e8a313d3833e2be9403`

### Prompt 21

**Timestamp:** 2026-09-22; exact message time unavailable
**Recorded at:** 2026-09-22T06:59:30+02:00

> FIX IT

**Resulting change:** Claim links now preserve the active locale, standalone claim pages honor URL locale before stored language, and the claim editor and receipt expose a visible English/Nederlands selector that updates the URL and survives refresh.

**Verification:** The frontend typecheck passed. All five business-intake tests passed, including a new regression that starts with Dutch stored locally, enters through `locale=en`, verifies English remains active, switches to Dutch, and confirms Dutch remains active after reload.

**Resulting implementation commit:** `5fecab5d63886b0a32ee7e8a313d3833e2be9403`