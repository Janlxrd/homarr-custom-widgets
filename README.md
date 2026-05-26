# homarr-iframes

Custom iframe widgets for Homarr, built as a small internal Docker service.

## Widgets

- `GET /widgets/daylight/` - local-time sunrise, sunset, and day-progress widget.
- `GET /widgets/dashdot/` - custom Dashdot server summary widget.
- `GET /ping/` - no-JavaScript iframe render test.
- `GET /debug/` - iframe and API diagnostics.
- `GET /showcase/` - local iframe preview page for testing widget sizes.

## Docker

`docker-compose.yml` keeps the service internal to the Docker network and does
not publish ports externally:

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

Use these direct internal URLs in Homarr:

```text
http://homarr-iframes:8080/ping/
http://homarr-iframes:8080/debug/
http://homarr-iframes:8080/widgets/daylight/
http://homarr-iframes:8080/widgets/dashdot/
```

This project is configured for direct internal service URLs. It does not use a
base path or path rewrite.

If Homarr shows a blank iframe, test in this order:

```text
http://homarr-iframes:8080/ping/
http://homarr-iframes:8080/debug/
http://homarr-iframes:8080/widgets/dashdot/?demo=1
http://homarr-iframes:8080/widgets/dashdot/?debug=1
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
