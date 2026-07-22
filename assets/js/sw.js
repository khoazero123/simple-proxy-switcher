const defaults = {
    proxy_current: '',
    proxy_list: '',
    domain_rules: '[]',
    reload_current_tab: false,
    reload_other_tabs: false,
    remove_cookies: false,
    remove_cache: false,
    exclude_urls: '',
};


let proxyEnabled = false;
let proxyAuthMap = {};
let _restored = false;


const readJSON = str => {
    if (!str) return '';
    try {
        return JSON.parse(str);
    } catch {
        return '';
    }
};


function parseDomainRules(raw) {
    const list = readJSON(raw);
    return Array.isArray(list) ? list : [];
}


function proxyKey({ip, port}) {
    return `${ip}:${port}`;
}


function buildAuthMap(entries) {
    const map = {};
    for (const {ip, port, user, pass} of entries) {
        if (user && pass) {
            map[proxyKey({ip, port})] = {user, pass};
        }
    }
    return map;
}


async function runSideEffects() {
    const {
        reload_current_tab,
        reload_other_tabs,
        remove_cookies,
        remove_cache,
    } = await chrome.storage.local.get([
        'reload_current_tab',
        'reload_other_tabs',
        'remove_cookies',
        'remove_cache',
    ]);

    if (reload_current_tab || reload_other_tabs) {
        const wins = await chrome.windows.getAll({populate: true});
        for (const w of wins) {
            for (const t of w.tabs) {
                if (reload_current_tab && t.active) chrome.tabs.reload(t.id, {bypassCache: true});
                if (reload_other_tabs && !t.active) chrome.tabs.reload(t.id, {bypassCache: true});
            }
        }
    }

    if (remove_cookies) await chrome.browsingData.removeCookies({});
    if (remove_cache) await chrome.browsingData.removeCache({});
}


