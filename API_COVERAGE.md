# EMS API coverage

The routes below were observed and tested against FortiClient EMS 7.4.8 Linux. Authentication uses `POST /api/v1/auth/signin` for the configured site. Most monitoring routes are internal EMS web interface calls and are absent from the supplied Fortinet Developer Network OpenAPI files. Revalidate them when upgrading EMS.

| Group | Routes used after sign-in | Stored values |
|---|---|---|
| License | `GET /api/v1/license/get` | Normalized seats, expiry dates, trial status and license type discovery |
| Endpoints | `GET /api/v1/endpoints/count`, `GET /api/v1/endpoints/connection/donut`, `GET /api/v1/endpoints/management/donut` | Endpoint counts and online percentage |
| Security | `GET /api/v1/vulnerabilities/summary`, `GET /api/v1/profiles/error_count`, `GET /api/v1/tags/zero_trust/error_count`, `GET /api/v1/forensics/active/count` | Vulnerability and error counts |
| Alerts | `GET /api/v1/alerts/count`, `GET /api/v1/alerts/count_unread` | Alert counts; unread is specific to the API account |
| System | `GET /api/v1/system/ha/info`, `GET /api/v1/system/signatures/poll`, `GET /api/v1/system/check_upgrade`; optional `GET /api/v1/system/cloud/repackager/status` | HA, signature and upgrade status; optional repackager status |
| Certificates | `GET /api/v1/server_certificates/index`; optional `GET /api/v1/client_certificates/index` | Server certificate count and expiry summary; optional client certificate count |
| Inventory | `GET /api/v1/sites/names/index`, `GET /api/v1/workgroups/index` | Site and workgroup counts |
| Performance | `POST /api/v1/performance_dashboard/login`, `GET /api/v1/performance_dashboard/dashboard_search`, internal Grafana dashboard definition and data query | CPU, RAM, disk, EMS node count and DB latency by default; optional database, network, keep-alive and process diagnostics when extended collection is enabled |

Each group makes one sign-in request and then its listed calls per polling interval. Disable a group's Script master item to avoid those requests. Dependent items do not make separate API requests.

The EMS web application contains many more GET routes, including endpoint and event lists. Those lists may be large or contain personal data, so the template does not store their raw responses. `GET /api/v1/forti_care/get` is excluded because its response contains a password field. Routes requiring client certificates are also outside this session-based template.
