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