/* eslint-disable class-methods-use-this */
import logger from "../../utils/logUtil";
import ScriptLoader from "../ScriptLoader";
import createUser from "./utils";
import { NAME } from "./constants";

class LaunchDarkly {
  constructor(config) {
    this.name = NAME;
    this.clientSideId = config.clientSideId;
  }

  init() {
    logger.debug("===in init LaunchDarkly===");
    if (!this.clientSideId) {
      logger.error(
        `${this.name} :: Unable to initialize destination - clientSideId is missing in config`
      );
      return;
    }
    ScriptLoader(null, "https://unpkg.com/launchdarkly-js-client-sdk@2");
  }

  isLoaded() {
    logger.debug("===In isLoaded LaunchDarkly===");
    return !!window.LDClient;
  }

  isReady() {
    logger.debug("===In isReady LaunchDarkly===");
    return this.isLoaded();
  }

  identify(rudderElement) {
    const { message } = rudderElement;
    window.user = createUser(message);

    if (window.ldclient) {
      window.ldclient.identify(window.user);
    } else {
      window.ldclient = window.LDClient.initialize(
        this.clientSideId,
        window.user
      );
    }
  }

  track(rudderElement) {
    const { event, properties } = rudderElement.message;
    if (window.ldclient) {
      window.ldclient.track(event, properties);
    } else
      logger.error(
        "=== In LaunchDarkly, track is not supported before identify ==="
      );
  }

  alias(rudderElement) {
    const { message } = rudderElement;
    const newUser = { key: message.userId };

    if (window.ldclient) {
      window.ldclient.alias(newUser, window.user);
    } else
      logger.error(
        "=== In LaunchDarkly, alias is not supported before identify ==="
      );
  }
}
export default LaunchDarkly;
