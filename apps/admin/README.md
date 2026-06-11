# VTT-Chat Admin Dashboard

Admin SPA for managing VTT-Chat platform, built with React + Vite.

## Features

- **Authentication**: Single admin user with username/password login
- **User Management**: View all registered players and DMs
- **Campaign Management**: Archive, export, import, and delete campaigns
- **Platform Status**: Real-time service health monitoring
- **Analytics**: Usage metrics, session data, and engagement stats
- **Logs**: System-wide logging with filtering and search

## Development

```bash
npm install
npm run dev
```

Runs on http://localhost:5174

## Build

```bash
npm run build
```

Outputs to `dist/` directory.

## API Endpoints

The admin dashboard proxies to `/api/admin/*` endpoints:

- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/users` - List all users
- `GET /api/admin/campaigns` - List all campaigns
- `POST /api/admin/campaigns/{id}/archive` - Archive campaign
- `POST /api/admin/campaigns/{id}/export` - Export campaign
- `DELETE /api/admin/campaigns/{id}` - Delete campaign
- `GET /api/admin/status` - Platform status
- `GET /api/admin/analytics` - Analytics data
- `GET /api/admin/logs` - System logs

## Deployment

The admin SPA is served at `/admin` in production via Caddy reverse proxy.

See docker-compose files for container configuration.
