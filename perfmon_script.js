var p = JSON.parse(value);
var base = p.base_url.replace(/\/$/, '').replace(/:443$/, '');
if (!/^https:\/\/[^/]+$/.test(base) || !p.username || !p.password)
    throw 'Invalid EMS perfmon parameters';

var req;
var cookies = {};
var csrf = '';
function captureCookies() {
    var headers = req.getHeaders(true);
    Object.keys(headers).forEach(function (name) {
        if (name.toLowerCase() !== 'set-cookie') return;
        var values = headers[name];
        if (!Array.isArray(values)) values = [values];
        values.forEach(function (header) {
            var pair = String(header).split(';', 1)[0];
            var pos = pair.indexOf('=');
            if (pos < 1) return;
            var key = pair.slice(0, pos), val = pair.slice(pos + 1);
            cookies[key] = val;
            if (key.toLowerCase() === 'csrftoken') csrf = val;
        });
    });
}
function headers(grafana, json) {
    var r = new HttpRequest();
    r.addHeader('Accept: application/json');
    if (json) r.addHeader('Content-Type: application/json');
    if (!grafana) {
        r.addHeader('EMS-Call-Type: 2');
        if (csrf) r.addHeader('X-CSRFToken: ' + csrf);
    } else {
        r.addHeader('X-Grafana-Org-Id: ' + org);
    }
    r.addHeader('Origin: ' + base);
    var pairs = [];
    Object.keys(cookies).forEach(function (key) { pairs.push(key + '=' + cookies[key]); });
    if (pairs.length) r.addHeader('Cookie: ' + pairs.join('; '));
    r.addHeader('Referer: ' + base + '/');
    return r;
}
function checked(status, operation) {
    if (req.getStatus() !== status) throw 'EMS perfmon ' + operation + ' HTTP ' + req.getStatus();
}
function parsed(body, operation) {
    try { return JSON.parse(body); }
    catch (e) { throw 'EMS perfmon ' + operation + ' returned invalid JSON'; }
}
function reason(body) {
    var detail = String(body || '');
    try {
        var errorResponse = JSON.parse(detail);
        detail = String((errorResponse.result && errorResponse.result.message) ||
            errorResponse.message || errorResponse.error || '');
    } catch (ignored) {}
    if (/csrf|cross.site|origin|referer/i.test(detail)) return 'CSRF or origin rejected';
    if (/permission|privilege|forbidden|access.denied/i.test(detail)) return 'permission denied';
    if (/session|authenticat|login|credential/i.test(detail)) return 'session rejected';
    return 'unclassified';
}
var org = '1';
req = headers(false, true);
var signinBody = req.post(base + '/api/v1/auth/signin', JSON.stringify({
    name: p.username, password: p.password
}));
checked(200, 'signin');
var signin = parsed(signinBody, 'signin');
if (!signin.result || Number(signin.result.retval) !== 1)
    throw 'EMS perfmon signin rejected (' + reason(signinBody) + ')';
captureCookies();
if (!Object.keys(cookies).length) throw 'EMS perfmon signin returned no session cookie';

req = headers(false, false);
var sessionCheckBody = req.get(base + '/api/v1/session/check');
checked(200, 'session check');
var sessionCheck = parsed(sessionCheckBody, 'session check');
if (!sessionCheck.result || Number(sessionCheck.result.retval) !== 1)
    throw 'EMS perfmon session check rejected (' + reason(sessionCheckBody) + ')';
captureCookies();

req = headers(false, true);
var sessionUpdateBody = req.post(base + '/api/v1/session/update',
    JSON.stringify({site: null}));
if (req.getStatus() === 403)
    throw 'EMS perfmon global session selection HTTP 403 (' +
        reason(sessionUpdateBody) + '; session cookie ' +
        (Object.keys(cookies).length ? 'present' : 'missing') + '; CSRF cookie ' +
        (csrf ? 'present' : 'missing') + ')';
checked(200, 'global session selection');
var sessionUpdate = parsed(sessionUpdateBody, 'global session selection');
if (!sessionUpdate.result || Number(sessionUpdate.result.retval) !== 1)
    throw 'EMS perfmon could not select global session';
captureCookies();

req = headers(false, false);
var grafanaLoginBody = req.post(base + '/api/v1/performance_dashboard/login', '');
if (req.getStatus() === 403) {
    throw 'EMS perfmon Grafana login HTTP 403 (' + reason(grafanaLoginBody) +
        '; CSRF cookie ' + (csrf ? 'present' : 'missing') + ')';
}
checked(200, 'Grafana login');
captureCookies();

req = headers(false, false);
var search = parsed(req.get(base + '/api/v1/performance_dashboard/dashboard_search?from=now-5m&to=now'), 'dashboard search');
checked(200, 'dashboard search');
if (!search.data || !Array.isArray(search.data) || !search.data.length)
    throw 'EMS perfmon dashboard search returned no panels';
