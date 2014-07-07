var { window, document } = instrumenter.target;

module.exports = {
  callableEchoMethod: function(param) {
    return param;
  },
  onGlobalCreated: function() {
    console.log("GLOBAL CREATED", instrumenter.target.window.wrappedJSObject.location);
    instrumenter.emit("tab_load", {});
    initInstrumentation();
  },
  onGlobalDestroyed: function() {
    console.log("GLOBAL DESTROYED");
  },
  onEvent: function(name, data) {
    switch (name) {
    case "ember-devtool-event":
        onEmberInspectorMessage(data);
        break;
    }
  },
  onUnload: function() {
    console.log("UNLOAD");
    cleanupOnDetach();
  }
};

function initInstrumentationDISABLED() {
  var res = instrumenter.target.evaluate(instrumenter.options.inPageScript);
  instrumenter.emit("inpagescript-injected", res);
}

function initInstrumentation() {
  // let ember-debug know that content script has executed
  if (document.documentElement || document.readyState == "complete") {
  console.log("EXECUTING EMBER DEBUG BRIDGE on: ",
              document.defaultView.location.toString());

    window.addEventListener("message", onEmberVersion, true);
    document.addEventListener("ember-debug-send", onEmberDebugEvent, false);

    injectInPageScript();

    document.documentElement.dataset.emberExtension = 1;

    // Allow older versions of Ember (< 1.4) to detect the extension.
    if (document.body) {
      document.body.dataset.emberExtension = 1;
    }
  } else {
    window.setTimeout(initInstrumentation, 200);
  }
}

function cleanupOnDetach() {
  try {
    window.removeEventListener("message", onEmberVersion, true);
  } catch(e) {}
  try {
    document.removeEventListener("ember-debug-send", onEmberDebugEvent, false);
  } catch(e) {}
}

function onEmberVersion(message) {
  var data = message.wrappedJSObject.data;
  if (data && data.type === "emberVersion") {
    instrumenter.emit("ember-version", data);
  }
}

function injectInPageScript() {
  instrumenter.target.evaluate(instrumenter.options.inPageScript);
  instrumenter.target.evaluate(instrumenter.options.emberDebugScript);
}

function onEmberInspectorMessage(message) {
  let event = document.createEvent("CustomEvent");

  // FIX: needed to fix permission denied exception on Firefox >= 30
  // - https://github.com/emberjs/ember-inspector/issues/147
  // - https://blog.mozilla.org/addons/2014/04/10/changes-to-unsafewindow-for-the-add-on-sdk/
  try {
    message = cloneInto(message, document.defaultView);
  } catch(e) {
    message = JSON.stringify(message);
  }

  event.initCustomEvent("ember-debug-receive", true, true, message);
  document.documentElement.dispatchEvent(event);
}

function onEmberDebugEvent(event) {
  instrumenter.emit("ember_message", event.detail);
}
