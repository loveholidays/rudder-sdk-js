/* eslint-disable no-unused-vars */
/* eslint-disable class-methods-use-this */
/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */
/* eslint-disable no-multi-assign */
/* eslint-disable func-names */
/* eslint-disable no-var */
/* eslint-disable vars-on-top */
/* eslint-disable no-unused-expressions */
import logger from "../../utils/logUtil";
import { NAME } from "./constants";

class RedditPixel {
  constructor(config) {
    this.advertiserId = config.advertiserId;
    this.name = NAME;
  }

  init() {
    logger.debug("===In init RedditPixel===");

    !(function (w, d) {
      if (!w.rdt) {
        var p = (w.rdt = function () {
          p.sendEvent
            ? p.sendEvent.apply(p, arguments)
            : p.callQueue.push(arguments);
        });
        p.callQueue = [];
        var t = d.createElement("script");
        (t.src = "https://www.redditstatic.com/ads/pixel.js"), (t.async = !0);
        var s = d.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(t, s);
      }
    })(window, document);

    window.rdt("init", this.advertiserId);
  }

  isLoaded() {
    logger.debug("===In isLoaded RedditPixel===");
    return !!(window.rdt && window.rdt.advertiserId === this.advertiserId);
  }

  isReady() {
    logger.debug("===In isReady RedditPixel===");
    return !!(window.rdt && window.rdt.advertiserId === this.advertiserId);
  }

  identify(rudderElement) {
    logger.debug("===In RedditPixel identify===");
    window.rdt("track", "SignUp");
  }

  track(rudderElement) {
    logger.debug("===In RedditPixel track===");

    const { event } = rudderElement.message;
    if (!event) {
      logger.error("Event name is not present");
      return;
    }

    switch (event.toLowerCase()) {
      case "product added":
        window.rdt("track", "AddToCart");
        break;
      case "product added to wishlist":
        window.rdt("track", "AddToWishlist");
        break;
      case "order completed":
        window.rdt("track", "Purchase");
        break;
      case "lead":
        window.rdt("track", "Lead");
        break;
      case "view content":
        window.rdt("track", "ViewContent");
        break;
      case "search":
        window.rdt("track", "Search");
        break;
      default:
        logger.error(`Invalid event ${event}. Track call not supported`);
        break;
    }
  }

  page(rudderElement) {
    logger.debug("===In RedditPixel page===");
    window.rdt("track", "PageVisit");
  }
}

export default RedditPixel;
