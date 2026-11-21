# FortiClient EMS by HTTP

Standalone Zabbix 7.0 template for license monitoring through the FortiClient EMS 7.4.8 API. Import [template_forticlient_ems_http.yaml](template_forticlient_ems_http.yaml). No SNMP interface or SNMP discovery is required.

Each Zabbix host represents one EMS site. Multiple hosts can point to the same EMS URL while using different site credentials. Set these host macros in Zabbix:

| Macro | Value |
|---|---|
| `{$EMS.API.URL}` | EMS base URL, for example `https://ems.example.com:443` |
| `{$EMS.API.SITE}` | Site name; `default` in the lab |
| `{$EMS.API.USERNAME}` | EMS API username |
| `{$EMS.API.PASSWORD}` | EMS API password stored as *Secret text* |

One Script item signs in through `/api/v1/auth/signin` and calls `/api/v1/license/get` with the session cookies and CSRF header. Dependent items expose used, allocated, and available EPP and ZTNA licenses, utilization, a summary, and the earliest expiration date. Credentials, cookies, serial numbers, and host IDs are not stored as item values. No triggers are included before lab validation.

An experimental second Script item signs in without a site to access the global EMS Performance dashboard and queries its internal Grafana data source. It exposes overall CPU, RAM, swap, highest disk usage, online endpoints, database connections, online EMS nodes, highest database node latency, network receive/send rates, established connections, keep-alive processing, highest EMS process CPU/RAM usage, and CPU core count. These internal routes are not part of the supplied Fortinet OpenAPI specification and may change between EMS releases. The Performance dashboard must be enabled, and the configured EMS account must have global super-administrator access to view it. No additional macros or SNMP interface are needed.

When a license type has no allocated seats, its numeric utilization item stores `0` to remain supported in Zabbix. Use the Allocated item or Summary (`n/a`) to distinguish this case from an unused active license. The raw JSON keeps utilization as `null` for zero allocated seats.

**Validation status:** The template imported into Zabbix 7.0.32 after its UUIDv4 correction. Live polling returned normalized license data and populated the EPP and ZTNA dependent items. The zero-seat utilization fallback awaits reimport and validation. Performance polling reached `performance_dashboard/login` but returned HTTP 403 even with a CSRF cookie. The Performance script now signs in without a site to access global context; this correction awaits live validation. The sign-in request matches the supplied Fortinet EMS 7.4.8 Authentication OpenAPI specification. `/api/v1/license/get` was observed in the EMS web interface but is absent from the supplied Fortinet OpenAPI files.

References: [Zabbix Script item](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/script), [Zabbix HttpRequest](https://www.zabbix.com/documentation/7.0/en/manual/config/items/preprocessing/javascript/javascript_objects), and [Zabbix template export](https://www.zabbix.com/documentation/7.0/en/manual/xml_export_import/templates).
