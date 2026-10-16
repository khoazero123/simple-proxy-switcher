# Proxy By Domain (simple-proxy-switcher)

A tiny Manifest V3 extension that switches the browser proxy globally or per domain, straight from the popup:
an importable proxy list, per-domain routing rules (via PAC), and optional reload/cookie/cache side effects when the
proxy changes.

This fork adds **SOCKS4/SOCKS5 support** on top of the original HTTP(S)-only version (v0.1.0).

## Proxy types

| Import prefix | `chrome.proxy` scheme | PAC keyword |
| --- | --- | --- |
| *(none)* | `http` (default) | `PROXY` |
| `http://` | `http` | `PROXY` |
| `https://` | `https` (TLS to the proxy) | `HTTPS` |
| `socks4://` (alias `socks4a://`) | `socks4` | `SOCKS4` |
| `socks5://` (aliases `socks://`, `socks5h://`) | `socks5` | `SOCKS5` |

Prefixes are case-insensitive. The type is stored per entry, shown in the **TYPE** column, and preserved in domain
rules, so a single list can mix HTTP and SOCKS proxies.

## Import formats

```
ip:port
ip:port:login:password
login:password@ip:port
socks5://ip:port
socks5://ip:port:login:password
socks5://login:password@ip:port
socks4://ip:port
# comment line
login:password@ip:port # inline comment
```

The **Default type** dropdown in the Import tab decides the type of lines without a prefix
(`http`, `socks5` or `socks4`). Lines with an invalid or out-of-range port are skipped.

## SOCKS limitations (Chrome, not the extension)

- **No username/password for SOCKS.** Chrome's proxy stack (`chrome.proxy`, `chrome.webRequest.onAuthRequired`)
  cannot authenticate to SOCKS4/SOCKS5 proxies; per the official docs *"Chrome does not support SOCKS5
  authentication"*. Credentials on a SOCKS entry are therefore ignored — the popup highlights those rows in the
  TYPE column and shows a warning banner. For an authenticated SOCKS5 proxy, run a local relay/port-forward
  (e.g. `gost`, `3proxy`, `ssh -D` with an auth-adding wrapper) that exposes an unauthenticated listener on
  `127.0.0.1` and import `socks5://127.0.0.1:port`.
- **TCP only.** SOCKS carries TCP; UDP (WebRTC data, QUIC) is never proxied, and Chrome disables QUIC whenever a
  proxy is configured.
- **`socks5` resolves DNS remotely** (through the proxy); `socks4` resolves locally. Use `socks5` when the target
  name should not leak to your resolver.
- Chrome forces `DIRECT` for hosts in the exclude list — a SOCKS rule cannot override that.

## Verification

Behaviour is verified against a real Chromium build (Playwright, extension loaded from source) plus a stub SOCKS5
server: `fixed_servers` receives `{scheme: "socks5"}`, `https://example.com` is fetched through the SOCKS5
tunnel (`CONNECT example.com:443` observed server-side), domain rules emit `SOCKS5 host:port` PAC directives, and
the plain-HTTP path stays unchanged.

## Releases

Push a tag matching the manifest version (`v0.1.0` / `0.1.0`) or run the **Release Extension** workflow manually;
it packages the Web Store ZIP (and an optional CRX when `CRX_PRIVATE_KEY_BASE64` is set) and attaches it to a
GitHub release.
