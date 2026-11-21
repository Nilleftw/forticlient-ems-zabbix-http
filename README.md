# FortiClient EMS by HTTP

Zabbix 7.0 template for FortiClient EMS 7.4.8 monitoring over HTTPS. Import [template_forticlient_ems_http.yaml](template_forticlient_ems_http.yaml). No SNMP interface is required.

## Setup

Create one Zabbix host per EMS site and set these host macros:

| Macro | Value |
|---|---|
| `{$EMS.API.URL}` | EMS base URL, for example `https://ems.example.com` |
| `{$EMS.API.SITE}` | Site name, such as `default` |
| `{$EMS.API.USERNAME}` | EMS account with access to the selected site |
| `{$EMS.API.PASSWORD}` | Password stored as **Secret text** |

The script normalizes an explicit default HTTPS port (`:443`) before setting the Origin and Referer headers. This avoids an EMS CSRF rejection observed with `https://host:443`.

Each collection group has one Script master item and dependent metrics. **Disable a group's master item to stop its API requests.** Disabling a dependent item only stops storing that metric; its master still polls. Polling intervals are controlled by the corresponding `{$EMS.API.<GROUP>.INTERVAL}` template macro.

| Group | Master key | Default interval | Scope | Data |
|---|---|---:|---|---|
| License | `ems.api.license.raw` | 5m | Site | EPP, ZTNA, all active license types, trial status |
| Endpoints | `ems.api.endpoints.raw` | 10m | Site | Total, online, offline, managed, unmanaged |
| Security | `ems.api.security.raw` | 30m | Site | Vulnerabilities, affected endpoints, profile/tag errors, active forensics |
| Alerts | `ems.api.alerts.raw` | 10m | Site | Alert count and unread alerts for the API account |
| Performance | `ems.api.perfmon.raw` | 5m | Global | CPU, RAM, swap, disks, network, database, EMS processes |
| System | `ems.api.system.raw` | 15m | Global | HA members, signature update, upgrade and repackager status |
| Certificates | `ems.api.certificates.raw` | 1h | Global | Certificate counts, expiry within 30 days, earliest expiry |
| Inventory | `ems.api.inventory.raw` | 1h | Global | Site and workgroup counts |

All groups are enabled in the template so a new installation can inspect available metrics. For multi-site EMS, enable the global groups on only one host to avoid collecting the same data repeatedly. Some global groups require an EMS account with global administrator access.

## License discovery

EPP and ZTNA retain their fixed item keys. Low-level discovery adds eight metrics for each other license type with used, allocated, future, or expired seats. Types with only zero values are omitted. The raw license item stores normalized counts and dates; EMS serial numbers and host IDs are discarded.

## Data handling and compatibility

The template stores normalized monitoring values instead of raw EMS responses. This matters because some EMS API responses contain sensitive fields. Credentials and cookies remain inside a Script execution. No license or security triggers are enabled until thresholds are validated for more environments.

The license, dashboard, and several other routes were observed in the EMS web interface; they are not all present in the supplied Fortinet OpenAPI files. See [API_COVERAGE.md](API_COVERAGE.md) for the routes used by each group. Performance collection uses EMS's internal Grafana endpoints and may need adjustments on other EMS versions. Certificate expiry comparisons use the date portion of the EMS response.

## Validation

Imported into Zabbix 7.0.32 and tested against FortiClient EMS 7.4.8. All eight master items returned values. The license discovery created eight Chromebook items with correct values. In the lab, all 83 EMS API items received values and none were unsupported after discovery completed.

References: [Zabbix Script items](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/script), [dependent items](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/dependent_items), and [template import](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/configuration/import).
