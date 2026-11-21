var p = JSON.parse(value);
var base = p.base_url.replace(/\/$/, '').replace(/:443$/, '');
if (!/^https:\/\/[^/]+$/.test(base) || !p.site || !p.username || !p.password)
    throw 'Invalid EMS API group parameters';
var group = p.group;
if (['endpoints', 'security', 'system', 'alerts', 'certificates', 'inventory'].indexOf(group) < 0)
    throw 'Invalid EMS API group';

var cookies = {}, csrf = '';
function capture(req) {
    var headers = req.getHeaders(true);
    Object.keys(headers).forEach(function (name) {
        if (name.toLowerCase() !== 'set-cookie') return;
        var values = Array.isArray(headers[name]) ? headers[name] : [headers[name]];
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
function request(json) {
    var req = new HttpRequest();
    req.addHeader('Accept: application/json');
    if (json) req.addHeader('Content-Type: application/json');
    req.addHeader('EMS-Call-Type: 2');
    if (csrf) req.addHeader('X-CSRFToken: ' + csrf);
    req.addHeader('Origin: ' + base);
    req.addHeader('Referer: ' + base + '/');
    var pairs = [];
    Object.keys(cookies).forEach(function (key) { pairs.push(key + '=' + cookies[key]); });
    if (pairs.length) req.addHeader('Cookie: ' + pairs.join('; '));
    return req;
}
function checked(req, body, path) {
    if (req.getStatus() !== 200) throw 'EMS API ' + path + ' HTTP ' + req.getStatus();
    var response;
    try { response = JSON.parse(body); }
    catch (ignored) { throw 'EMS API ' + path + ' returned invalid JSON'; }
    if (!response.result || Number(response.result.retval) !== 1 ||
        response.data === undefined || response.data === null)
        throw 'EMS API ' + path + ' returned an unsuccessful result';
    capture(req);
    return response.data;
}
var req = request(true);
var signinBody = req.post(base + '/api/v1/auth/signin', JSON.stringify({
    name: p.username, password: p.password, site: p.site
}));
if (req.getStatus() !== 200) throw 'EMS API group signin HTTP ' + req.getStatus();
var signin;
try { signin = JSON.parse(signinBody); }
catch (ignored) { throw 'EMS API group signin returned invalid JSON'; }
if (!signin.result || Number(signin.result.retval) !== 1)
    throw 'EMS API group signin rejected';
capture(req);
if (!Object.keys(cookies).length) throw 'EMS API group signin returned no session cookie';
function get(path) {
    var req = request(false);
    return checked(req, req.get(base + '/api/v1/' + path), path);
}
function count(n, field) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0)
        throw 'Invalid EMS count: ' + field;
    return n;
}
function sumValues(obj, field) {
    var total = 0;
    Object.keys(obj || {}).forEach(function (key) {
        var entry = obj[key];
        total += count(typeof entry === 'object' && entry !== null ? entry.count : entry, field);
    });
    return total;
}
var out;
if (group === 'endpoints') {
    var total = count(get('endpoints/count'), 'endpoints');
    var connection = get('endpoints/connection/donut');
    var management = get('endpoints/management/donut');
    if (!Array.isArray(connection) || !Array.isArray(management))
        throw 'EMS endpoint donut schema changed';
    var states = {}, modes = {};
    connection.forEach(function (entry) { states[entry.token] = count(entry.value, 'connection'); });
    management.forEach(function (entry) { modes[entry.token] = count(entry.value, 'management'); });
    var offline = 0;
    Object.keys(states).forEach(function (key) {
        if (key.indexOf('offline') === 0) offline += states[key];
    });
    out = {total: total, online: states.online || 0,
        online_pct: total ? 100 * (states.online || 0) / total : 0,
        offline: offline,
        offline_recent: states.offlineRecent || 0,
        offline_nominal: states.offlineNominal || 0,
        offline_long: states.offlineLong || 0,
        managed: modes.managed || 0,
        unmanaged: modes.unmanaged === undefined ? Math.max(0, total - (modes.managed || 0)) : modes.unmanaged};
} else if (group === 'security') {
    var vulns = get('vulnerabilities/summary');
    var profileErrors = get('profiles/error_count');
    var tagErrors = get('tags/zero_trust/error_count');
    var forensics = get('forensics/active/count');
    var all = vulns['0'] || {};
    function vuln(severity, field) {
        var row = all[severity] || {};
        return count(row[field] === undefined ? 0 : row[field], 'vulnerabilities');
    }
    out = {vulnerabilities: vuln('0', 'vuln_count'),
        high_vulnerabilities: vuln('4', 'vuln_count'),
        critical_vulnerabilities: vuln('5', 'vuln_count'),
        affected_endpoints: vuln('0', 'endpoint_count'),
        profile_errors: sumValues(profileErrors, 'profiles'),
        zero_trust_tag_errors: sumValues(tagErrors, 'tags'),
        active_forensics: count(forensics.count, 'forensics')};
} else if (group === 'system') {
    var ha = get('system/ha/info');
    var signatures = get('system/signatures/poll');
    var upgrade = get('system/check_upgrade');
    var repackager = get('system/cloud/repackager/status');
    if (!Array.isArray(ha.members)) throw 'EMS HA schema changed';
    var alive = 0, primaryAlive = 0;
    ha.members.forEach(function (member) {
        if (member.alive) alive++;
        if (member.alive && member.is_primary) primaryAlive++;
    });
    out = {ha_members: ha.members.length, ha_alive: alive,
        ha_primary_alive: primaryAlive,
        signatures_updating: signatures.is_updating ? 1 : 0,
        upgrade_available: upgrade.is_available ? 1 : 0,
        upgrade_version: upgrade.version || 'none',
        repackager_available: repackager.is_server_available ? 1 : 0};
} else if (group === 'alerts') {
    var alerts = get('alerts/count');
    var unread = get('alerts/count_unread');
    out = {total: count(alerts.count, 'alerts'),
        unread_for_api_account: count(unread.count, 'unread alerts')};
} else if (group === 'certificates') {
    var server = get('server_certificates/index');
    var client = get('client_certificates/index');
    if (!Array.isArray(server)) throw 'EMS server certificate schema changed';
    var now = new Date();
    var today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var earliest = null, expired = 0, soon = 0;
    server.forEach(function (cert) {
        var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cert.expiry_date || '');
        if (!match) return;
        var day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (earliest === null || day < earliest) earliest = day;
        if (day < today) expired++;
        else if (day <= today + 30 * 86400000) soon++;
    });
    out = {server_total: server.length, client_total: count(client.total, 'client certificates'),
        server_expired: expired, server_expiring_30d: soon,
        earliest_server_expiry: earliest === null ? 'none' : new Date(earliest).toISOString().slice(0, 10)};
} else if (group === 'inventory') {
    var sites = get('sites/names/index');
    var workgroups = get('workgroups/index?tree=false&custom=false');
    if (!Array.isArray(sites) || !Array.isArray(workgroups))
        throw 'EMS site or workgroup schema changed';
    out = {sites: sites.length, workgroups: workgroups.length};
}
return JSON.stringify(out);
