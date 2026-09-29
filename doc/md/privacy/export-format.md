# Account export format — v1 (v0.5.3)

An export consists of `bundle.json` and one UTF-8 CSV file per array in the
bundle, packaged in `account-export.zip` (fflate, already present in the workspace
dependency graph). The individual JSON and CSV files can also be downloaded.
Files are stored privately in
App Storage under `account-exports/<appUserId>/<requestId>/` (beneath the
configured private-object prefix). There is no public/signed direct object
URL. Download through the authenticated account route only. Each file expires
72 hours after availability, including files already downloaded.

`bundle.json` has stable top-level key order: `schemaVersion` (`"1"`),
`generatedAt` (ISO 8601), `profile`, `preferences`, `consents`,
`registrations`, `lastSearch`, `memberships`, `requests`, `events`, `messages`.
The arrays are ordered by their database identifiers (or are unique per user).
Dates serialize as ISO strings. Empty tables are `[]`. `profile` contains
app-user id, contact e-mail, locale, status and created timestamp.
`preferences`, `consents`, and `lastSearch` are account-owned records;
`registrations` contains only the research registration for the same Clerk
subject. `memberships` contains only business id, role and membership start,
not the business directory or its other members. `requests` and `events`
contain the requester's own status history, without support notes or actor
identifiers. `messages` contains only lifecycle outbox template, timestamp
and delivery status (never recipient/provider payload, rendered body or link).

CSV field order matches the corresponding JSON object's field order. Fields
are quoted and quotes are doubled; nested arrays/objects are JSON encoded
within the CSV cell. The files are individually downloadable rather than
available individually as well as in the ZIP. A change in this format requires
a new `schemaVersion` and a documented migration.