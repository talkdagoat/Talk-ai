# GhostBrowse

A static, no-account embedded website viewer.

## Run locally
Open `index.html` in a modern browser, or serve this folder with a static file server.

## Publish with GitHub Pages
In the repository, open **Settings → Pages**. Select **Deploy from a branch**, choose **main** and **/(root)**, then Save. The site will be published at the repository's GitHub Pages URL after GitHub finishes building it.

## Architecture
The root `index.html` is intentionally tiny. It loads the actual interface from `ghostbrowse/style.css` and `ghostbrowse/main.js`. You can edit those application files separately (including on an iPad) and publish changes to the repository.

## Privacy and limitations
- This is an iframe-based viewer, not a VPN, proxy, or anonymous browser.
- Websites that use CSP `frame-ancestors` or `X-Frame-Options` can refuse to load in an iframe. There is no safe client-side method to force every website to embed.
- When navigation stays inside the iframe, the top-level browser address generally remains the GhostBrowse URL. This does not guarantee concealment from all browser history/session features.
- The visited website and network operator may still see the user's IP address, DNS requests, and activity. Search terms are sent to DuckDuckGo.
- Clear only closes the current embedded view; it cannot delete browser, router, ISP, DNS, website, or account records.
- The application code must be hosted somewhere reachable by visitors. Files that remain only on one iPad cannot be loaded by other people's browsers.
