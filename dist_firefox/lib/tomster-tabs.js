const { Class } = require('sdk/core/heritage');

const { data } = require("sdk/self");

const { PageMod } = require("sdk/page-mod");
const { emit, on, off, once } = require("sdk/event/core");
const { EventTarget } = require("sdk/event/target");

const tabs = require("sdk/tabs");

// route open/active/ready events (needed by tomster-locationbar-button)
tabs.on('open', (tab) => emit(tomsterTabs, 'open', tab));
tabs.on('activate', (tab) => emit(tomsterTabs, 'activate', tab));
tabs.on('ready', (tab) => emit(tomsterTabs, 'ready', tab));

// track attached workers and ember libraries detected by tab.id
let workers = new Map();
let libraries = new Map();

// simplified tabs tracker class
const Tabs = Class({
  extends: EventTarget,
  get activeTab() tabs.activeTab,
  getWorkerByTabId: function (tabId) {
    return workers.get(tabId);
  },
  getLibrariesByTabId: function (tabId) {
    return libraries.get(tabId);
  }
});

// exports tab tracker instance
let tomsterTabs = Tabs();
module.exports = tomsterTabs;

// create a page monitor to check ember versions and route
// ember debug messages when needed
let pageMod = PageMod({
  include: "*",
  attachTo: ["top", "existing"],
  contentScriptFile: data.url('content-script.js'),
  contentScriptOptions: {
    inPageScriptURL: data.url('in-page-script.js')
  },
  contentScriptWhen: "start",
  onAttach: (worker) => {
    // NOTE: select top frame
    if (worker.tab && worker.url === worker.tab.url) {
      let tabId = worker.tab.id;
      workers.set(tabId, worker);
      attachWorker(worker);
      emit(tomsterTabs, "emberAttach", { id: tabId, url: worker.url });
      worker.once('detach', () => {
        emit(tomsterTabs, "emberDetach", { id: tabId });
        workers.delete(tabId);
        libraries.delete(tabId);
      });
    } else {
      // destroy unused workers
      worker.destroy();
    }
  }
});

function attachWorker(worker) {
  worker.port.on("emberVersion", routeEmberVersion);
  worker.port.on("emberDebug", routeEmberDebug);

  worker.once('detach', () => {
    worker.port.removeListener("emberVersion", routeEmberVersion);
    worker.port.removeListener("emberDebug", routeEmberDebug);
  });

  function routeEmberVersion(msg) {
    msg.url = worker.url;
    libraries.set(worker.tab.id, msg);
    emit(tomsterTabs, "emberVersion", { id: worker.tab.id,
                                        url: worker.tab.url,
                                        data: msg });
  }

  function routeEmberDebug(msg) {
    emit(tomsterTabs, "emberDebug", { id: worker.tab.id,
                                          url: worker.tab.url,
                                          data: msg });
  }
}
