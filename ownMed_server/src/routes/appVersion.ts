import { Router } from "express";

import { env } from "../config/env.js";

export const appVersionRouter = Router();

/**
 * GET /app/version
 *
 * The newest released app version, so an installed build can tell whether it is
 * behind. Unauthenticated on purpose: a device that has not signed in still runs
 * the app and still deserves to be told there is a newer one, and the answer is
 * a public release number rather than anything about an account.
 *
 * No database table — this is two operator-set strings, and a version that had
 * to be written through an API or a migration would be one more moving part
 * between "we shipped a build" and "the old ones know". Setting
 * `LATEST_APP_VERSION` and redeploying is the whole release mechanism.
 *
 * An empty `latestVersion` is a valid answer meaning "nothing announced", not an
 * error: it is what a fresh clone and a pre-release deployment both report, and
 * the client's job there is simply to show no notice.
 */
appVersionRouter.get("/version", (_req, res) => {
  res.json({
    latestVersion: env.latestAppVersion,
    storeUrl: env.storeUrl,
  });
});
