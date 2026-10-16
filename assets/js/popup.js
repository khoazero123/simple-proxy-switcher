function i18n() {
    const html = document.documentElement;
    html.innerHTML = html.innerHTML.replace(/__MSG_(\w+)__/g, (_, key) =>
        chrome.i18n.getMessage(key) || ''
    );

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const msg = chrome.i18n.getMessage(key);
        if (!msg) return;

        if (el instanceof HTMLInputElement) {
            if (el.placeholder) el.placeholder = msg;
            else if (el.value) el.value = msg;
        } else if (el instanceof HTMLOptionElement) {
            el.textContent = msg;
        } else {
            el.innerHTML = msg;
        }
    });
}


function refresh_tooltip() {
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(tooltip => new bootstrap.Tooltip(tooltip, {
        animation: false,
        customClass: 'custom-tooltip',
    }));
}


function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


function proxyScheme(p) {
    return (p && p.scheme) || 'http';
}


function proxyLabel(p) {
    const auth = p.user && p.pass ? `${p.user}:${p.pass}@` : '';
    const prefix = proxyScheme(p) === 'http' ? '' : `${proxyScheme(p)}://`;
    return `${prefix}${auth}${p.ip}:${p.port}`;
}


function proxyValue(p) {
    return JSON.stringify({
        ip: p.ip,
        port: p.port,
        user: p.user || '',
        pass: p.pass || '',
        scheme: proxyScheme(p),
    });
}


