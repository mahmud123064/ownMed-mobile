import Constants from "expo-constants";

import type { AppNotice } from "./storage";

/**
 * The notice side of the bell: what the app knows about being out of date, and
 * which notices are still unread.
 *
 * Everything here is pure — no storage, no network — so the version comparison
 * and the reconciliation rule can be reasoned about on their own, the same way
 * `medicineSchedule.ts` is kept free of I/O. `DashboardHeader` owns the two
 * effects that read and write it.
 */

/** The id of the update notice. Fixed, so reconciling updates rather than stacks. */
export const UPDATE_NOTICE_ID = "app-update";

/**
 * The version this build reports as installed.
 *
 * From `expo-constants` rather than a native module: `expo-application` is not a
 * dependency here, and `app.json`'s `expo.version` is the number the stores are
 * told about anyway, so it is the one worth comparing against.
 *
 * The `"0.0.0"` fallback is deliberately *lower than any real release* rather
 * than a safe-looking guess: a dev client with no configured version would
 * otherwise be told it is up to date against every announcement, which is the
 * one case where the check most needs to be visible.
 */
export function installedVersion(): string {
    return Constants.expoConfig?.version ?? "0.0.0";
}

/**
 * Compare two dotted version strings. Negative when `a` is older than `b`.
 *
 * Numeric per segment, so `1.10.0` is newer than `1.9.0` — the whole reason
 * this is not a string comparison, which would get that pair backwards. Missing
 * segments count as zero (`1.2` equals `1.2.0`), and a non-numeric segment
 * counts as zero rather than throwing: a malformed version off the wire should
 * make the check say "no update", not take down the header that renders it.
 *
 * Prerelease suffixes are not modelled — this app has never shipped one, and
 * pretending to understand `1.0.0-beta.2` would be a rule nobody has tested.
 */
export function compareVersions(a: string, b: string): number {
    const segments = (value: string) =>
        value
            .trim()
            .split(".")
            .map((part) => {
                const n = Number.parseInt(part, 10);
                return Number.isFinite(n) ? n : 0;
            });

    const left = segments(a);
    const right = segments(b);
    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i += 1) {
        const diff = (left[i] ?? 0) - (right[i] ?? 0);
        if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    return 0;
}

/**
 * The update notice for a server-reported version, or null when there is none.
 *
 * Two ways to get null, and they mean the same thing to the caller — "show
 * nothing": no release announced (`latestVersion` empty, the server's answer on
 * a fresh deployment), or a release this build already has. Equal versions
 * count as up to date, so re-announcing the installed one is a no-op rather
 * than a prompt to update to where you already are.
 */
export function updateNotice(
    latestVersion: string,
    storeUrl: string,
): AppNotice | null {
    if (latestVersion.trim() === "") return null;
    if (compareVersions(installedVersion(), latestVersion) >= 0) return null;

    return {
        id: UPDATE_NOTICE_ID,
        kind: "update",
        version: latestVersion,
        title: "Update available",
        body: `OwnMed ${latestVersion} is ready to install.`,
        storeUrl,
        read: false,
    };
}

/**
 * Fold the server's current release into the notices already on the device.
 *
 * Any previous update notice is replaced rather than appended to, so the list
 * never shows two "Update available" rows for the same app.
 *
 * The one subtle rule is what happens to `read`. It is **carried over only when
 * the version is unchanged** — because the badge is meant to say "there is
 * something here you have not seen", and a user who has already read the notice
 * for 1.0.1 has seen it. A *new* version is a different thing to have not seen,
 * so it comes back unread and the badge returns. Keying the read state on
 * anything looser (the id alone, say) would let the 1.0.1 notice silently
 * swallow the 1.0.2 one and the user would never be told.
 *
 * Non-update notices are passed through untouched — this owns the update row
 * and nothing else.
 */
export function reconcileUpdateNotice(
    existing: AppNotice[],
    latestVersion: string,
    storeUrl: string,
): AppNotice[] {
    const others = existing.filter((notice) => notice.kind !== "update");
    const previous = existing.find((notice) => notice.kind === "update");
    const fresh = updateNotice(latestVersion, storeUrl);

    if (fresh === null) return others;
    if (previous !== undefined && previous.version === fresh.version) {
        return [...others, { ...fresh, read: previous.read }];
    }
    return [...others, fresh];
}

/** How many notices are still unread — what the bell badge shows. */
export function unreadCount(notices: AppNotice[]): number {
    return notices.filter((notice) => !notice.read).length;
}
