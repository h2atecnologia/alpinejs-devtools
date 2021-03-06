/**
* Loose port of Lodash#set with "." as the delimiter, see https://lodash.com/docs#set
*
* @param {object} object - object to update
* @param {string} path - path to set in the form `a.0.b.c`
* @param {any} value - value to set to
*/
function set(object, path, value) {
    const [nextProperty, ...rest] = path.split('.');
    if (rest.length === 0) {
        object[nextProperty] = value;
        return object;
    }
    set(object[nextProperty], rest.join('.'), value);
    return object
}

window.addEventListener("message", handshake);
window.__alpineDevtool = {};

function handshake(e) {
    if (e.data.source === "alpine-devtools-proxy" && e.data.payload === "init") {
        window.removeEventListener("message", handshake);
        window.addEventListener("message", handleMessages);

        discoverComponents();

        document.querySelectorAll("[x-data]").forEach((el) => observeNode(el));
    }
}

function handleMessages(e) {
    if (e.data.source === "alpine-devtools-proxy") {
        window.__alpineDevtool.stopMutationObserver = true;

        if (e.data.payload.action == "hover") {
            Alpine.discoverComponents((component) => {
                if (
                    component.__alpineDevtool &&
                    component.__alpineDevtool.id == e.data.payload.componentId
                ) {
                    component.__alpineDevtool.backgroundColor =
                        component.__x.$el.style.backgroundColor;
                    component.__x.$el.style.backgroundColor = "rgba(104, 182, 255, 0.35)";
                }
                setTimeout(() => {
                    window.__alpineDevtool.stopMutationObserver = false;
                }, 10);
            });
        }

        if (e.data.payload.action == "hoverLeft") {
            window.__alpineDevtool.stopMutationObserver = true;

            Alpine.discoverComponents((component) => {
                if (
                    component.__alpineDevtool &&
                    component.__alpineDevtool.id === e.data.payload.componentId
                ) {
                    component.__x.$el.style.backgroundColor =
                        component.__alpineDevtool.backgroundColor;
                }
            });
            setTimeout(() => {
                window.__alpineDevtool.stopMutationObserver = false;
            }, 10);
        }

        if (e.data.payload.action == "editAttribute") {
            Alpine.discoverComponents((component) => {
                if (component.__alpineDevtool.id == e.data.payload.componentId) {
                    const data = component.__x.getUnobservedData();
                    const { attributeSequence, attributeValue } = e.data.payload;

                    // nested path descriptor, eg. array.0.property needs to update array[0].property
                    if (attributeSequence.includes(".")) {
                        set(data, attributeSequence, attributeValue);
                    } else {
                        data[attributeSequence] = attributeValue;
                    }

                    component.__x.$el.setAttribute("x-data", JSON.stringify(data));
                }
                setTimeout(() => {
                    window.__alpineDevtool.stopMutationObserver = false;
                }, 10);
            });
        }
    }
}

// See https://github.com/Te7a-Houdini/alpinejs-devtools/issues/28#issuecomment-616719252
function getComponentName(element) {
    if (element.id) {
        return element.id
    }
    const nameAttr = element.getAttribute('name');
    if (nameAttr) {
        return nameAttr
    }
    const xDataAttr = element.getAttribute('x-data').trim();
    // match `x-data="someFunctionName()"` but not `x-data="{ hello: 'world' }"`
    if (xDataAttr.endsWith(")") && !xDataAttr.startsWith("{")) {
        return xDataAttr.split('(')[0]
    }
    const roleAttr = element.getAttribute('role');
    if (roleAttr) {
        return roleAttr;
    }

    return element.tagName;
}

function discoverComponents(isThroughMutation = false) {
    var rootEls = document.querySelectorAll("[x-data]");

    var components = [];

    rootEls.forEach((rootEl, index) => {
        Alpine.initializeComponent(rootEl);

        if (!rootEl.__alpineDevtool) {
            rootEl.__alpineDevtool = {};
        }

        if (!isThroughMutation) {
            rootEl.__alpineDevtool.id = Math.floor(Math.random() * 100000 + 1);
        }

        var depth = 0;

        if (index != 0) {
            rootEls.forEach((innerElement, innerIndex) => {
                if (index == innerIndex) {
                    return false;
                }

                if (innerElement.contains(rootEl)) {
                    depth = depth + 1;
                }
            });
        }

        const data = Object.entries(rootEl.__x.getUnobservedData()).reduce((acc, [key, value]) => {
            const type = typeof value;
            acc[key] = {
                value: type === "function" ? "function" : value,
                type
            }
            return acc;
        }, {})

        components.push({
            name: getComponentName(rootEl),
            depth: depth,
            data: data,
            index: index,
            id: rootEl.__alpineDevtool.id,
        });
    });

    window.postMessage(
        {
            source: "alpine-devtools-backend",
            payload: {
                // stringify to unfurl proxies
                // there's no way to detect proxies but
                // we need to get rid of them
                // this avoids `DataCloneError: The object could not be cloned.`
                // see https://github.com/Te7a-Houdini/alpinejs-devtools/issues/17
                components: JSON.stringify(components),
                type: "render-components",
                isThroughMutation: isThroughMutation,
            },
        },
        "*"
    );
}

function observeNode(node) {
    const observerOptions = {
        childList: true,
        attributes: true,
        subtree: true,
    };

    const observer = new MutationObserver((mutations) => {
        if (!window.__alpineDevtool.stopMutationObserver) {
            discoverComponents((isThroughMutation = true));
        }
    });

    observer.observe(node, observerOptions);
}
