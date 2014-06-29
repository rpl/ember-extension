const { data, version } = require("sdk/self");

const { openEmberInspector } = require("./tomster-devtool-panel");

const tabs = require("./tomster-tabs");

const { UrlbarButton } = require("urlbarbutton");

const { Panel } = require("sdk/panel");

const TOMSTER_BUTTON_ID = "ember-inspector-toolbarbutton";

let button, panel;

exports.enable = enable;
exports.disable = disable;

function enable() {
  // NOTE: non-blocking exception on disable/re-enable addon:
  // System JS : ERROR resource://gre/modules/commonjs/toolkit/loader.js ->
  //                   resource://gre/modules/commonjs/sdk/system/events.js:50 -
  //             TypeError: can't access dead object

  // create tomster locationbar button and its attached panel
  panel = createPanel();

  button = UrlbarButton({
    id: TOMSTER_BUTTON_ID,
    image : data.url("images/icon19.png"),
    panel: panel,
    tooltip : 'Ember Inspector',
  });

  // register tomster-tabs events

  tabs.on('open', hidePanel);

  ['activate', 'ready', 'emberVersion'].forEach( (event) => {
    tabs.on(event, refreshButton);
  });
}

function disable() {
  try {
    // try to unregister anchor widget from australis customizable ui jsm
    let { Cu } = require("chrome");
    Cu.import("resource://app/modules/CustomizableUI.jsm");
    CustomizableUI.removeWidgetFromArea(TOMSTER_BUTTON_ID);
    CustomizableUI.destroyWidget(TOMSTER_BUTTON_ID);
  } catch(e) {
    // don't fail on previous version but prevents silent errors
    console.error(e);
  }

  tabs.removeListener('open', hidePanel);

  ['activate', 'ready', 'emberVersion'].forEach( (event) => {
    tabs.removeListener(event, refreshButton);
  });

  // remove button and its panel if any
  if (button) {
    button.remove();
    button = null;
    panel.destroy();
    panel = null;
  }
}

// # INTERNALS

function hidePanel() {
  panel.hide();
}

function refreshButton(tab) {
  button.setVisibility(false, tab.url);
  let libs = tabs.getLibrariesByTabId(tab.id);
  if (libs) {
    button.setVisibility(true, libs.url);
    refreshPanel(tab.url, libs);
  }
}

function refreshPanel(url, libraries) {
  libraries.inspectorVersion = version;
  panel.port.emit("emberVersion", libraries);
}

function createPanel() {
  let panel = Panel({
    contentURL: data.url("toolbar-button-panel.html")
  });

  panel.on("show", () => {
    let tab = tabs.activeTab;
    refreshPanel(tab.url, tabs.getLibrariesByTabId(tab.id));
  });

  panel.port.on('panelResize', (width, height) => {
    panel.height = height + 40;
  });

  panel.port.on('openEmberInspector', () => {
    panel.hide();
    openEmberInspector();
  });

  return panel;
}
