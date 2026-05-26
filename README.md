# homarr-iframes

Custom iframe widgets for Homarr, built as a small internal Docker service.

## Widgets

- `GET /widgets/daylight/` - local-time sunrise, sunset, and day-progress widget.
- `GET /widgets/dashdot/` - custom Dashdot server summary widget.
- `GET /ping/` - no-JavaScript iframe render test.
- `GET /debug/` - iframe and API diagnostics.
- `GET /showcase/` - local iframe preview page for testing widget sizes.

## Docker

`docker-compose.yml` publishes the widget service only on the private host IP
you set in `.env`:

```yaml
services:
  homarr-iframes:
    build: .
    ports:
      - "${WIDGET_BIND_IP}:8096:8080"
    networks:
      - services
```

Create `.env` on the VPS:

```bash
cp .env.example .env
nano .env
```

Set `WIDGET_BIND_IP` to the VPS private/LAN/Tailscale IP:

```text
WIDGET_BIND_IP=10.0.0.175
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

Use the private host IP URLs in Homarr:

```text
http://10.0.0.175:8096/ping/
http://10.0.0.175:8096/debug/
http://10.0.0.175:8096/widgets/daylight/
http://10.0.0.175:8096/widgets/dashdot/
```

This project does not use a base path or path rewrite.

If Homarr shows a blank iframe, test in this order:

```text
http://10.0.0.175:8096/ping/
http://10.0.0.175:8096/debug/
http://10.0.0.175:8096/widgets/dashdot/?demo=1
http://10.0.0.175:8096/widgets/dashdot/?debug=1
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
