const { Class } = require("sdk/core/heritage");

const self = require("sdk/self");

const tabs = require("./tomster-tabs");

const log = console.log.bind(console, "ember-extension: ");
const logError = console.error.bind(console, "ember-extension: ");

const { openDevTool, inspectDOMElement,
        evaluateFileOnTargetWindow }  = require("./devtools-utils");

var Promise = require("sdk/core/promise.js");

exports.openEmberInspector = function () {
  openDevTool(exports.devtoolTabDefinition.id);
};

exports.devtoolTabDefinition = {
  id: "ember-inspector",
  ordinal: 7,
  icon: self.data.url("images/icon19.png"),
  url: self.data.url("devtool-panel.html"),
  label: "Ember",
  tooltip: "Ember Inspector",

  isTargetSupported: function(target) {
    return target.isLocalTab;
  },

  build: function(iframeWindow, toolbox) {
    // init devtool tab
    var emberInspector = new EmberInspector(iframeWindow, toolbox);
    return Promise.resolve(emberInspector);
  }
};

let RemoteEmberInspector = Class({
  initialize: function (iframeWindow, toolbox) {
    this._toolbox = toolbox;
    this._initRemoteInstrumenter(iframeWindow, toolbox);
    this._initDevtoolPanel(iframeWindow);

    return this;
  },
  destroy: function () {
    this._destroyDevtoolPanel();
    this._destroyRemoteInstrumenter();
  },

  _initDevtoolPanel: function(iframeWindow) {
    this.iframeParent = iframeWindow;
    this.iframeWindow = iframeWindow.document.querySelector("iframe");
    this._handleDevtoolPanelMessage = this._handleDevtoolPanelMessage.bind(this);
    this.iframeParent.addEventListener("message", this._handleDevtoolPanelMessage, false);
  },

  _destroyDevtoolPanel: function() {
    this.iframeParent.removeEventListener("message", this._handleDevtoolPanelMessage, false);
  },

  _initRemoteInstrumenter: function(iframeWindow, toolbox) {
    // 1. create a remote instrumenter
    this._director = new DirectorFront(toolbox._target.client,
                                     toolbox._target.form);
    this._instrumenter = director.
            install("ember-inspector",
                    self.data.read('instrumenter-script.js'),
                    {});
    // 2. register remote events (target tab load, target tab message)
    this._handleInstrumenterEvent = this._handleInstrumenterEvent.bind(this);
    this._instrumenter.on("instrumenter-event",
                          this._handleInstrumenterEvent);
  },

  _destroyRemoteInstrumenter: function() {
    // unregister remote events handlers
    this._instrumenter.off("instrumenter-event",
                           this._handleInstrumenterEvent);
    this._director.uninstall("ember-inspector");
    delete this._instrumenter;
    delete this._director;
  },

  _handleInstrumenterEvent: function(evt) {
    if ("tab_load" in evt) {
      this._handleTargetTabLoad();
    }

    if ("ember_message" in evt) {
      this._handleTargetTabMessage(evt.ember_message);
    }
  },

  _handleTargetTabLoad: function() {
    // reload devtool panel
    this.iframeWindow.contentWindow.location.reload(true);
  },

  _handleTargetTabMessage: function(msg) {
    // handle dom inspection requests
    // route message to the devtool panel
    if (msg.type === "view:devtools:inspectDOMElement") {
      inspectDOMElement(this.toolbox._target, msg.elementSelector,
                        exports.devtoolTabDefinition.id);
    } else {
      // route to devtool panel
      this.iframeWindow.contentWindow.postMessage(msg, "*");
    }
  },

  _sendToTargetTab: function(msg) {
     this._instrumenter.sendEvent("ember-devtool-event", msg);
  }
});

let EmberInspector = Class({
  initialize: function (iframeWindow, toolbox) {
    log("initialize");
    this.targetTabWorker = null;
    this.iframeParent = iframeWindow;
    this.iframeWindow = iframeWindow.document.querySelector("iframe");
    this.toolbox = toolbox;

    log("EMBER EXTENSION TARGET", toolbox._target);

    // attach devtool panel messages (from devtool panel)
    this._onDevtoolPanelMessage = this._handleDevtoolPanelMessage.bind(this);
    this.iframeParent.addEventListener("message",
                                       this._onDevtoolPanelMessage,
                                       false);

    // attach ember debug messages (from inspected tab)
    this._onEmberDebugMessage = this._handleTargetTabMessage.bind(this);
    tabs.on("emberDebug", this._onEmberDebugMessage);

    // attach inspected tab navigation & reload
    this._onTargetTabLoad = this._handleTargetTabLoad.bind(this);
    tabs.on("emberAttach", this._onTargetTabLoad);

    // start devtool panel
    this._onTargetTabLoad({id: tabs.activeTab.id, url: tabs.activeTab.url});

    return this;
  },

  destroy: function () {
    log("destroy");
    tabs.removeListener("emberAttach", this._onTargetTabLoad);
    tabs.removeListener("emberDebug", this._onEmberDebugMessage);
    this.iframeParent.removeEventListener("message",
                                          this._onDevtoolPanelMessage,
                                          false);
  },


  _handleTargetTabLoad: function({ id: tabId }) {
    // handle on reloads on the current activeTab
    if (tabs.activeTab.id !== tabId) {
      return null;
    }

    log("_handleTargetTabLoad", tabId);

    // inject ember_debug.js in the target tag
    // and reload the devtool panel
    return evaluateFileOnTargetWindow(this.toolbox._target,
                                    "ember_debug/ember_debug.js").
      then(
        log("ember debug injected"),
        logError("error injecting ember debug")
      ).
      then(() => {
        log("reloading devtool panel");
        this.iframeWindow.contentWindow.location.reload(true);
      });
  },

  _handleDevtoolPanelMessage: function(msg) {
    log("_handleDevtoolPanelMessage", msg);
    if (msg.origin === "resource://ember-inspector-at-emberjs-dot-com") {
      this._sendToTargetTab(msg.data);
    } else {
      logError("_handleDevtoolPanelMessage INVALID ORIGIN", msg);
    }
  },

  _handleTargetTabMessage: function({ id: tabId, url: tabUrl, data: msg }) {
    if (tabs.activeTab.id !== tabId) {
      return;
    }

    log("_handleTargetTabMessage", msg);

    if (msg.type === "view:devtools:inspectDOMElement") {
      // polyfill missing inspect function in content-script
      inspectDOMElement(this.toolbox._target, msg.elementSelector,
                        exports.devtoolTabDefinition.id);
    } else {
      // route to devtool panel
      this.iframeWindow.contentWindow.postMessage(msg, "*");
    }
  },

  _sendToTargetTab: function(msg) {
    log("_sendToTargetTab", msg);

    // define message queue if it's not defined
    this.mqTargetTab = this.mqTargetTab || [];

    if (msg) {
      // push message in the queue if any
      this.mqTargetTab.push(msg);
    }

    var worker = tabs.getWorkerByTabId(tabs.activeTab.id);

    if (worker) {
      // drain message queue
      let nextMsg;
      while ((nextMsg = this.mqTargetTab.shift())) {
        worker.port.emit("emberDevTool", nextMsg);
      }
    }
  }
});
