---
name: Brand logo asset
description: The primary marqtplaza logo image includes transparent vertical padding that affects compact header sizing.
---

Use the shared cropped logo wrapper for compact headers and footers instead of sizing the raw PNG directly.

**Why:** The artwork occupies only part of the source PNG canvas, so a raw `height` or `width` makes the visible logo unexpectedly small or misaligned.

**How to apply:** Reuse the wrapper for branded routes and preserve the existing primary logo asset; avoid introducing alternate text-only marks unless a page explicitly needs one.