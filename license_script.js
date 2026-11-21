var p = JSON.parse(value);
var site = p.site;
var base = p.base_url.replace(/\/$/, '').replace(/:443$/, '');
if (!/^https:\/\/[^/]+$/.test(base)) throw 'Invalid EMS API URL';
if (!site || !p.username || !p.password) throw 'EMS API credentials or site missing';

var req = new HttpRequest();
req.addHeader('Accept: application/json');
req.addHeader('Content-Type: application/json');
req.addHeader('EMS-Call-Type: 2');
var signinBody = req.post(base + '/api/v1/auth/signin', JSON.stringify({
    name: p.username, password: p.password, site: site
}));
if (req.getStatus() !== 200) throw 'EMS API signin HTTP ' + req.getStatus() + ' for site ' + site;
var signin;
try { signin = JSON.parse(signinBody); }
catch (ignored) { throw 'EMS API signin returned invalid JSON'; }
if (!signin.result || Number(signin.result.retval) !== 1)
    throw 'EMS API signin rejected for site ' + site;

var headers = req.getHeaders(true);
var cookies = [];
var csrf = '';
Object.keys(headers).forEach(function (name) {
    if (name.toLowerCase() !== 'set-cookie') return;
    var values = headers[name];
    if (!Array.isArray(values)) values = [values];
    values.forEach(function (header) {
        var pair = String(header).split(';', 1)[0];
        var equals = pair.indexOf('=');
        if (equals <= 0) return;
        cookies.push(pair);
        if (pair.slice(0, equals).toLowerCase() === 'csrftoken') csrf = pair.slice(equals + 1);
    });
});
if (!cookies.length) throw 'EMS API signin returned no session cookie for site ' + site;

req.clearHeader();
req.addHeader('Accept: application/json');
req.addHeader('EMS-Call-Type: 2');
req.addHeader('Cookie: ' + cookies.join('; '));
req.addHeader('Referer: ' + base + '/');
if (csrf) req.addHeader('X-CSRFToken: ' + csrf);
var body = req.get(base + '/api/v1/license/get');
if (req.getStatus() !== 200) throw 'EMS API license/get HTTP ' + req.getStatus() + ' for site ' + site;

var response = JSON.parse(body);
if (!response.result || Number(response.result.retval) !== 1 || !response.data)
    throw 'EMS API license/get returned an unsuccessful result for site ' + site;
var data = response.data;
if (!data.used || !data.vdom_seats || !Array.isArray(data.licenses))
    throw 'EMS API license/get schema changed for site ' + site;

function count(value, field) {
    var n = Number(value);
    if (value === null || value === undefined || value === '' ||
        !isFinite(n) || n < 0 || Math.floor(n) !== n)
        throw 'Invalid EMS license count: ' + field;
    return n;
}
    function optionalCount(section, kind) {
        return section && section[kind] !== undefined && section[kind] !== null ?
            count(section[kind], kind) : 0;
    }
    function license(kind, strict) {
        if (strict && (data.used[kind] === undefined || data.vdom_seats[kind] === undefined))
            throw 'EMS API license/get omitted ' + kind;
        var used = optionalCount(data.used, kind);
        var allocated = optionalCount(data.vdom_seats, kind);
        var total = optionalCount(data.seats, kind);
        var future = optionalCount(data.future_seats, kind);
        var expired = optionalCount(data.expired_seats, kind);
        var expiration = null;
        data.licenses.forEach(function (entry) {
            if (entry && entry.type === kind && typeof entry.expiry_date === 'string' &&
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(entry.expiry_date) &&
                (expiration === null || entry.expiry_date < expiration))
                expiration = entry.expiry_date;
        });
        var pct = allocated > 0 ? 100 * used / allocated : null;
        var expiryEpoch = expiration === null ? 0 : Math.floor(Date.parse(expiration + 'Z') / 1000);
        if (!isFinite(expiryEpoch) || expiryEpoch < 0)
            throw 'Invalid EMS license expiry date: ' + kind;
        return {
            used: used,
            allocated: allocated,
            total: total,
            future: future,
            expired: expired,
            available: Math.max(0, allocated - used),
            utilization: pct,
            expiry_date: expiration,
            expiry_epoch: expiryEpoch,
            summary: used + ' / ' + allocated + ' (' + (pct === null ? 'n/a' : pct.toFixed(2) + '%') + ')'
        };
    }
    var names = {};
    [data.seats, data.vdom_seats, data.used, data.future_seats,
        data.expired_seats].forEach(function (section) {
        Object.keys(section || {}).forEach(function (kind) { names[kind] = true; });
    });
    data.licenses.forEach(function (entry) {
        if (entry && typeof entry.type === 'string') names[entry.type] = true;
    });
    var types = {}, discovery = [];
    Object.keys(names).sort().forEach(function (kind) {
        if (!/^[a-z][a-z0-9_]*$/.test(kind)) return;
        var item = license(kind, false);
        types[kind] = item;
        if (kind !== 'epp' && kind !== 'ztna' &&
            (item.used || item.allocated || item.future || item.expired))
            discovery.push({'{#LICENSE_TYPE}': kind});
    });
    return JSON.stringify({epp: license('epp', true), ztna: license('ztna', true),
        is_trial: data.is_trial ? 1 : 0, types: types, discovery: discovery});