var panels = search.data;
var host = panels[0].var_host;
org = String(panels[0].org_id || 1);
if (!/^[A-Za-z0-9_.-]+$/.test(host)) throw 'EMS perfmon returned invalid host name';
var uid = panels[0].uid;
if (!/^[A-Za-z0-9_-]+$/.test(uid)) throw 'EMS perfmon returned invalid dashboard UID';

req = headers(true, false);
var dto = parsed(req.get(base + '/grafana/apis/dashboard.grafana.app/v1beta1/namespaces/default/dashboards/' + uid + '/dto'), 'dashboard definition');
checked(200, 'dashboard definition');
if (!dto.spec || !Array.isArray(dto.spec.panels)) throw 'EMS perfmon dashboard definition changed';

var wanted = {
    'System Overall CPU Usage (%)': 'cpu_pct',
    'RAM System Usage (%)': 'ram_pct',
    'Disk Space Usage (%)': 'disk_max_pct',
    'DB Connections (totals)': 'db_connections',
    'EMS nodes online': 'ems_nodes_online',
    'DB nodes latency (ms)': 'db_latency_max_ms',
    'Real Time Network Traffic Rate': 'network',
    'Network Connections': 'network_connections',
    'Keep Alive Processing (ms)': 'keep_alive_ms',
    'Keep Alive Processing (records)': 'keep_alive_records',
    'EMS processes CPU usage': 'ems_process_cpu_max',
    'EMS process RAM Usage (%)': 'ems_process_ram_max_pct'
};
var queries = [], byRef = {};
dto.spec.panels.forEach(function (panel) {
    var metric = wanted[panel.title];
    if (!metric || !panel.targets || !panel.targets.length) return;
    var target = panel.targets[0];
    if (!target.query || !target.datasource || !target.datasource.uid) return;
    var ref = 'M' + queries.length;
    var query = target.query.replace(/\$\{host\}/g, host);
    query = query.replace(/\$\{cpus\}/g, String(panels[0].var_cpus || 1));
    queries.push({
        datasource: target.datasource, query: query, refId: ref,
        intervalMs: 5000, maxDataPoints: 100
    });
    byRef[ref] = metric;
});
if (!queries.length) throw 'EMS perfmon dashboard has no usable queries';
req = headers(true, true);
var result = parsed(req.post(base + '/grafana/api/ds/query',
    JSON.stringify({queries: queries, from: 'now-5m', to: 'now'})), 'data query');
checked(200, 'data query');
if (!result.results) throw 'EMS perfmon data query returned no results';

function latest(frame) {
    var fields = frame.schema && frame.schema.fields || [];
    var values = frame.data && frame.data.values || [];
    for (var i = 0; i < fields.length; i++) {
        if (fields[i].name === 'Time' || fields[i].name === '_time') continue;
        var series = values[i] || [];
        for (var j = series.length - 1; j >= 0; j--) {
            if (series[j] !== null && series[j] !== undefined && isFinite(Number(series[j])))
                return {name: fields[i].name, value: Number(series[j])};
        }
    }
    return null;
}
var output = {
    cpu_pct: null, ram_pct: null, disk_max_pct: null,
    db_connections: null, ems_nodes_online: null,
    db_latency_max_ms: null, net_recv_bps: null, net_sent_bps: null,
    network_connections: null, keep_alive_ms: null, keep_alive_records: null,
    ems_process_cpu_max: null, ems_process_ram_max_pct: null,
    cpu_cores: Number(panels[0].var_cpus) || null
};
Object.keys(byRef).forEach(function (ref) {
    var metric = byRef[ref], response = result.results[ref];
    if (!response || response.status !== 200) return;
    var frames = response.frames || [];
    var numbers = [];
    frames.forEach(function (frame) {
        var point = latest(frame);
        if (!point) return;
        if (metric === 'network') {
            if (point.name.indexOf('bytes_recv') >= 0)
                output.net_recv_bps = (output.net_recv_bps || 0) + point.value;
            if (point.name.indexOf('bytes_sent') >= 0)
                output.net_sent_bps = (output.net_sent_bps || 0) + point.value;
        } else if (metric === 'network_connections') {
            if (point.name === 'tcp_currestab')
                output.network_connections = point.value;
        } else numbers.push(point.value);
    });
    if (!numbers.length) return;
    if (metric === 'disk_max_pct' || metric === 'db_latency_max_ms' ||
        metric === 'ems_process_cpu_max' || metric === 'ems_process_ram_max_pct')
        output[metric] = Math.max.apply(null, numbers);
    else if (metric === 'db_connections' || metric === 'ems_nodes_online')
        output[metric] = numbers.reduce(function (a, b) { return a + b; }, 0);
    else output[metric] = numbers[0];
});
return JSON.stringify(output);
