import { DeskThing } from "@deskthing/server";
import { DESKTHING_EVENTS, SETTING_TYPES, type AppSettings } from "@deskthing/types";
import { DECK_MSG, DEFAULT_CONFIG_PORT, type ClientToServer } from "../shared/types";
import { openUrl } from "./actions";
import { configuratorUrl, startConfigServer, stopConfigServer } from "./configServer";
import { changePage, goToPage, loadProfile, press, sendView } from "./deck";
import { inputHelper } from "./win/input";

const PORT_SETTING = "configPort";

async function applyPort(port: unknown) {
  const p = typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_CONFIG_PORT;
  try {
    await startConfigServer(p);
  } catch (e) {
    console.error("Could not start the configurator:", e instanceof Error ? e.message : e);
  }
}

const start = async () => {
  await loadProfile();
  inputHelper.warmUp();

  const settings: AppSettings = {
    [PORT_SETTING]: {
      id: PORT_SETTING,
      type: SETTING_TYPES.NUMBER,
      label: "Configurator port",
      description: `Open http://localhost:<port>/ on this PC to edit your buttons (default ${DEFAULT_CONFIG_PORT}).`,
      value: DEFAULT_CONFIG_PORT,
      min: 1024,
      max: 65535,
    },
  };
  await DeskThing.initSettings(settings);
  const current = await DeskThing.getSettings();
  await applyPort(current?.[PORT_SETTING]?.value);

  sendView();
  console.log("StreamDeck server started");
};

const stop = async () => {
  stopConfigServer();
  inputHelper.stop();
  console.log("StreamDeck server stopped");
};

DeskThing.on(DESKTHING_EVENTS.SETTINGS, (data) => {
  void applyPort(data.payload?.[PORT_SETTING]?.value);
});

DeskThing.on(DECK_MSG, (data) => {
  const msg = data as unknown as ClientToServer;
  switch (msg.request) {
    case "getView":
      sendView();
      break;
    case "press":
      void press(msg.payload.buttonId);
      break;
    case "page":
      if ("delta" in msg.payload) changePage(msg.payload.delta);
      else goToPage(msg.payload.index);
      break;
    case "openConfigurator": {
      const url = configuratorUrl();
      if (url) openUrl(url).catch((e) => console.error("Could not open configurator:", e));
      else console.error("Configurator is not running");
      break;
    }
  }
});

DeskThing.on(DESKTHING_EVENTS.START, start);
DeskThing.on(DESKTHING_EVENTS.STOP, stop);
