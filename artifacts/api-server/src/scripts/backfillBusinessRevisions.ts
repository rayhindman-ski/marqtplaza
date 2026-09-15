import { backfillApprovedRevisions } from "../lib/businessRevisionBackfill";

backfillApprovedRevisions()
  .then((summary) => {
    console.log(JSON.stringify(summary));
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
