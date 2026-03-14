---
title: "Admin VM Landing Page Configuration"
description: "Admin portal feature to configure VM landing page content (logo, company info, colors)"
status: pending
priority: P2
effort: 6h
branch: main
tags: [admin, vm-landing, cloud-init, configuration]
created: 2026-01-30
---

# Admin VM Landing Page Configuration

## Overview

Add admin feature to configure VM landing page displayed on each VM's nginx. Currently uses hardcoded `HASONTECH_LANDING_PAGE` HTML in cloud_init_generator.py.

**Goal:** Allow admins to customize landing page via UI (logo, company info, colors) instead of editing code.

## Current State

- Landing HTML: `/backend/app/services/cloud_init_generator.py` - `HASONTECH_LANDING_PAGE` constant
- Logo served: `/static/logo-hasontech.png` via nginx
- System settings pattern: `system_settings` table + `SystemSettingsService`

## Phases

| Phase | Description | Effort | Status |
|-------|-------------|--------|--------|
| 1 | Database model + migration | 1h | pending |
| 2 | Backend API endpoints | 1.5h | pending |
| 3 | Admin UI page | 2h | pending |
| 4 | Update cloud_init_generator | 1h | pending |
| 5 | Testing + Polish | 0.5h | pending |

## Key Architecture Decisions

1. **Single JSON config in system_settings** - Store all landing page config as JSON in one `vm_landing_config` key (not separate keys per field). Simpler to manage.
2. **Logo upload to nginx/html/static** - Logos saved to `/nginx/html/static/` directory, served via existing `/static/` route.
3. **MUI color pickers** - Use `@mui/x-date-pickers` or simple hex input with MUI color preview.
4. **Live preview** - Render HTML template in iframe before save.

## Phase Files

- [Phase 1: Database Model](./phase-01-database-model-and-migration.md)
- [Phase 2: Backend API](./phase-02-backend-api-endpoints-for-landing-config.md)
- [Phase 3: Admin UI](./phase-03-admin-ui-page-with-form-and-color-pickers.md)
- [Phase 4: Cloud Init Integration](./phase-04-update-cloud-init-generator-to-use-db-config.md)
- [Phase 5: Testing](./phase-05-testing-and-verification.md)

## Dependencies

- Existing: `system_settings` table, `SystemSettingsService`
- Existing: nginx `/static/` route serving `/usr/share/nginx/static/`
- Existing: Admin auth pattern via `get_current_admin_user`

## Success Criteria

1. Admin can access "Cau hinh trang VM" menu
2. Form saves config to database
3. Preview shows rendered HTML before save
4. New VMs use custom landing page
5. Logo upload works (URL or file)
