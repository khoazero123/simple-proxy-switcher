# Privacy Policy

**Proxy By Domain**  
Last updated: July 22, 2026

This Privacy Policy explains how the **Proxy By Domain** browser extension ("Extension", "we", "our") handles information when you install and use it.

---

## Summary

- The Extension does **not** sell, rent, or share your personal data with us.
- The Extension does **not** collect browsing history, page content, or analytics.
- All configuration data is stored **locally on your device** using Chrome's local storage.
- The Extension does **not** connect to our servers.
- When you enable a proxy, your web traffic is routed through the **proxy servers you configure**. Those third-party services have their own privacy practices.

---

## Information the Extension Stores Locally

The Extension saves the following data on your device using `chrome.storage.local`. This data never leaves your browser unless you manually export it or it is sent through a proxy you configured:

| Data | Purpose |
|------|---------|
| Proxy list | IP address, port, username, password, and optional notes for proxies you import |
| Active proxy | The currently selected global proxy settings |
| Domain rules | Domain patterns and associated proxy assignments |
| Exclude URLs | URL patterns that should bypass the proxy |
| Settings | User preferences such as reload tabs, clear cookies, or clear cache on proxy change |

You can remove this data at any time by uninstalling the Extension or clearing the Extension's storage in Chrome.

---

## How the Extension Uses Permissions

The Extension requests only the permissions needed to provide proxy management features:

| Permission | Why it is used |
|------------|----------------|
| `proxy` | Apply, update, and clear browser proxy settings |
| `storage` | Save your proxy list, rules, and settings locally |
| `tabs` | Read the active tab hostname when adding a domain rule; reload tabs when you enable that option |
| `webRequest` / `webRequestAuthProvider` | Provide proxy authentication credentials you configured |
| `browsingData` | Clear cookies and/or cache only when you explicitly enable those options |
| `<all_urls>` (host permission) | Allow proxy routing and proxy authentication to work on sites you visit while a proxy is active |

The Extension:

- Does **not** inject scripts into web pages
- Does **not** read or modify page content
- Does **not** record browsing history
- Does **not** use remote code — all JavaScript is bundled inside the Extension package

---

## Data We Do Not Collect

We do **not** collect, transmit, or store on our servers:

- Browsing history or visited URLs (except reading the active tab hostname locally in the popup to help you add a domain rule)
- Page content, form data, or passwords from websites
- Personal identifiers
- Analytics or usage telemetry
- Crash reports sent to us

The Extension contains no analytics SDKs, advertising libraries, or third-party tracking.

---

## Third-Party Proxy Servers

When you configure and enable a proxy, your network traffic for matching requests is sent through that proxy server. The operator of that proxy may be able to see your traffic depending on how the proxy is set up.

**You are responsible for choosing proxy providers you trust.** We do not operate proxy servers and are not responsible for how third-party proxy providers handle your data.

---

## Optional User Actions

If you enable optional settings, the Extension may:

- **Reload tabs** in your browser after a proxy change
- **Clear cookies** and/or **cache** for your browser profile after a proxy change

These actions only run when you turn them on in Settings. They are performed locally by Chrome and are not reported to us.

---

## Children's Privacy

The Extension is not directed at children under the age of 13, and we do not knowingly collect personal information from children.

---

## Data Security

Because all Extension data is stored locally in your browser profile, its security depends on the security of your device and Chrome profile. Protect your device and be careful when importing proxy credentials, as they are stored locally in plain text within Chrome's extension storage.

---

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted in the [GitHub repository](https://github.com/maksam07/simple-proxy-switcher). The "Last updated" date at the top of this document will be revised when changes are made.

Continued use of the Extension after an update means you accept the revised policy.

---

## Open Source

The Extension is open source. You can review its source code to verify how it handles data:

**https://github.com/maksam07/simple-proxy-switcher**

---

## Contact

If you have questions about this Privacy Policy, please open an issue on GitHub or contact the developer:

- **GitHub Issues:** [github.com/maksam07/simple-proxy-switcher/issues](https://github.com/maksam07/simple-proxy-switcher/issues)
- **Website:** [maksam07.com](https://maksam07.com/)