function parseProxyList(raw) {
    try {
        const list = JSON.parse(raw || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}


function parseDomainRules(raw) {
    try {
        const list = JSON.parse(raw || '[]');
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}


function proxiesEqual(a, b) {
    return a && b
        && a.ip === b.ip
        && String(a.port) === String(b.port)
        && (a.user || '') === (b.user || '')
        && (a.pass || '') === (b.pass || '')
        && proxyScheme(a) === proxyScheme(b);
}


function validateDomainPattern(pattern) {
    const value = pattern.trim();
    if (!value) return false;
    if (value.includes('://') || value.includes('/')) return false;
    return /^[\w.*?-]+(\.[\w.*?-]+)*$/.test(value);
}


function matchDomainPattern(host, pattern) {
    if (!host || !pattern) return false;
    if (pattern.includes('*') || pattern.includes('?')) {
        const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return re.test(host);
    }
    return host === pattern || host.endsWith('.' + pattern);
}


function findMatchingRule(host, rules) {
    for (const rule of rules) {
        if (rule.enabled && rule.pattern && matchDomainPattern(host, rule.pattern)) {
            return rule;
        }
    }
    return null;
}


async function getActiveTabHost() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.url) return '';
    try {
        const {hostname, protocol} = new URL(tab.url);
        if (!hostname || protocol === 'chrome:' || protocol === 'chrome-extension:') return '';
        return hostname;
    } catch {
        return '';
    }
}


function getEffectiveProxy(globalProxy, host) {
    const matched = findMatchingRule(host, domainRules);
    if (matched?.proxy) return matched.proxy;
    if (globalProxy) return globalProxy;
    return null;
}


let domainRules = [];
let proxyList = [];


async function loadDomainRules() {
    const raw = await chrome.runtime.sendMessage({action: 'get_option', key: 'domain_rules'});
    domainRules = parseDomainRules(raw);
}


async function saveDomainRules() {
    await chrome.runtime.sendMessage({action: 'save_domain_rules', data: domainRules});
}


function populateProxySelect($select, selectedProxy = null) {
    const placeholder = chrome.i18n.getMessage('TEXT_DOMAIN_PROXY_SELECT') || 'Select proxy';
    $select.empty().append(`<option value="">${escapeHtml(placeholder)}</option>`);

    proxyList.forEach(p => {
        const value = proxyValue(p);
        const selected = selectedProxy && proxiesEqual(p, selectedProxy) ? ' selected' : '';
        $select.append(`<option value="${escapeHtml(value)}"${selected}>${escapeHtml(proxyLabel(p))}</option>`);
    });
}


function renderDomainRules(activeHost = '', effectiveProxy = null, globalProxy = null) {
    const tbody = $('table.domain_rules tbody').empty();
    populateProxySelect($('#rule_proxy'));

    if (!domainRules.length) {
        tbody.append(`<tr><td colspan="5" class="text-center text-body-secondary">${escapeHtml(chrome.i18n.getMessage('TEXT_DOMAIN_RULES_EMPTY') || 'No rules')}</td></tr>`);
        return;
    }

    domainRules.forEach(rule => {
        const proxy = rule.proxy || {};
        const note = escapeHtml(rule.note || '');
        const pattern = escapeHtml(rule.pattern || '');
        const emoji = rule.enabled ? '✅' : '⚪';
        const statusCell = rule.enabled
            ? `<a href="#" class="text-decoration-none rule_current">${emoji}</a>`
            : `<a href="#" class="text-decoration-none rule_select">${emoji}</a>`;

        tbody.append(`
        <tr data-rule-id="${escapeHtml(rule.id)}">
            <td class="py-0 px-1 align-middle${rule.enabled ? '' : ' text-secondary'}">
                ${statusCell}
            </td>
            <td class="p-0">
                <input class="font-monospace form-control form-control-sm rule_pattern" value="${pattern}">
            </td>
            <td class="p-0">
                <select class="font-monospace form-select form-select-sm rule_proxy"></select>
            </td>
            <td class="p-0">
                <input class="form-control form-control-sm rule_note" value="${note}">
            </td>
            <td class="py-0 px-1 align-middle text-center">
                <button type="button" class="btn btn-outline-danger btn-sm deleteDomainRule" title="${escapeHtml(chrome.i18n.getMessage('TEXT_BTN_DELETE') || 'Delete')}">&times;</button>
            </td>
        </tr>
        `);

        populateProxySelect(tbody.find(`tr[data-rule-id="${rule.id}"] .rule_proxy`), proxy);
    });
}


function findRuleIndex(ruleId) {
    return domainRules.findIndex(r => r.id === ruleId);
}


function readRuleFromRow($tr) {
    const ruleId = $tr.data('rule-id');
    const idx = findRuleIndex(ruleId);

    let proxy;
    try {
        proxy = JSON.parse($tr.find('.rule_proxy').val());
    } catch {
        proxy = null;
    }

    return {
        pattern: $tr.find('.rule_pattern').val().trim(),
        proxy,
        note: $tr.find('.rule_note').val().trim(),
        enabled: idx === -1 ? false : domainRules[idx].enabled,
    };
}


function showRuleError(message) {
    window.alert(message);
}


async function createTableProxy() {
    const {proxy_list = '[]', proxy_current = ''} = await chrome.runtime.sendMessage({
        action: 'get_option',
        key: ['proxy_list', 'proxy_current'],
    });

    proxyList = parseProxyList(proxy_list);
    await loadDomainRules();

    let current;
    try {
        current = proxy_current ? JSON.parse(proxy_current) : null;
    } catch {
        current = null;
    }

    const activeHost = await getActiveTabHost();
    const effectiveProxy = getEffectiveProxy(current, activeHost);

    const tbody = $('table.proxy_list tbody').empty();

    $('[name="import_proxy"]').val(
        proxyList.flatMap(p => [
            ...(p.commentBefore ? [`# ${p.commentBefore}`] : []),
            `${proxyScheme(p) === 'http' ? '' : `${proxyScheme(p)}://`}${p.user && p.pass ? `${p.user}:${p.pass}@` : ''}${p.ip}:${p.port}` + (p.commentAfter ? ` # ${p.commentAfter}` : '')
        ]).join('\n')
    );

    $('button.resetProxy')[current ? 'removeClass' : 'addClass']('d-none');

    const socksAuthEntries = proxyList.filter(p => proxyScheme(p).startsWith('socks') && p.user && p.pass);
    $('#socks_auth_warning')[socksAuthEntries.length ? 'removeClass' : 'addClass']('d-none');

    if (!proxyList.length) {
        setTimeout(() => $('#nav-import-tab').tab('show'), 250);
        renderDomainRules(activeHost, effectiveProxy, current);
        return;
    }

    proxyList.forEach(p => {
        const isGlobalCurrent = current && proxiesEqual(current, p);
        const isEffective = effectiveProxy && proxiesEqual(effectiveProxy, p);
        const emoji = isEffective ? '✅' : '⚪';
        const after = p.commentAfter ?? '';
        const statusCell = isGlobalCurrent
            ? `<a href="#" class="text-decoration-none proxy_current">${emoji}</a>`
            : isEffective
                ? `<span>${emoji}</span>`
                : `<a href="#" class="text-decoration-none proxy_select">${emoji}</a>`;

        if (p.commentBefore) {
            tbody.append(`<tr><td></td><td colspan="6" class="p-0 px-1">${p.commentBefore}</td></tr>`);
        }

        const scheme = proxyScheme(p);
        const schemeCellClass = scheme.startsWith('socks') && p.user && p.pass
            ? ' i_scheme text-warning fw-bold'
            : ' i_scheme';
        const schemeTitle = scheme.startsWith('socks') && p.user && p.pass
            ? ` title="${escapeHtml(chrome.i18n.getMessage('TEXT_SOCKS_AUTH_WARNING') || '')}" data-bs-toggle="tooltip"`
            : '';

        tbody.append(`
        <tr>
            <td class="py-0 px-1 align-middle${isEffective ? '' : ' text-secondary'}">
                ${statusCell}
            </td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm${schemeCellClass}" value="${escapeHtml(scheme)}"${schemeTitle} readonly></td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm i_ip"   value="${p.ip}" readonly></td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm i_port" value="${p.port}" readonly></td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm i_user" value="${p.user}" readonly></td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm i_pass" value="${p.pass}" readonly></td>
            <td class="p-0"><input class="font-monospace form-control form-control-sm" value="${after}" data-bs-toggle="tooltip" data-bs-placement="left" title="${after}" readonly></td>
        </tr>
        `);
    });

    refresh_tooltip();
    renderDomainRules(activeHost, effectiveProxy, current);
}


$(async function () {
    i18n();
    refresh_tooltip();

    $("body")
        .on('click', 'a#copyright_link', function () {
            chrome.tabs.create({url: $(this).attr('href')});
            return false;
        })
        .on('click', '.saveProxy', async function () {
            await chrome.runtime.sendMessage({
                action: 'save_proxylist_from_import',
                data: $('[name="import_proxy"]').val().trim(),
            });

            await createTableProxy();

            $('#nav-list-tab').tab('show');
        })
        .on('click', '.proxy_list a.proxy_select', async function (e) {
            e.preventDefault();

            const $tr = $(this).closest('tr');

            const result = await chrome.runtime.sendMessage({
                action: 'set_proxy',
                data: {
                    ip: $tr.find('.i_ip').val().trim(),
                    port: $tr.find('.i_port').val().trim(),
                    user: $tr.find('.i_user').val().trim(),
                    pass: $tr.find('.i_pass').val().trim(),
                    scheme: $tr.find('.i_scheme').val().trim(),
                },
            });
            if (result?.status === 'error') showRuleError(result.message);

            await createTableProxy();
        })
        .on('click', '.proxy_list a.proxy_current, button.resetProxy', async function (e) {
            e.preventDefault();

            await chrome.runtime.sendMessage({action: 'disable_proxy'});

            await createTableProxy();
        })
        .on('click', '.addDomainRule', async function () {
            const pattern = $('#rule_pattern').val().trim();
            let proxy;
            try {
                proxy = JSON.parse($('#rule_proxy').val());
            } catch {
                proxy = null;
            }

            if (!validateDomainPattern(pattern)) {
                showRuleError(chrome.i18n.getMessage('TEXT_DOMAIN_PATTERN_INVALID') || 'Invalid domain pattern');
                return;
            }

            if (!proxy?.ip || !proxy?.port) {
                showRuleError(chrome.i18n.getMessage('TEXT_DOMAIN_PROXY_REQUIRED') || 'Select a proxy');
                return;
            }

            if (!proxyList.some(p => proxiesEqual(p, proxy))) {
                showRuleError(chrome.i18n.getMessage('TEXT_DOMAIN_PROXY_REQUIRED') || 'Select a proxy');
                return;
            }

            domainRules.push({
                id: crypto.randomUUID(),
                pattern,
                proxy,
                note: $('#rule_note').val().trim(),
                enabled: true,
            });

            await saveDomainRules();
            $('#rule_pattern').val('');
            $('#rule_proxy').val('');
            $('#rule_note').val('');
            await createTableProxy();
        })
        .on('click', '.domain_rules a.rule_select', async function (e) {
            e.preventDefault();

            const ruleId = $(this).closest('tr').data('rule-id');
            const idx = findRuleIndex(ruleId);
            if (idx === -1) return;

            domainRules[idx].enabled = true;
            await saveDomainRules();
            await createTableProxy();
        })
        .on('click', '.domain_rules a.rule_current', async function (e) {
            e.preventDefault();

            const ruleId = $(this).closest('tr').data('rule-id');
            const idx = findRuleIndex(ruleId);
            if (idx === -1) return;

            domainRules[idx].enabled = false;
            await saveDomainRules();
            await createTableProxy();
        })
        .on('change', '.domain_rules .rule_pattern, .domain_rules .rule_proxy, .domain_rules .rule_note', async function () {
            const $tr = $(this).closest('tr');
            const ruleId = $tr.data('rule-id');
            const idx = findRuleIndex(ruleId);
            if (idx === -1) return;

            const updated = readRuleFromRow($tr);

            if (!validateDomainPattern(updated.pattern)) {
                showRuleError(chrome.i18n.getMessage('TEXT_DOMAIN_PATTERN_INVALID') || 'Invalid domain pattern');
                await createTableProxy();
                return;
            }

            if (!updated.proxy?.ip || !updated.proxy?.port) {
                showRuleError(chrome.i18n.getMessage('TEXT_DOMAIN_PROXY_REQUIRED') || 'Select a proxy');
                await createTableProxy();
                return;
            }

            domainRules[idx] = {...domainRules[idx], ...updated};
            await saveDomainRules();
            await createTableProxy();
        })
        .on('click', '.deleteDomainRule', async function () {
            const ruleId = $(this).closest('tr').data('rule-id');
            domainRules = domainRules.filter(r => r.id !== ruleId);
            await saveDomainRules();
            await createTableProxy();
        });


    const stored = await chrome.runtime.sendMessage({action: 'get_option'});

    const optionKeys = ['reload_current_tab', 'reload_other_tabs', 'remove_cookies', 'remove_cache'];
    optionKeys.forEach(key => {
        $('#' + key).prop('checked', !!stored[key]).on('change', function () {
            chrome.runtime.sendMessage({action: 'set_option', key: this.id, val: this.checked});
        });
    });

    $('#exclude_urls').val(stored.exclude_urls || '').on('change', function () {
        chrome.runtime.sendMessage({action: 'set_option', key: 'exclude_urls', val: this.value.trim(),});
    });

    $('#default_scheme').val(stored.default_scheme || 'http').on('change', function () {
        chrome.runtime.sendMessage({action: 'set_option', key: 'default_scheme', val: this.value});
    });


    await createTableProxy();
    document.body.style.display = '';
});
