console.debug("EXECUTING EMBER DEBUG BRIDGE on: ",
            document.defaultView.location.toString());

window.addEventListener("message", onEmberVersion, true);
document.addEventListener("ember-debug-send", onEmberDebugEvent, false);
self.port.on("emberDevTool", onEmberInspectorMessage);

// NOTE: needed to cleanup on Firefox 27
self.on("detach", cleanupOnDetach);
// NOTE: needed to cleanup on Firefox 29
self.port.on("detach", cleanupOnDetach);

injectInPageScript();

function cleanupOnDetach() {
  try {
    window.removeEventListener("message", onEmberVersion, true);
  } catch(e) {}
  try {
    document.removeEventListener("ember-debug-send", onEmberDebugEvent, false);
  } catch(e) {}
  try {
    self.port.removeListener("emberDevTool", onEmberInspectorMessage);
  } catch(e) {}
}

function onEmberVersion(message) {
  var data = message.wrappedJSObject.data;
  if (data && data.type === "emberVersion") {
    self.port.emit("emberVersion", data);
  }
}

function injectInPageScript() {
  if (window.document.readyState == "complete") {
    // inject JS into the page to check for an app on domready
    var script = document.createElement('script');
    script.type = "text/javascript";
    script.src = self.options.inPageScriptURL;
    if (document.body) document.body.appendChild(script);
  } else {
    setTimeout(injectInPageScript, 100);
  }
}

function onEmberInspectorMessage(message) {
  console.debug("content-script: ember debug receive", message);

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
  console.debug("content-script: ember debug send", event.detail);

  self.port.emit("emberDebug", event.detail);
}


// let ember-debug know that content script has executed
document.documentElement.dataset.emberExtension = 1;

// Allow older versions of Ember (< 1.4) to detect the extension.
if (document.body) {
  document.body.dataset.emberExtension = 1;
}
