// Cookies --------------------------------------------------------------------
function set_cookie(name, value) {
    return Cookies.set(name, value);
}

function get_cookie(name, default_value) {
    var value = Cookies.get(name);

    if(value !== undefined) {
        return JSON.parse(value);
    }

    return default_value;
}

// Ractive / Settings ---------------------------------------------------------
Ractive.DEBUG = false;

var _default_settings = {
    overlay: {
        open: false,
        tab: 'meta-data',
    },
    log: {
        logger: {},
        level: {
            debug: false,
            info: false,
            warning: true,
            error: true,
            critical: true,
        },
    },
    keyboard_shortcuts: true,
};

function get_default_settings() {
    return JSON.parse(JSON.stringify(_default_settings));
}

var ractive = Ractive({
    target: '#ractive',
    template: '#main',
    data: {
        connected: true,
        dots: [],
        messages: [],
        settings: get_cookie('flamingo_settings', get_default_settings()),
        content: {},
        log: {
            logger: [],
            records: [],
        },
    },
});

ractive.observe('settings', function () {
    set_cookie('flamingo_settings', ractive.get('settings'));
});

ractive.on('reset_settings', function() {
    ractive.set('settings', get_default_settings());

    show_message('<span class="important">Settings reseted</span> ' +
                 'Please reload the browser tab');
});


// RPC ------------------------------------------------------------------------
var rpc_protocol = 'ws://';

if(window.location.protocol == 'https:') {
    rpc_protocol = 'wss://';
}

var rpc = new RPC(rpc_protocol + window.location.host + '/_flamingo/rpc/');
rpc.DEBUG = false;

ractive.on('clear_log', function(event) {
    rpc.call('clear_log', undefined, function(data) {
        ractive.set('log', {
            logger: [],
            records: [],
        });
    });
});

ractive.on('start_shell', function(event) {
    rpc.call('start_shell');
});

// iframe handling ------------------------------------------------------------
var iframe = document.querySelector('iframe#content');

function iframe_onload(iframe) {
    if(rpc._ws.readyState != rpc._ws.OPEN) {
        return;
    }

    // history / address
    history.pushState({}, iframe.contentDocument.title,
                      iframe.contentWindow.location.href);

    // title
    document.title = iframe.contentDocument.title;

    // favicon
    var nodes = iframe.contentDocument.getElementsByTagName('link');
    var icon = document.querySelector("link[rel='shortcut icon']");

    for(var index = 0; index < nodes.length; index++) {
        if((nodes[index].getAttribute('rel') == 'icon') ||
           (nodes[index].getAttribute('rel') == 'shortcut icon')) {

            icon.href = nodes[index].getAttribute('href');

            break;
        }
    }

    // iframe keyboard shortcuts
    iframe.contentDocument.addEventListener('keydown', function(event) {
        handle_keydown(event);
    });

    // close overlay if iframe gets clicked
    iframe.contentDocument.addEventListener('click', function(event) {
        ractive.set('settings.overlay.open', false);
    });

    // iframe meta data
    rpc.call(
        'get_meta_data',
        iframe.contentWindow.location.pathname,
        function(data) {
            ractive.set('content', data);
        }
    );
};

function iframe_set_url(url) {
    if(url === undefined || url == '') {
        url = '/';
    }

    iframe.contentWindow.location = url;
};

function iframe_reload() {
    iframe.contentWindow.location.reload();
};

function iframe_setup() {
    iframe_set_url(document.location.href);

};

window.onpopstate = function(event) {
    iframe_set_url(document.location.href);
};

window.onhashchange = function(event) {
    iframe_set_url(document.location.href);
};

// messages -------------------------------------------------------------------
var message_id = 1;

function hide_message(id) {
    var messages = ractive.get('messages');

    for(var index in messages) {
        if(messages[index].id == id) {
            messages.splice(index, 1);
            ractive.set('messages', messages);

            return;
        }
    }
}

function show_message(message, timeout) {
    var messages = ractive.get('messages');

    for(var index in messages) {
        if(messages[index].message == message) {
            return;
        }
    }

    var id = message_id;
    message_id = id + 1;

    messages.push({
        id: id,
        message: message,
    });

    ractive.set('messages', messages);

    if(timeout != undefined) {
        setTimeout(function() {
            hide_message(id);
        }, timeout);

    }

    return id;
}

