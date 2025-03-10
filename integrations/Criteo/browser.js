/* eslint-disable no-unused-expressions */

import logger from "../../utils/logUtil";
import ScriptLoader from "../ScriptLoader";
import {
  handleCommonFields,
  generateExtraData,
  handleProductView,
  handlingEventDuo,
  handleListView,
} from "./utils";
import { NAME } from "./constants";

class Criteo {
  constructor(config) {
    this.name = NAME;
    this.hashMethod = config.hashMethod;
    this.accountId = config.accountId;
    this.url = config.homePageUrl;
    // eslint-disable-next-line no-nested-ternary
    this.deviceType = /iPad/.test(navigator.userAgent)
      ? "t"
      : /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Silk/.test(
          navigator.userAgent
        )
      ? "m"
      : "d";
    this.fieldMapping = config.fieldMapping;
    this.OPERATOR_LIST = ["eq", "gt", "lt", "ge", "le", "in"];
  }

  init() {
    logger.debug("===in init Criteo===");
    if (!this.accountId) {
      logger.debug("Account ID missing");
      return;
    }
    window.criteo_q = window.criteo_q || [];

    ScriptLoader(
      "Criteo",
      `//dynamic.criteo.com/js/ld/ld.js?a=${this.accountId}`
    );
    window.criteo_q.push({ event: "setAccount", account: this.accountId });
    window.criteo_q.push({ event: "setSiteType", type: this.deviceType });
  }

  // eslint-disable-next-line class-methods-use-this
  isLoaded() {
    logger.debug("===in Criteo isLoaded===");
    return !!(window.criteo_q && window.criteo_q.push !== Array.prototype.push);
  }

  // eslint-disable-next-line class-methods-use-this
  isReady() {
    logger.debug("===in Criteo isReady===");
    return !!(window.criteo_q && window.criteo_q.push !== Array.prototype.push);
  }

  page(rudderElement) {
    const { name, properties } = rudderElement.message;

    const finalPayload = handleCommonFields(rudderElement, this.hashMethod);

    if (
      name === "home" ||
      (properties && properties.name === "home") ||
      (this.url && this.url === window.location.href) ||
      (properties && properties.url === this.url)
    ) {
      const homeEvent = {
        event: "viewHome",
      };
      finalPayload.push(homeEvent);
    } else {
      logger.debug("[Criteo] Home page is not detected");
      return;
    }

    const extraDataObject = generateExtraData(rudderElement, this.fieldMapping);
    if (Object.keys(extraDataObject).length !== 0) {
      finalPayload.push({ event: "setData", ...extraDataObject });
    }

    window.criteo_q.push(finalPayload);

    // Final example payload supported by destination
    // window.criteo_q.push(
    //   { event: "setAccount", account: YOUR_PARTNER_ID},
    //   {
    //     event: "setEmail",
    //     email: "##Email Address##",
    //     hash_method: "##Hash Method##",
    //   },
    //   { event: "setSiteType", type: deviceType},
    //   { event: "setCustomerId", id: "##Customer Id##" },
    //   { event: "setRetailerVisitorId", id: "##Visitor Id##"},
    //   { event: "setZipcode", zipcode: "##Zip Code##" },
    //   { event: "viewHome" }
    // );
  }

  track(rudderElement) {
    const { event, properties } = rudderElement.message;

    const finalPayload = handleCommonFields(rudderElement, this.hashMethod);

    if (!event) {
      logger.debug("[Criteo] Event name from track call is missing!!===");
      return;
    }

    if (!properties || Object.keys(properties).length === 0) {
      logger.debug(
        "[Criteo] Either properties object is missing or empty in the track call"
      );
      return;
    }
    const eventType = event.toLowerCase().trim();

    switch (eventType) {
      case "product viewed":
        handleProductView(rudderElement.message, finalPayload);
        break;
      case "cart viewed":
      case "order completed":
        handlingEventDuo(rudderElement.message, finalPayload);
        break;
      case "product list viewed":
        handleListView(rudderElement.message, finalPayload, this.OPERATOR_LIST);
        break;
      default:
        logger.debug(`[Criteo] event ${eventType} is not supported`);
        return;
    }
    const extraDataObject = generateExtraData(rudderElement, this.fieldMapping);
    if (Object.keys(extraDataObject).length !== 0) {
      finalPayload.push({ event: "setData", ...extraDataObject });
    }
    window.criteo_q.push(finalPayload);
  }
}
export default Criteo;
