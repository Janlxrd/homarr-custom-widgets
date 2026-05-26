# homarr-iframes

Custom iframe widgets for Homarr, built as a small internal Docker service.

## Widgets

- `GET /widgets/daylight/` - local-time sunrise, sunset, and day-progress widget.
- `GET /widgets/dashdot/` - custom Dashdot server summary widget.
- `GET /ping/` - no-JavaScript iframe render test.
- `GET /debug/` - iframe and API diagnostics.
- `GET /showcase/` - local iframe preview page for testing widget sizes.

## Docker

`docker-compose.yml` keeps the widget service internal to Docker and exposes
it only to containers on the `services` network:

```yaml
services:
  homarr-iframes:
    build: .
    expose:
      - "8080"
    networks:
      - services
```

Start it with:

```bash
docker compose up -d --build
```

Dashdot is expected on the same Docker network at:

```text
http://dashdot:3001
```

## Homarr iFrame URLs

Route the widget service through the existing Cloudflare Tunnel for
`home.janiqwa.dev`:

```text
Hostname: home.janiqwa.dev
Path: /iframes/.*
Service: http://homarr-iframes:8080
```

Then use these URLs in Homarr:

```text
https://home.janiqwa.dev/iframes/ping/
https://home.janiqwa.dev/iframes/debug/
https://home.janiqwa.dev/iframes/widgets/daylight/
https://home.janiqwa.dev/iframes/widgets/dashdot/
```

The app is configured with `BASE_PATH=/iframes`, so API calls and static files
work under that tunnel path.

If Homarr shows a blank iframe, test in this order:

```text
https://home.janiqwa.dev/iframes/ping/
https://home.janiqwa.dev/iframes/debug/
https://home.janiqwa.dev/iframes/widgets/dashdot/?demo=1
https://home.janiqwa.dev/iframes/widgets/dashdot/?debug=1
```

`/ping/` uses no JavaScript. If that is blank inside Homarr, the iframe page
is not being rendered by Homarr/the browser. If `/ping/` shows but `/debug/`
does not, check the browser console for script or content-security errors.

## Local Development

```bash
npm install
npm start
```

Then open:

```text
http://localhost:8080/showcase/
```

Run tests:

```bash
npm test
```
