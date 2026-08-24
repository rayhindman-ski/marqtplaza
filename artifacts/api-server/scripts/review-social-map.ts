import { runSocialMapReview } from "../src/lib/social-map-review.js";
import { pool } from "@workspace/db";

try {
  const report = await runSocialMapReview();
  for (const item of report.items) {
    const status = item.status === "verified" ? "OK" : "REVIEW";
    console.log(`${status} ${item.name}: ${item.sourceStatus}${item.reason ? ` — ${item.reason}` : ""}`);
  }
  console.log(`\n${report.message}`);
  if (!report.successful) process.exitCode = 1;
} finally {
  await pool.end();
}