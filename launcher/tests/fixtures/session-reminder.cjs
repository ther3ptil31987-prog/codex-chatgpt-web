const path = require("node:path");
const { app, BrowserWindow, WebContentsView, ipcMain } = require("electron");
const { BrowserHost } = require("../../electron/browser-host.cjs");
const { SessionReminderView } = require("../../electron/session-reminder-view.cjs");
const { createStateStore, nextSessionRefreshReminderAt } = require("../../electron/state.cjs");

app.whenReady().then(async () => {
  const renderer = process.argv.find(value => value.startsWith("--renderer=")).slice("--renderer=".length);
  const window = new BrowserWindow({ width: 1120, height: 760, show: false,
    title: "Session reminder layer test", webPreferences: {
      preload: path.resolve(__dirname, "../../electron/preload.cjs"), sandbox: true,
    } });
  await window.loadURL("about:blank");
  const view = new WebContentsView({ webPreferences: { backgroundThrottling: false } });
  window.contentView.addChildView(view, 0);
  await view.webContents.loadURL("data:text/html," + encodeURIComponent(
    '<body style="background:#1b1b1b;color:#eee;font:20px system-ui;padding:36px"><h1>Browser test page</h1><button onclick="this.textContent=\'Clicked\'">Test browser interaction</button></body>',
  ));
  const state = { ...createStateStore(path.join(app.getPath("userData"), "fixture-state.json")).read(),
    language: "en", onboardingComplete: true, coreSetupComplete: true, mcpSetupComplete: true,
    sessionRefreshReminderAt: process.argv.includes("--inspect-ui") ? new Date(0).toISOString() : nextSessionRefreshReminderAt(),
  };
  const browser = { authenticated: true, visible: true, surfaceActive: true, status: "ready",
    url: "https://chatgpt.com/", title: "ChatGPT", zoomFactor: 1, activeTabId: "home",
    maxTabs: 5, tabs: [{ id: "home", active: true, title: "ChatGPT", status: "ready" }],
  };
  const host = Object.assign(Object.create(BrowserHost.prototype), {
    window, view, boundsReady: false, visible: true, surfaceActive: true,
    turnTabs: new Map(), selectedTabId: "home", authView: null,
  });
  const fixture = { host, state, actions: [], loads: 0 };
  view.webContents.on("did-start-loading", () => fixture.loads++);
  const logger = { error: (...args) => console.error(...args) };
  fixture.reminder = new SessionReminderView({ parent: window, logger,
    loadRenderer: contents => contents.loadFile(renderer), getLanguage: () => state.language,
    onAction: action => {
      fixture.actions.push(action);
      state.sessionRefreshReminderAt = nextSessionRefreshReminderAt();
      window.webContents.send("launcher:state-changed", state);
    },
  });
  ipcMain.handle("launcher:snapshot", () => ({ state, browser, version: "fixture", platform: process.platform,
    profile: "production", connectorNames: { automatic: "Codex", manual: "Codex Zero Risk" },
    logs: [], operation: null, update: { status: "up-to-date" }, urls: {},
  }));
  ipcMain.handle("launcher:limits", () => ({ enabled: false, windows: [] }));
  ipcMain.handle("launcher:browser-bounds", (_, bounds) => {
    host.setBounds(bounds, window.webContents.getZoomFactor());
    fixture.reminder.position();
    return true;
  });
  ipcMain.handle("launcher:browser-surface-active", (_, active) => {
    host.surfaceActive = active;
    host.syncViewVisibility();
    return browser;
  });
  global.sessionReminderFixture = fixture;
  await window.loadFile(renderer);
  if (process.argv.includes("--inspect-ui")) window.show();
  else window.showInactive();
  host.syncViewVisibility();
});
