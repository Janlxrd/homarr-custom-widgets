# homarr-iframes

Custom iframe widgets for Homarr, built as a small internal Docker service.

## Widgets

- `GET /widgets/daylight/` - local-time sunrise, sunset, and day-progress widget.
- `GET /widgets/dashdot/` - custom Dashdot server summary widget.
- `GET /showcase/` - local iframe preview page for testing widget sizes.

## Docker

The example Compose file keeps the service internal to the Docker network and
does not publish ports externally:

```yaml
services:
  custom-widgets:
    build: .
    expose:
      - "8080"
    networks:
      - services
```

Dashdot is expected on the same Docker network at:

```text
http://dashdot:3001
```

## Homarr iFrame URLs

Use the internal widget URL only if the browser viewing Homarr can resolve and
reach the hostname:

```text
http://custom-widgets:8080/widgets/daylight/
http://custom-widgets:8080/widgets/dashdot/
```

If the browser cannot resolve Docker service names, route the widget service
through your existing internal Homarr/reverse-proxy path without publishing it
publicly.

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
