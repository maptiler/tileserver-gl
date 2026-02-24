# Security

## Host header poisoning (HNP) and URL poisoning

When tileserver-gl is run **without** the `--public_url` option, it builds URLs for WMTS, TileJSON, style JSON, and related responses from the incoming request’s **Host** header and **X-Forwarded-Proto** / **X-Forwarded-Host** headers. These values are not validated by default. If an attacker can influence these headers (e.g. via a malicious link or proxy), the server may return responses that contain URLs pointing to an attacker-controlled host. Clients (browsers, map apps) that follow those URLs can then be directed to the attacker’s server, enabling phishing, session/token theft, or malicious content.

### Mitigations (choose one or both)

1. **Use a fixed public URL (recommended for production)**  
   Start the server with a canonical base URL so it never uses the request to build response URLs:
   ```bash
   tileserver-gl --public_url https://your-domain.com/ -c config.json
   ```
   All response URLs will use this base; Host and X-Forwarded-* are ignored for URL building.

2. **Restrict allowed hosts when not using `--public_url`**  
   If you do not set `--public_url`, you can limit which hosts may appear in response URLs by setting the **`TILESERVER_GL_ALLOWED_HOSTS`** environment variable:
   - **Default:** `*` (allow any host; same as original behavior, no HNP mitigation).
   - **To enable mitigation:** Set to a comma-separated list of allowed hostnames, e.g.:
     ```bash
     export TILESERVER_GL_ALLOWED_HOSTS="localhost,map.example.com"
     ```
   - If the request’s host (or `X-Forwarded-Host`) is **not** in this list, the server returns **path-only** URLs (e.g. `/styles/xyz/wmts.xml`) instead of absolute URLs. Clients then resolve these against their own origin, so the response cannot be poisoned with an attacker’s host.
   - Protocol (scheme) is restricted to `http` or `https` only when building URLs from request headers.

### Summary

| Configuration | Effect |
|---------------|--------|
| `--public_url` set | Response URLs use the configured base; HNP risk removed. |
| `TILESERVER_GL_ALLOWED_HOSTS` unset or `*` | No host restriction; original behavior (HNP possible if Host/X-Forwarded-* are untrusted). |
| `TILESERVER_GL_ALLOWED_HOSTS=host1,host2` | Only these hosts may appear in absolute URLs; otherwise path-only URLs are returned (HNP mitigated). |

For public-facing or untrusted deployments, either set `--public_url` or set `TILESERVER_GL_ALLOWED_HOSTS` to your known host(s). Relying on the default `*` without `--public_url` is not recommended when the server is reachable by untrusted clients.
