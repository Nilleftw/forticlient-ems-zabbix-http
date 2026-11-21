Unable to open session log file "/home/nisamu/.cache/starship/session_4115852731059321.log": Os { code: 30, kind: ReadOnlyFilesystem, message: "Read-only file system" }!
# FortiClient EMS by HTTP

Fristående Zabbix 7.0-template för licensövervakning via FortiClient EMS 7.4.8 API. Importera [template_forticlient_ems_http.yaml](template_forticlient_ems_http.yaml). Ingen SNMP-interface eller SNMP-discovery krävs.

Varje Zabbix-host representerar en EMS-site. Flera hosts kan peka på samma EMS URL och använda olika site-uppgifter. Sätt följande host-makron i Zabbix:

| Makro | Värde |
|---|---|
| `{$EMS.API.URL}` | EMS bas-URL, exempelvis `https://ems.example.com:443` |
| `{$EMS.API.SITE}` | Site-namn; `default` i labbet |
| `{$EMS.API.USERNAME}` | API-användare |
| `{$EMS.API.PASSWORD}` | API-lösenord som *Secret text* |

Ett Script item loggar in mot `/api/v1/auth/signin` och hämtar `/api/v1/license/get` med sessionscookies och CSRF-header. Beroende items visar använda, tilldelade och lediga EPP-/ZTNA-licenser, förbrukning, sammanfattning och tidigaste utgångsdatum. Inga credentials, cookies, serienummer eller host-ID sparas som item-värden. Inga triggers ingår före labbverifiering.

**Status:** YAML och Zabbix 7.0-exportstruktur är kontrollerade, och sessionsflödet har testats med simulerat API-svar. Faktisk import och insamling från EMS återstår. Endpointen `/api/v1/license/get` har observerats i EMS webbgränssnitt men inte verifierats mot Fortinets OpenAPI-JSON.

Referenser: [Zabbix Script item](https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/script), [Zabbix HttpRequest](https://www.zabbix.com/documentation/7.0/en/manual/config/items/preprocessing/javascript/javascript_objects), [Zabbix template-export](https://www.zabbix.com/documentation/7.0/en/manual/xml_export_import/templates).
