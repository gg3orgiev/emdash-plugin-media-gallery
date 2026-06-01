# Security

## Reporting a vulnerability

Please report security issues privately. Open a report through GitHub's
"Report a vulnerability" workflow on the repository's Security tab
(GitHub Security Advisories). Do not file a public issue for an exploitable flaw.

You will normally receive an acknowledgement within a few days. Please include a description,
affected versions, and a minimal reproduction if possible.

## Supported versions

Fixes are published for the latest `0.x` release line.

## Security model

The editor widget runs in the browser and is not trusted as a security control. The
authoritative checks run in the server `content:beforeSave` hook, which aborts a save when:

- the value is not a well-formed gallery array, or exceeds the hard cap of 200 items;
- a `mediaId` is duplicated, or more than one item is marked primary;
- a `mediaId` does not resolve to a non-trashed row in the `media` table;
- an item's `storageKey` does not match its resolved media row, or is not a safe relative key.

A storage key is considered safe only when it is a relative key with no leading slash, no `..`
path segment, no colon (which blocks `http:`, `javascript:`, and protocol-relative values), and
no control characters. The same check is applied when building URLs on the storefront, and keys
are encoded per path segment.

The plugin declares only the `read:media` capability and makes no network requests of its own.

## Host responsibilities

- The EmDash admin (where the widget runs) must be authenticated and access-controlled.
- If you set the `searchEndpoint` option, that endpoint runs in your application and returns
  media metadata. Use a same-origin path and apply the same access control as the admin.
