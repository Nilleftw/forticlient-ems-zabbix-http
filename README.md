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

**Validation status:** The YAML and Zabbix 7.0 export structure have been checked, and the session flow has been tested with a simulated API response. The sign-in request matches the supplied Fortinet EMS 7.4.8 Authentication OpenAPI specification. Import into Zabbix and polling against EMS have not yet been tested. `/api/v1/license/get` was observed in the EMS web interface but is absent from the supplied Fortinet OpenAPI files.

References: [Zabbix Script item](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/script), [Zabbix HttpRequest](https://www.zabbix.com/documentation/7.0/en/manual/config/items/preprocessing/javascript/javascript_objects), and [Zabbix template export](https://www.zabbix.com/documentation/7.0/en/manual/xml_export_import/templates).