function parseProxyList(raw) {
    const escape = {'&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;'};
    let pendingComment = '';

    return raw.split(/\r?\n/).reduce((out, rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            pendingComment = '';
            return out;
        }
        if (line.startsWith('#')) {
            pendingComment = line.slice(1).trim().replace(/[&"'<>]/g, c => (escape)[c]);
            return out;
        }

        const idx = line.indexOf('#');
        const text = idx === -1 ? line : line.slice(0, idx).trim();
        const inlineComment = idx === -1 ? '' : line.slice(idx + 1).trim().replace(/[&"'<>]/g, c => (escape)[c]);

        let ip, port, user = '', pass = '';
        if (text.includes('@')) {
            const [auth, host] = text.split('@');
            [user, pass] = auth.split(':');
            [ip, port] = host.split(':');
        } else {
            [ip, port, user = '', pass = ''] = text.split(':');
        }

        if (!ip || !port || ((!!user) ^ (!!pass))) {
            pendingComment = '';
            return out;
        }

        out.push({ip, port, user, pass, commentBefore: pendingComment, commentAfter: inlineComment});

        pendingComment = '';
        return out;
    }, []);
}


function updateIcon() {
    const postfix = proxyEnabled ? 'enabled' : 'disabled';
    const path = [16, 32].reduce((o, size) => {
        o[size] = chrome.runtime.getURL(`assets/images/icon${size}_${postfix}.png`);
        return o;
    }, {});
    chrome.action.setIcon({path});
    chrome.action.setBadgeText({text: proxyEnabled ? 'proxy' : ''});
}


function buildExcludePacPatterns(patterns) {
    if (!patterns.length) return '';
    const jsonPatterns = JSON.stringify(patterns);
    return `  const excludePats = ${jsonPatterns};
  for (let i = 0; i < excludePats.length; i++) {
    if (shExpMatch(url, excludePats[i]) || shExpMatch(host, excludePats[i])) {
      return 'DIRECT';
    }
  }
`;
}


function buildGlobalPacData(proxyHost, proxyPort, patterns) {
    const excludeBlock = buildExcludePacPatterns(patterns);
    return `function FindProxyForURL(url, host) {
${excludeBlock}  return 'PROXY ${proxyHost}:${proxyPort}';
}`;
}


function buildUnifiedPacData(globalProxy, rules, patterns) {
    const excludeBlock = buildExcludePacPatterns(patterns);
    const pacRules = rules.map(r => ({
        pattern: r.pattern,
        proxy: `PROXY ${r.proxy.ip}:${r.proxy.port}`,
    }));
    const fallback = globalProxy
        ? `return 'PROXY ${globalProxy.ip}:${globalProxy.port}';`
        : "return 'DIRECT';";

    return `function FindProxyForURL(url, host) {
${excludeBlock}  const rules = ${JSON.stringify(pacRules)};
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (matchDomainPattern(host, r.pattern)) {
      return r.proxy;
    }
  }
  ${fallback}
}

function matchDomainPattern(host, pattern) {
  if (pattern.indexOf('*') >= 0 || pattern.indexOf('?') >= 0) {
    return shExpMatch(host, pattern);
  }
  return host === pattern || dnsDomainIs(host, pattern);
}`;
}


function buildDomainRulesPacData(rules, patterns) {
    return buildUnifiedPacData(null, rules, patterns);
}


function getEnabledDomainRules(rules) {
    return rules.filter(r => r.enabled && r.pattern && r.proxy?.ip && r.proxy?.port);
}


async function applyProxyConfig(withSideFx = false) {
    const {
        proxy_current = '',
        domain_rules = '[]',
        exclude_urls = '',
    } = await chrome.storage.local.get(['proxy_current', 'domain_rules', 'exclude_urls']);

    const globalProxy = readJSON(proxy_current);
    const hasGlobalProxy = !!(globalProxy && globalProxy.ip && globalProxy.port);
    const rules = getEnabledDomainRules(parseDomainRules(domain_rules));
    const patterns = exclude_urls.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    if (!hasGlobalProxy && !rules.length) {
        await chrome.proxy.settings.clear({scope: 'regular'});
        proxyEnabled = false;
        proxyAuthMap = {};
        updateIcon();
        return;
    }

    const authEntries = [];
    if (hasGlobalProxy) authEntries.push(globalProxy);
    authEntries.push(...rules.map(r => r.proxy));

    const needsPac = rules.length > 0 || patterns.some(p => p.includes('/'));
    let config;

    if (needsPac) {
        const pacData = buildUnifiedPacData(
            hasGlobalProxy ? globalProxy : null,
            rules,
            patterns,
        );
        config = {mode: 'pac_script', pacScript: {data: pacData}};
    } else {
        config = {
            mode: 'fixed_servers',
            rules: {
                singleProxy: {host: globalProxy.ip, port: Number(globalProxy.port)},
                bypassList: patterns,
            },
        };
    }

    await chrome.proxy.settings.set({value: config, scope: 'regular'});

    proxyEnabled = true;
    proxyAuthMap = buildAuthMap(authEntries);
    updateIcon();

    if (withSideFx) runSideEffects();
}


async function applyProxy({ip, port, user = '', pass = ''}, withSideFx = true) {
    await chrome.storage.local.set({proxy_current: JSON.stringify({ip, port, user, pass})});
    await applyProxyConfig(withSideFx);
}


async function applyDomainRules(withSideFx = false) {
    await applyProxyConfig(withSideFx);
}


async function reapplyProxyConfig(withSideFx = false) {
    await applyProxyConfig(withSideFx);
}


async function disableProxy() {
    await chrome.storage.local.set({proxy_current: ''});
    await reapplyProxyConfig(true);
}


async function restoreProxy() {
    if (_restored) return;
    _restored = true;
    await reapplyProxyConfig(false);
}


chrome.runtime.onStartup.addListener(restoreProxy);
chrome.runtime.onInstalled.addListener(restoreProxy);
restoreProxy();


chrome.webRequest.onAuthRequired.addListener(details => {
        if (!details.isProxy) return;

        const challenger = details.challenger || {};
        const key = proxyKey({ip: challenger.host, port: challenger.port});
        const creds = proxyAuthMap[key];
        if (creds) {
            return {authCredentials: {username: creds.user, password: creds.pass}};
        }
    }, {urls: ['<all_urls>']}, ['blocking']
);


chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    switch (req.action) {
        case 'get_option': {
            const keys = req.key == null ? Object.keys(defaults) : Array.isArray(req.key) ? req.key : [req.key];

            const defSubset = keys.reduce((o, k) => (o[k] = defaults[k], o), {});
            chrome.storage.local.get(defSubset).then(stored => {
                const out = keys.length === 1
                    ? stored[keys[0]]
                    : keys.reduce((o, k) => (o[k] = stored[k], o), {});
                sendResponse(out);
            });
            return true;
        }

        case 'set_option': {
            chrome.storage.local.set({[req.key]: req.val}).then(async () => {
                sendResponse({status: 'ok'});
                if (req.key === 'exclude_urls' && proxyEnabled) {
                    await reapplyProxyConfig(false);
                }
            });
            return true;
        }

        case 'save_proxylist_from_import': {
            const raw = (req.data || '').trim();

            if (!raw.length) {
                chrome.storage.local.set({proxy_list: ''}).then(() => sendResponse({status: 'ok', saved: 0}));
                return true;
            }

            const list = parseProxyList(raw);
            chrome.storage.local.set({proxy_list: JSON.stringify(list)}).then(() => sendResponse({
                status: 'ok',
                saved: list.length
            }));
            return true;
        }

        case 'save_domain_rules': {
            const rules = Array.isArray(req.data) ? req.data : [];
            chrome.storage.local.set({domain_rules: JSON.stringify(rules)}).then(async () => {
                sendResponse({status: 'ok', saved: rules.length});
                await applyProxyConfig(false);
            });
            return true;
        }

        case 'set_proxy': {
            applyProxy(req.data).then(() => sendResponse({status: 'ok'}));
            return true;
        }

        case 'disable_proxy': {
            disableProxy();
            sendResponse({status: 'ok'});
            return true;
        }

    }
});
