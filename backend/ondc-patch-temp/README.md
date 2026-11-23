# AgriNode ONDC-style commerce patch

This patch adds an internal ONDC-style commerce adapter around the existing AgriNode marketplace.

## Added endpoints

- `POST /api/ondc/search`
- `POST /api/ondc/select`
- `POST /api/ondc/init`
- `POST /api/ondc/confirm`
- `GET /api/ondc/orders/:id/status`
- `GET /api/ondc/orders/:id/track`

The implementation deliberately reuses the existing listing, order, settlement and logistics repository instead of creating a second marketplace database.

## Important

This is **not a live ONDC network integration**. The response explicitly reports `integrated: false`. Live ONDC participation requires the appropriate participant role, onboarding, API specifications, security/signing, callbacks, registry/network configuration and compliance work.

ONDC's current technical resources describe buyer/seller applications, API specifications and staging/pre-production integration resources:
https://www.ondc.org/pages/resources-tech.html