ractive.on({
    hide_message: function(event, id) {
        hide_message(id);
    },
});

// Keyboard Shortcuts ---------------------------------------------------------
function handle_keydown(event) {
    // ESC
    if(event.keyCode == 27) {
        ractive.fire('toggle_overlay');

        return;
    }

    if(!ractive.get('settings.overlay.open')) {
        return;
    }

    switch(event.keyCode) {
        case 49:  // 1
            ractive.set('settings.overlay.tab', 'meta-data');
            break;

        case 50:  // 2
            ractive.set('settings.overlay.tab', 'template-context');
            break;

        case 51:  // 3
            ractive.set('settings.overlay.tab', 'project-settings');
            break;

        case 52:  // 4
            ractive.set('settings.overlay.tab', 'log');
            break;
    }
}

document.addEventListener('keydown', function(event) {
    if(!ractive.get('settings.keyboard_shortcuts')) {
        return;
    }

    handle_keydown(event);
});

ractive.on('toggle_overlay', function(event) {
    ractive.set('settings.overlay.open',
                !ractive.get('settings.overlay.open'));
});

// Logging --------------------------------------------------------------------
var stylesheet = document.styleSheets[document.styleSheets.length-1];
var rule_id = stylesheet.rules.length;

stylesheet.insertRule('@media all {}', rule_id);

function generate_logging_stylesheet(settings) {
    if(settings === undefined) {
        var settings = ractive.get('settings.log');
    }

    var logger = ractive.get('log.logger');
    var rule = '@media all {';

    // logger
    for(var name in logger) {
        if(!settings.logger[name]) {
            rule += '.log .records .' + logger[name] + ' {display: none} ';
        }
    }

    // level
    for(var key in settings.level) {
        if(!settings.level[key]) {
            rule += '.log .records .' + key + ' {display: none} ';
        }
    }

    rule += '}';

    stylesheet.removeRule(rule_id);
    stylesheet.insertRule(rule, rule_id);
}

function add_logger(logger) {
    var settings = ractive.get('settings.log.logger');

    for(var name in logger) {
        if(name in settings) {
            continue;
        }

        settings[name] = name.startsWith('flamingo');
    }

    ractive.set('settings.log.logger', settings);
}

function log_scroll_to_top() {
    document.querySelector('.log .records').scrollTo(0, 0);
}

function log_scroll_to_bottom() {
    document.querySelector('.log .records .scroll-anchor').scrollIntoView();
}

ractive.observe('settings.log', function(settings) {
    generate_logging_stylesheet(settings);
});

ractive.on({
    log_scroll_to_top: function() {
        log_scroll_to_top();
    },
    log_scroll_to_bottom: function() {
        log_scroll_to_bottom();
    },
});

// Connection Handling --------------------------------------------------------
rpc.on('close', function(rpc) {
    ractive.set('connected', false);

    setTimeout(function() {
        var dots = ractive.get('dots');
        dots.push('.');

        if(dots.length >= 4) {
            dots = [];
        }

        ractive.set('dots', dots);

        rpc.connect();
    }, 1000);
});

rpc.on('open', function(rpc) {
    iframe_setup();
    ractive.set('connected', true);

    // subscribe to rpc topics
    rpc.subscribe('status', function(data) {
        var pathname = iframe.contentWindow.location.pathname;

        if(data.changed_paths.includes(pathname) ||
           data.changed_paths.includes('*')) {

            iframe_reload();
        }
    });

    rpc.subscribe('messages', function(data) {
        show_message(data, 2000);
    });

    // setup logging
    rpc._topic_handler.log = function(data) {
        var log = ractive.get('log')

        log.logger = data.logger;
        add_logger(data.logger);

        log.records = log.records.concat(data.records);
        log.records = log.records.slice(-2500);

        ractive.set('log', log);
    };

    rpc.call('setup_log', undefined, function(data) {
        add_logger(data.logger);
        ractive.set('log', data);
        generate_logging_stylesheet();
    });
});

rpc.connect();