# CommuteMap PH

CommuteMap PH is a map-based public transport guide for the Philippines. It is
designed to show clear boarding points, ordered journey segments, estimated
fares and durations, and route paths without presenting unverified guidance as
fact.

The project currently focuses on Metro Manila and is being developed
incrementally. The application and deployment infrastructure are functional,
but public journey coverage remains intentionally limited until route data has
been field-verified.

## Core principles

- Only active, verified, and recently reviewed data can appear as public
  guidance.
- Imported OpenStreetMap and GTFS records are candidates, not proof that a stop
  is currently usable.
- Provisional journeys remain inactive and unpublished.
- Readiness checks block publication while required evidence is missing.
- Development previews are never exposed in production.

## Current capabilities

- Search supported starting points and destinations
- Use browser geolocation to find nearby supported pickup points
- Search general Metro Manila places with MapTiler autocomplete
- Display supported locations, nearby candidates, journey markers, and paths
  with MapLibre GL
- Assemble direct and one-transfer journey results
- Order walking and transit segments
- Aggregate journey duration and fare ranges
- Preview provisional journey structures during development
- Review imported stops, routes, schedules, and evidence in a protected
  operations area
- Validate location, route, and journey readiness before activation or
  publication
- Run as a standalone Next.js application or Docker container

## Technology

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS
- PostgreSQL 17 with PostGIS 3.5
- Drizzle ORM and Drizzle Kit
- MapLibre GL
- pnpm
- Docker and Docker Compose

CommuteMap PH is currently a single full-stack Next.js application. Browser UI,
API route handlers, and server-side data access live in the same deployable
project; a separate backend service is not required for the current scope.

## Requirements

- Node.js 22.23.2
- pnpm 11.6.0
- Docker Desktop, or another PostgreSQL installation with PostGIS

If you use `nvm`, activate the repository's Node version:

```bash
nvm use
```

## Local setup

Install dependencies:

```bash
pnpm install
```

Create the local environment file:

```bash
cp .env.example .env
```

For the included local database container, use:

```env
DATABASE_URL=postgresql://commutemap:commutemap_local@localhost:5433/commutemap_ph
```

The other environment variables are:

```env
# Optional locally; required for production builds.
NEXT_PUBLIC_MAP_STYLE_URL=https://your-map-provider.example/style.json

# Optional server-only key for general place autocomplete.
MAPTILER_API_KEY=replace-with-a-maptiler-key

# Optional secret enabling the protected operations area. Minimum 32 characters.
OPERATIONS_ACCESS_TOKEN=replace-with-a-long-random-secret
```

`MAPTILER_API_KEY` is server-only. Do not rename it with a `NEXT_PUBLIC_`
prefix. A map style URL used by MapLibre is loaded by the browser and should use
a separate provider key restricted to the deployed domain when the provider
requires one.

Start PostGIS:

```bash
docker compose up -d db
```

Apply database migrations and seed the initial supported locations:

```bash
pnpm db:migrate
pnpm db:seed
```

Confirm the database and PostGIS connection:

```bash
pnpm db:check
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Provisional development data

Draft route and journey fixtures are optional. They exist to exercise data
relationships, calculations, UI states, and readiness rules; they are not
public transport guidance.

```bash
pnpm db:seed-draft-routes
pnpm db:seed-draft-journey
pnpm db:check-draft-journey
```

Imported stop candidates can be reviewed during development, but must remain
inactive and unverified until the required evidence has been approved.

Fetch and import city-wide OpenStreetMap candidates without depending on every
stop having an `addr:city` tag:

```bash
pnpm db:fetch-osm-provisional-stops -- /tmp/pasig-osm-stops.json --city Pasig
pnpm db:import-provisional-stops -- /tmp/pasig-osm-stops.json
pnpm db:sync-location-duplicate-reviews
```

The fetch step uses the city's mapped administrative boundary. Importing is
idempotent by source ID: existing provisional records are updated, while active
or verified records are preserved. Unnamed mapped stops receive an explicit
provisional review label rather than an invented public identity.

Mapped public-transport relations can also be staged as route candidates. Run
the stop imports for every city crossed by the routes first so more relation
members can be linked to stored locations.

```bash
pnpm db:fetch-osm-provisional-routes -- /tmp/pasig-osm-routes.json --city Pasig
pnpm db:import-provisional-routes -- /tmp/pasig-osm-routes.json
```

Route candidates remain private and cannot be used by public journey search.
After manually reviewing a candidate and its linked stop order, prepare a JSON
promotion input and run the guarded command without `--apply` first:

```bash
pnpm db:promote-route-candidate -- ./reviewed-route-promotion.json
pnpm db:promote-route-candidate -- ./reviewed-route-promotion.json --apply
```

Promotion creates only an inactive, unverified route and inactive schedule. It
also writes an immutable audit record. The resulting draft still requires the
normal location, route, schedule, and journey evidence workflow before it can
become public.

The operations area is available at
[http://localhost:3000/operations](http://localhost:3000/operations) when
`OPERATIONS_ACCESS_TOKEN` is configured.

## Useful commands

| Command                     | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `pnpm dev`                  | Start the development server                             |
| `pnpm build`                | Create the standalone production build                   |
| `pnpm start`                | Run the generated standalone server                      |
| `pnpm lint`                 | Run ESLint                                               |
| `pnpm typecheck`            | Check TypeScript without emitting files                  |
| `pnpm test`                 | Run the complete automated test suite                    |
| `pnpm format`               | Format the repository with Prettier                      |
| `pnpm format:check`         | Check formatting without changing files                  |
| `pnpm verify`               | Run formatting, lint, types, tests, and production build |
| `pnpm db:generate`          | Generate a Drizzle migration after a schema change       |
| `pnpm db:migrate`           | Apply pending database migrations                        |
| `pnpm db:check`             | Verify PostgreSQL and PostGIS connectivity               |
| `pnpm check:public-release` | Smoke-test a running production application              |

Because `pnpm build` produces browser map assets, a valid
`NEXT_PUBLIC_MAP_STYLE_URL` must be configured before running `pnpm build` or
`pnpm verify`.

## Data verification workflow

Public availability is controlled by the stored verification state and the
readiness checkers, not by how plausible an imported record appears.

The required order is:

1. Review and replace development fixtures with confirmed sourced locations.
2. Record and approve observations for every route-stop location.
3. Record and approve the transport route and schedule observation.
4. Record and approve a complete journey field test.
5. Run the unified journey release-readiness report.
6. Activate and publish only after every blocker has been resolved.

Useful readiness commands include:

```bash
pnpm db:check-location-readiness <location-slug>
pnpm db:check-journey-readiness <journey-slug>
pnpm db:report-journey-release-readiness <journey-slug>
```

Third-party guides and proximity to an imported stop are not sufficient proof
of current fares, schedules, payment methods, boarding instructions, or route
paths.

## Production deployment

The production image uses Next.js standalone output and runs as a non-root
user. Database migrations are provided as a separate one-shot container and
must succeed before the application starts.

Configure these deployment variables:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
NEXT_PUBLIC_MAP_STYLE_URL=https://your-map-provider.example/style.json
MAPTILER_API_KEY=optional-server-only-key
OPERATIONS_ACCESS_TOKEN=optional-secret-of-at-least-32-characters
APP_PORT=3000
```

`DATABASE_URL` must point to a PostgreSQL database with permission to enable or
use PostGIS. When using Docker, the database host must be reachable from the
container; `localhost` refers to the application container itself.

Build, migrate, and start the production application:

```bash
docker compose -f compose.production.yaml up --build -d
```

Check container status and logs:

```bash
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs app
```

The application exposes separate probes:

- `GET /api/live` confirms that the server process can respond.
- `GET /api/ready` confirms that the application can reach the database.
- `GET /api/health` remains as a backwards-compatible database health check.

After deployment, run the public release checks against the deployed URL:

```bash
APP_URL=https://your-domain.example pnpm check:public-release
```

The smoke checker confirms that the application is ready, security headers are
present, active locations can be searched, and provisional locations and
journeys remain private.

## Project structure

```text
drizzle/                    SQL migrations and Drizzle metadata
scripts/                    Database, evidence, readiness, and release tools
src/app/                    Pages and API route handlers
src/components/             Search, journey, map, and operations UI
src/config/                 Validated application configuration
src/lib/                    Browser-safe domain helpers
src/server/db/              Drizzle connection and database schema
src/server/journeys/        Journey search, assembly, and validation
src/server/locations/       Location search and verification logic
src/server/routes/          Route and schedule validation
src/server/verification/    Shared verification freshness rules
```

## Release status

The application infrastructure is suitable for deployment, but the public
transport dataset is not considered complete. A technically working draft must
not be mistaken for verified commuter guidance. Journey coverage should expand
only as real-world observations pass the existing review and readiness process.
