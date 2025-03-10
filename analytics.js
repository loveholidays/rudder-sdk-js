/* eslint-disable new-cap */
/* eslint-disable func-names */
/* eslint-disable eqeqeq */
/* eslint-disable no-prototype-builtins */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable no-sequences */
/* eslint-disable no-multi-assign */
/* eslint-disable no-unused-expressions */
/* eslint-disable import/extensions */
/* eslint-disable no-param-reassign */
import Emitter from "component-emitter";
import after from "after";
import querystring from "component-querystring";
import merge from "lodash.merge";
import cloneDeep from "lodash.clonedeep";
import utm from "@segment/utm-params";
import {
  getJSONTrimmed,
  generateUUID,
  handleError,
  getDefaultPageProperties,
  getUserProvidedConfigUrl,
  findAllEnabledDestinations,
  tranformToRudderNames,
  transformToServerNames,
  checkReservedKeywords,
  getReferrer,
  getReferringDomain,
  commonNames,
} from "./utils/utils";
import {
  CONFIG_URL,
  MAX_WAIT_FOR_INTEGRATION_LOAD,
  INTEGRATION_LOAD_CHECK_INTERVAL,
  POLYFILL_URL,
} from "./utils/constants";
import { integrations } from "./integrations";
import RudderElementBuilder from "./utils/RudderElementBuilder";
import Storage from "./utils/storage";
import { EventRepository } from "./utils/EventRepository";
import logger from "./utils/logUtil";
import { addDomEventHandlers } from "./utils/autotrack.js";
import ScriptLoader from "./integrations/ScriptLoader";
import parseLinker from "./utils/linker";
import CookieConsentFactory from "./cookieConsent/CookieConsentFactory";

const queryDefaults = {
  trait: "ajs_trait_",
  prop: "ajs_prop_",
};

// https://unpkg.com/test-rudder-sdk@1.0.5/dist/browser.js

/**
 * Add the rudderelement object to flush queue
 *
 * @param {RudderElement} rudderElement
 */
function enqueue(rudderElement, type) {
  if (!this.eventRepository) {
    this.eventRepository = EventRepository;
  }
  this.eventRepository.enqueue(rudderElement, type);
}

/**
 * class responsible for handling core
 * event tracking functionalities
 */
class Analytics {
  /**
   * Creates an instance of Analytics.
   * @memberof Analytics
   */
  constructor() {
    this.autoTrackHandlersRegistered = false;
    this.autoTrackFeatureEnabled = false;
    this.initialized = false;
    this.areEventsReplayed = false;
    this.trackValues = [];
    this.eventsBuffer = [];
    this.clientIntegrations = [];
    this.loadOnlyIntegrations = {};
    this.clientIntegrationObjects = undefined;
    this.successfullyLoadedIntegration = [];
    this.failedToBeLoadedIntegration = [];
    this.toBeProcessedArray = [];
    this.toBeProcessedByIntegrationArray = [];
    this.storage = Storage;
    this.eventRepository = EventRepository;
    this.sendAdblockPage = false;
    this.sendAdblockPageOptions = {};
    this.clientSuppliedCallbacks = {};
    this.readyCallback = () => {};
    this.executeReadyCallback = undefined;
    this.methodToCallbackMapping = {
      syncPixel: "syncPixelCallback",
    };
    this.loaded = false;
    this.loadIntegration = true;
    this.cookieConsentOptions = {};
  }

  /**
   * initialize the user after load config
   */
  initializeUser() {
    this.userId =
      this.storage.getUserId() != undefined ? this.storage.getUserId() : "";

    this.userTraits =
      this.storage.getUserTraits() != undefined
        ? this.storage.getUserTraits()
        : {};

    this.groupId =
      this.storage.getGroupId() != undefined ? this.storage.getGroupId() : "";

    this.groupTraits =
      this.storage.getGroupTraits() != undefined
        ? this.storage.getGroupTraits()
        : {};

    this.anonymousId = this.getAnonymousId();

    // save once for storing older values to encrypted
    this.storage.setUserId(this.userId);
    this.storage.setAnonymousId(this.anonymousId);
    this.storage.setGroupId(this.groupId);
    this.storage.setUserTraits(this.userTraits);
    this.storage.setGroupTraits(this.groupTraits);
  }

  setInitialPageProperties() {
    let initialReferrer = this.storage.getInitialReferrer();
    let initialReferringDomain = this.storage.getInitialReferringDomain();
    if (initialReferrer == null && initialReferringDomain == null) {
      initialReferrer = getReferrer();
      initialReferringDomain = getReferringDomain(initialReferrer);
      this.storage.setInitialReferrer(initialReferrer);
      this.storage.setInitialReferringDomain(initialReferringDomain);
    }
  }

  /**
   * Process the response from control plane and
   * call initialize for integrations
   *
   * @param {*} status
   * @param {*} response
   * @memberof Analytics
   */
  processResponse(status, response) {
    try {
      logger.debug(`===in process response=== ${status}`);
      if (typeof response === "string") {
        response = JSON.parse(response);
      }
      if (
        response.source.useAutoTracking &&
        !this.autoTrackHandlersRegistered
      ) {
        this.autoTrackFeatureEnabled = true;
        addDomEventHandlers(this);
        this.autoTrackHandlersRegistered = true;
      }
      response.source.destinations.forEach(function (destination, index) {
        logger.debug(
          `Destination ${index} Enabled? ${destination.enabled} Type: ${destination.destinationDefinition.name} Use Native SDK? true`
        );
        if (destination.enabled) {
          this.clientIntegrations.push({
            name: destination.destinationDefinition.name,
            config: destination.config,
          });
        }
      }, this);

      logger.debug("this.clientIntegrations: ", this.clientIntegrations);
      // intersection of config-plane native sdk destinations with sdk load time destination list
      this.clientIntegrations = findAllEnabledDestinations(
        this.loadOnlyIntegrations,
        this.clientIntegrations
      );

      var cookieConsent;
      // Call the cookie consent factory to initialize and return the type of cookie
      // consent being set. For now we only support OneTrust.
      try {
        cookieConsent = CookieConsentFactory.initialize(
          this.cookieConsentOptions
        );
      } catch (e) {
        logger.error(e);
      }

      // If cookie consent object is return we filter according to consents given by user
      // else we do not consider any filtering for cookie consent.
      this.clientIntegrations = this.clientIntegrations.filter((intg) => {
        return (
          integrations[intg.name] != undefined &&
          (!cookieConsent || // check if cookie consent object is present and then do filtering
            (cookieConsent && cookieConsent.isEnabled(intg.config)))
        );
      });

      this.init(this.clientIntegrations);
    } catch (error) {
      handleError(error);
      logger.debug("===handling config BE response processing error===");
      logger.debug(
        "autoTrackHandlersRegistered",
        this.autoTrackHandlersRegistered
      );
      if (this.autoTrackFeatureEnabled && !this.autoTrackHandlersRegistered) {
        addDomEventHandlers(this);
        this.autoTrackHandlersRegistered = true;
      }
    }
  }

  /**
   * Initialize integrations by addinfg respective scripts
   * keep the instances reference in core
   *
   * @param {*} intgArray
   * @returns
   * @memberof Analytics
   */
  init(intgArray) {
    const self = this;
    logger.debug("supported intgs ", integrations);
    // this.clientIntegrationObjects = [];
    if (!intgArray || intgArray.length == 0) {
      if (this.readyCallback) {
        this.readyCallback();
      }
      this.toBeProcessedByIntegrationArray = [];
      return;
    }
    let intgInstance;
    intgArray.forEach((intg) => {
      try {
        logger.debug(
          "[Analytics] init :: trying to initialize integration name:: ",
          intg.name
        );
        const intgClass = integrations[intg.name];
        const destConfig = intg.config;
        intgInstance = new intgClass(destConfig, self);
        intgInstance.init();
        logger.debug("initializing destination: ", intg);
        this.isInitialized(intgInstance).then(this.replayEvents);
      } catch (e) {
        logger.error(
          "[Analytics] initialize integration (integration.init()) failed :: ",
          intg.name
        );
        this.failedToBeLoadedIntegration.push(intgInstance);
      }
    });
  }

  // eslint-disable-next-line class-methods-use-this
  replayEvents(object) {
    if (
      object.successfullyLoadedIntegration.length +
        object.failedToBeLoadedIntegration.length ===
        object.clientIntegrations.length &&
      !object.areEventsReplayed
    ) {
      logger.debug(
        "===replay events called====",
        " successfully loaded count: ",
        object.successfullyLoadedIntegration.length,
        " failed loaded count: ",
        object.failedToBeLoadedIntegration.length
      );
      // eslint-disable-next-line no-param-reassign
      object.clientIntegrationObjects = [];
      // eslint-disable-next-line no-param-reassign
      object.clientIntegrationObjects = object.successfullyLoadedIntegration;

      logger.debug(
        "==registering after callback===",
        " after to be called after count : ",
        object.clientIntegrationObjects.length
      );
      object.executeReadyCallback = after(
        object.clientIntegrationObjects.length,
        object.readyCallback
      );

      logger.debug("==registering ready callback===");
      object.on("ready", object.executeReadyCallback);

      object.clientIntegrationObjects.forEach((intg) => {
        logger.debug("===looping over each successful integration====");
        if (!intg.isReady || intg.isReady()) {
          logger.debug("===letting know I am ready=====", intg.name);
          object.emit("ready");
        }
      });

      if (object.toBeProcessedByIntegrationArray.length > 0) {
        // send the queued events to the fetched integration
        object.toBeProcessedByIntegrationArray.forEach((event) => {
          const methodName = event[0];
          event.shift();

          // convert common names to sdk identified name
          if (Object.keys(event[0].message.integrations).length > 0) {
            tranformToRudderNames(event[0].message.integrations);
          }

          // if not specified at event level, All: true is default
          const clientSuppliedIntegrations = event[0].message.integrations;

          // get intersection between config plane native enabled destinations
          // (which were able to successfully load on the page) vs user supplied integrations
          const succesfulLoadedIntersectClientSuppliedIntegrations =
            findAllEnabledDestinations(
              clientSuppliedIntegrations,
              object.clientIntegrationObjects
            );

          // send to all integrations now from the 'toBeProcessedByIntegrationArray' replay queue
          for (
            let i = 0;
            i < succesfulLoadedIntersectClientSuppliedIntegrations.length;
            i += 1
          ) {
            try {
              if (
                !succesfulLoadedIntersectClientSuppliedIntegrations[i]
                  .isFailed ||
                !succesfulLoadedIntersectClientSuppliedIntegrations[
                  i
                ].isFailed()
              ) {
                if (
                  succesfulLoadedIntersectClientSuppliedIntegrations[i][
                    methodName
                  ]
                ) {
                  const sendEvent = !object.IsEventBlackListed(
                    event[0].message.event,
                    succesfulLoadedIntersectClientSuppliedIntegrations[i].name
                  );

                  // Block the event if it is blacklisted for the device-mode destination
                  if (sendEvent) {
                    const clonedBufferEvent = cloneDeep(event);
                    succesfulLoadedIntersectClientSuppliedIntegrations[i][
                      methodName
                    ](...clonedBufferEvent);
                  }
                }
              }
            } catch (error) {
              handleError(error);
            }
          }
        });
        object.toBeProcessedByIntegrationArray = [];
      }
      object.areEventsReplayed = true;
    }
  }

  pause(time) {
    return new Promise((resolve) => {
      setTimeout(resolve, time);
    });
  }

  isInitialized(instance, time = 0) {
    return new Promise((resolve) => {
      if (instance.isLoaded()) {
        logger.debug("===integration loaded successfully====", instance.name);
        this.successfullyLoadedIntegration.push(instance);
        return resolve(this);
      }
      if (time >= MAX_WAIT_FOR_INTEGRATION_LOAD) {
        logger.debug("====max wait over====");
        this.failedToBeLoadedIntegration.push(instance);
        return resolve(this);
      }

      this.pause(INTEGRATION_LOAD_CHECK_INTERVAL).then(() => {
        logger.debug("====after pause, again checking====");
        return this.isInitialized(
          instance,
          time + INTEGRATION_LOAD_CHECK_INTERVAL
        ).then(resolve);
      });
    });
  }

  /**
   * Process page params and forward to page call
   *
   * @param {*} category
   * @param {*} name
   * @param {*} properties
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  page(category, name, properties, options, callback) {
    if (!this.loaded) return;
    if (typeof options === "function") (callback = options), (options = null);
    if (typeof properties === "function")
      (callback = properties), (options = properties = null);
    if (typeof name === "function")
      (callback = name), (options = properties = name = null);
    if (
      typeof category === "object" &&
      category != null &&
      category != undefined
    )
      (options = name), (properties = category), (name = category = null);
    if (typeof name === "object" && name != null && name != undefined)
      (options = properties), (properties = name), (name = null);
    if (typeof category === "string" && typeof name !== "string")
      (name = category), (category = null);
    if (this.sendAdblockPage && category != "RudderJS-Initiated") {
      this.sendSampleRequest();
    }
    this.processPage(category, name, properties, options, callback);
  }

  /**
   * Process track params and forward to track call
   *
   * @param {*} event
   * @param {*} properties
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  track(event, properties, options, callback) {
    if (!this.loaded) return;
    if (typeof options === "function") (callback = options), (options = null);
    if (typeof properties === "function")
      (callback = properties), (options = null), (properties = null);

    this.processTrack(event, properties, options, callback);
  }

  /**
   * Process identify params and forward to indentify  call
   *
   * @param {*} userId
   * @param {*} traits
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  identify(userId, traits, options, callback) {
    if (!this.loaded) return;
    if (typeof options === "function") (callback = options), (options = null);
    if (typeof traits === "function")
      (callback = traits), (options = null), (traits = null);
    if (typeof userId === "object")
      (options = traits), (traits = userId), (userId = this.userId);

    this.processIdentify(userId, traits, options, callback);
  }

  /**
   *
   * @param {*} to
   * @param {*} from
   * @param {*} options
   * @param {*} callback
   */
  alias(to, from, options, callback) {
    if (!this.loaded) return;
    if (typeof options === "function") (callback = options), (options = null);
    if (typeof from === "function")
      (callback = from), (options = null), (from = null);
    if (typeof from === "object") (options = from), (from = null);

    const rudderElement = new RudderElementBuilder().setType("alias").build();
    rudderElement.message.previousId =
      from || (this.userId ? this.userId : this.getAnonymousId());
    rudderElement.message.userId = to;

    this.processAndSendDataToDestinations(
      "alias",
      rudderElement,
      options,
      callback
    );
  }

  /**
   *
   * @param {*} to
   * @param {*} from
   * @param {*} options
   * @param {*} callback
   */
  group(groupId, traits, options, callback) {
    if (!this.loaded) return;
    if (!arguments.length) return;

    if (typeof options === "function") (callback = options), (options = null);
    if (typeof traits === "function")
      (callback = traits), (options = null), (traits = null);
    if (typeof groupId === "object")
      (options = traits), (traits = groupId), (groupId = this.groupId);

    this.groupId = groupId;
    this.storage.setGroupId(this.groupId);

    const rudderElement = new RudderElementBuilder().setType("group").build();
    if (traits) {
      for (const key in traits) {
        this.groupTraits[key] = traits[key];
      }
    } else {
      this.groupTraits = {};
    }
    this.storage.setGroupTraits(this.groupTraits);

    this.processAndSendDataToDestinations(
      "group",
      rudderElement,
      options,
      callback
    );
  }

  /**
   * Send page call to Rudder BE and to initialized integrations
   *
   * @param {*} category
   * @param {*} name
   * @param {*} properties
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  processPage(category, name, properties, options, callback) {
    const rudderElement = new RudderElementBuilder().setType("page").build();
    if (!properties) {
      properties = {};
    }
    if (name) {
      rudderElement.message.name = name;
      properties.name = name;
    }
    if (category) {
      rudderElement.message.category = category;
      properties.category = category;
    }
    rudderElement.message.properties = this.getPageProperties(properties); // properties;

    this.trackPage(rudderElement, options, callback);
  }

  /**
   * Send track call to Rudder BE and to initialized integrations
   *
   * @param {*} event
   * @param {*} properties
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  processTrack(event, properties, options, callback) {
    const rudderElement = new RudderElementBuilder().setType("track").build();
    if (event) {
      rudderElement.setEventName(event);
    }
    if (properties) {
      rudderElement.setProperty(properties);
    } else {
      rudderElement.setProperty({});
    }
    this.trackEvent(rudderElement, options, callback);
  }

  /**
   * Send identify call to Rudder BE and to initialized integrations
   *
   * @param {*} userId
   * @param {*} traits
   * @param {*} options
   * @param {*} callback
   * @memberof Analytics
   */
  processIdentify(userId, traits, options, callback) {
    if (userId && this.userId && userId !== this.userId) {
      this.reset();
    }
    this.userId = userId;
    this.storage.setUserId(this.userId);

    const rudderElement = new RudderElementBuilder()
      .setType("identify")
      .build();
    if (traits) {
      for (const key in traits) {
        this.userTraits[key] = traits[key];
      }
      this.storage.setUserTraits(this.userTraits);
    }

    this.identifyUser(rudderElement, options, callback);
  }

  /**
   * Identify call supporting rudderelement from builder
   *
   * @param {*} rudderElement
   * @param {*} callback
   * @memberof Analytics
   */
  identifyUser(rudderElement, options, callback) {
    if (rudderElement.message.userId) {
      this.userId = rudderElement.message.userId;
      this.storage.setUserId(this.userId);
    }

    if (
      rudderElement &&
      rudderElement.message &&
      rudderElement.message.context &&
      rudderElement.message.context.traits
    ) {
      this.userTraits = {
        ...rudderElement.message.context.traits,
      };
      this.storage.setUserTraits(this.userTraits);
    }

    this.processAndSendDataToDestinations(
      "identify",
      rudderElement,
      options,
      callback
    );
  }

  /**
   * Page call supporting rudderelement from builder
   *
   * @param {*} rudderElement
   * @param {*} callback
   * @memberof Analytics
   */
  trackPage(rudderElement, options, callback) {
    this.processAndSendDataToDestinations(
      "page",
      rudderElement,
      options,
      callback
    );
  }

  /**
   * Track call supporting rudderelement from builder
   *
   * @param {*} rudderElement
   * @param {*} callback
   * @memberof Analytics
   */
  trackEvent(rudderElement, options, callback) {
    this.processAndSendDataToDestinations(
      "track",
      rudderElement,
      options,
      callback
    );
  }

  IsEventBlackListed(eventName, intgName) {
    if (!eventName || !(typeof eventName === "string")) {
      return false;
    }
    const sdkIntgName = commonNames[intgName];
    const intg = this.clientIntegrations.find(
      (intg) => intg.name === sdkIntgName
    );

    const { blacklistedEvents, whitelistedEvents, eventFilteringOption } =
      intg.config;

    if (!eventFilteringOption) {
      return false;
    }

    switch (eventFilteringOption) {
      // disabled filtering
      case "disable":
        return false;
      // Blacklist is choosen for filtering events
      case "blacklistedEvents":
        const isValidBlackList =
          blacklistedEvents &&
          Array.isArray(blacklistedEvents) &&
          blacklistedEvents.every((x) => x.eventName !== "");

        if (isValidBlackList) {
          return blacklistedEvents.find(
            (eventObj) =>
              eventObj.eventName.trim().toUpperCase() ===
              eventName.trim().toUpperCase()
          ) === undefined
            ? false
            : true;
        } else {
          return false;
        }
      // Whitelist is choosen for filtering events
      case "whitelistedEvents":
        const isValidWhiteList =
          whitelistedEvents &&
          Array.isArray(whitelistedEvents) &&
          whitelistedEvents.some((x) => x.eventName !== "");
        if (isValidWhiteList) {
          return whitelistedEvents.find(
            (eventObj) =>
              eventObj.eventName.trim().toUpperCase() ===
              eventName.trim().toUpperCase()
          ) === undefined
            ? true
            : false;
        } else {
          return true;
        }
      default:
        return false;
    }
  }

  /**
   * Process and send data to destinations along with rudder BE
   *
   * @param {*} type
   * @param {*} rudderElement
   * @param {*} callback
   * @memberof Analytics
   */
  processAndSendDataToDestinations(type, rudderElement, options, callback) {
    try {
      if (!this.anonymousId) {
        this.setAnonymousId();
      }

      // assign page properties to context
      // rudderElement.message.context.page = getDefaultPageProperties();

      rudderElement.message.context.traits = {
        ...this.userTraits,
      };

      logger.debug("anonymousId: ", this.anonymousId);
      rudderElement.message.anonymousId = this.anonymousId;
      rudderElement.message.userId = rudderElement.message.userId
        ? rudderElement.message.userId
        : this.userId;

      if (type == "group") {
        if (this.groupId) {
          rudderElement.message.groupId = this.groupId;
        }
        if (this.groupTraits) {
          rudderElement.message.traits = {
            ...this.groupTraits,
          };
        }
      }

      this.processOptionsParam(rudderElement, options);
      logger.debug(JSON.stringify(rudderElement));

      // check for reserved keys and log
      checkReservedKeywords(rudderElement.message, type);

      // structure user supplied integrations object to rudder format
      if (Object.keys(rudderElement.message.integrations).length > 0) {
        tranformToRudderNames(rudderElement.message.integrations);
      }

      // if not specified at event level, All: true is default
      const clientSuppliedIntegrations = rudderElement.message.integrations;

      // get intersection between config plane native enabled destinations
      // (which were able to successfully load on the page) vs user supplied integrations
      const succesfulLoadedIntersectClientSuppliedIntegrations =
        findAllEnabledDestinations(
          clientSuppliedIntegrations,
          this.clientIntegrationObjects
        );

      // try to first send to all integrations, if list populated from BE
      try {
        succesfulLoadedIntersectClientSuppliedIntegrations.forEach((obj) => {
          if (!obj.isFailed || !obj.isFailed()) {
            if (obj[type]) {
              let sendEvent = !this.IsEventBlackListed(
                rudderElement.message.event,
                obj.name
              );

              // Block the event if it is blacklisted for the device-mode destination
              if (sendEvent) {
                const clonedRudderElement = cloneDeep(rudderElement);
                obj[type](clonedRudderElement);
              }
            }
          }
        });
      } catch (err) {
        handleError({ message: `[sendToNative]:${err}` });
      }

      // config plane native enabled destinations, still not completely loaded
      // in the page, add the events to a queue and process later
      if (!this.clientIntegrationObjects) {
        logger.debug("pushing in replay queue");
        // new event processing after analytics initialized  but integrations not fetched from BE
        this.toBeProcessedByIntegrationArray.push([type, rudderElement]);
      }

      // convert integrations object to server identified names, kind of hack now!
      transformToServerNames(rudderElement.message.integrations);

      // self analytics process, send to rudder
      enqueue.call(this, rudderElement, type);

      logger.debug(`${type} is called `);
      if (callback) {
        callback();
      }
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * add campaign parsed details under context
   * @param {*} rudderElement
   */
  addCampaignInfo(rudderElement) {
    const { search } = getDefaultPageProperties();
    const campaign = utm(search);
    if (
      rudderElement.message.context &&
      typeof rudderElement.message.context === "object"
    ) {
      rudderElement.message.context.campaign = campaign;
    }
  }

  /**
   * process options parameter
   * Apart from top level keys merge everyting under context
   * context.page's default properties are overriden by same keys of
   * provided properties in case of page call
   *
   * @param {*} rudderElement
   * @param {*} options
   * @memberof Analytics
   */
  processOptionsParam(rudderElement, options) {
    const { type, properties } = rudderElement.message;

    this.addCampaignInfo(rudderElement);

    // assign page properties to context.page
    rudderElement.message.context.page =
      type == "page"
        ? this.getContextPageProperties(properties)
        : this.getContextPageProperties();

    const toplevelElements = [
      "integrations",
      "anonymousId",
      "originalTimestamp",
    ];
    for (const key in options) {
      if (toplevelElements.includes(key)) {
        rudderElement.message[key] = options[key];
      } else if (key !== "context") {
        rudderElement.message.context = merge(rudderElement.message.context, {
          [key]: options[key],
        });
      } else if (typeof options[key] === "object" && options[key] != null) {
        rudderElement.message.context = merge(rudderElement.message.context, {
          ...options[key],
        });
      } else {
        logger.error(
          "[Analytics: processOptionsParam] context passed in options is not object"
        );
      }
    }
  }

  getPageProperties(properties, options) {
    const defaultPageProperties = getDefaultPageProperties();
    const optionPageProperties = options && options.page ? options.page : {};
    for (const key in defaultPageProperties) {
      if (properties[key] === undefined) {
        properties[key] =
          optionPageProperties[key] || defaultPageProperties[key];
      }
    }
    return properties;
  }

  // Assign page properties to context.page if the same property is not provided under context.page
  getContextPageProperties(properties) {
    const defaultPageProperties = getDefaultPageProperties();
    const contextPageProperties = {};
    for (const key in defaultPageProperties) {
      contextPageProperties[key] =
        properties && properties[key]
          ? properties[key]
          : defaultPageProperties[key];
    }
    return contextPageProperties;
  }

  /**
   * Clear user information
   *
   * @memberof Analytics
   */
  reset(flag) {
    if (!this.loaded) return;
    if (flag) {
      this.anonymousId = "";
    }
    this.userId = "";
    this.userTraits = {};
    this.groupId = "";
    this.groupTraits = {};
    this.storage.clear(flag);
  }

  getAnonymousId() {
    // if (!this.loaded) return;
    this.anonymousId = this.storage.getAnonymousId();
    if (!this.anonymousId) {
      this.setAnonymousId();
    }
    return this.anonymousId;
  }

  getUserTraits() {
    return this.userTraits;
  }

  /**
   * Sets anonymous id in the followin precedence:
   * 1. anonymousId: Id directly provided to the function.
   * 2. rudderAmpLinkerParm: value generated from linker query parm (rudderstack)
   *    using praseLinker util.
   * 3. generateUUID: A new uniquie id is generated and assigned.
   *
   * @param {string} anonymousId
   * @param {string} rudderAmpLinkerParm
   */
  setAnonymousId(anonymousId, rudderAmpLinkerParm) {
    // if (!this.loaded) return;
    const parsedAnonymousIdObj = rudderAmpLinkerParm
      ? parseLinker(rudderAmpLinkerParm)
      : null;
    const parsedAnonymousId = parsedAnonymousIdObj
      ? parsedAnonymousIdObj.rs_amp_id
      : null;
    this.anonymousId = anonymousId || parsedAnonymousId || generateUUID();
    this.storage.setAnonymousId(this.anonymousId);
  }

  isValidWriteKey(writeKey) {
    if (
      !writeKey ||
      typeof writeKey !== "string" ||
      writeKey.trim().length == 0
    ) {
      return false;
    }
    return true;
  }

  isValidServerUrl(serverUrl) {
    if (
      !serverUrl ||
      typeof serverUrl !== "string" ||
      serverUrl.trim().length == 0
    ) {
      return false;
    }
    return true;
  }

  /**
   * Load after polyfills are loaded
   * @param {*} writeKey
   * @param {*} serverUrl
   * @param {*} options
   * @returns
   */
  loadAfterPolyfill(writeKey, serverUrl, options) {
    if (options && options.cookieConsentManager)
      this.cookieConsentOptions = cloneDeep(options.cookieConsentManager);
    let configUrl = CONFIG_URL;
    if (!this.isValidWriteKey(writeKey) || !this.isValidServerUrl(serverUrl)) {
      handleError({
        message:
          "[Analytics] load:: Unable to load due to wrong writeKey or serverUrl",
      });
      throw Error("failed to initialize");
    }

    let storageOptions = {};
    if (options && options.logLevel) {
      logger.setLogLevel(options.logLevel);
    }

    if (options && options.setCookieDomain) {
      storageOptions = { ...storageOptions, domain: options.setCookieDomain };
    }

    if (options && options.secureCookie) {
      storageOptions = { ...storageOptions, secure: options.secureCookie };
    }
    this.storage.options(storageOptions);

    if (options && options.integrations) {
      Object.assign(this.loadOnlyIntegrations, options.integrations);
      tranformToRudderNames(this.loadOnlyIntegrations);
    }
    if (options && options.configUrl) {
      configUrl = getUserProvidedConfigUrl(options.configUrl);
    }
    if (options && options.sendAdblockPage) {
      this.sendAdblockPage = true;
    }
    if (options && options.sendAdblockPageOptions) {
      if (typeof options.sendAdblockPageOptions === "object") {
        this.sendAdblockPageOptions = options.sendAdblockPageOptions;
      }
    }
    if (options && options.clientSuppliedCallbacks) {
      // convert to rudder recognised method names
      const tranformedCallbackMapping = {};
      Object.keys(this.methodToCallbackMapping).forEach((methodName) => {
        if (this.methodToCallbackMapping.hasOwnProperty(methodName)) {
          if (
            options.clientSuppliedCallbacks[
              this.methodToCallbackMapping[methodName]
            ]
          ) {
            tranformedCallbackMapping[methodName] =
              options.clientSuppliedCallbacks[
                this.methodToCallbackMapping[methodName]
              ];
          }
        }
      });
      Object.assign(this.clientSuppliedCallbacks, tranformedCallbackMapping);
      this.registerCallbacks(true);
    }

    if (options && options.loadIntegration != undefined) {
      this.loadIntegration = !!options.loadIntegration;
    }

    this.eventRepository.initialize(writeKey, serverUrl, options);
    this.initializeUser();
    this.setInitialPageProperties();
    this.loaded = true;
    if (
      options &&
      options.valTrackingList &&
      options.valTrackingList.push == Array.prototype.push
    ) {
      this.trackValues = options.valTrackingList;
    }
    if (options && options.useAutoTracking) {
      this.autoTrackFeatureEnabled = true;
      if (this.autoTrackFeatureEnabled && !this.autoTrackHandlersRegistered) {
        addDomEventHandlers(this);
        this.autoTrackHandlersRegistered = true;
        logger.debug(
          "autoTrackHandlersRegistered",
          this.autoTrackHandlersRegistered
        );
      }
    }

    function errorHandler(error) {
      handleError(error);
      if (this.autoTrackFeatureEnabled && !this.autoTrackHandlersRegistered) {
        addDomEventHandlers(this);
      }
    }
    if (options && options.getSourceConfig) {
      if (typeof options.getSourceConfig !== "function") {
        handleError('option "getSourceConfig" must be a function');
      } else {
        const res = options.getSourceConfig();

        if (res instanceof Promise) {
          res.then((res) => this.processResponse(200, res)).catch(errorHandler);
        } else {
          this.processResponse(200, res);
        }

        processDataInAnalyticsArray(this);
      }
      return;
    }

    try {
      getJSONTrimmed(this, configUrl, writeKey, this.processResponse);
    } catch (error) {
      errorHandler(error);
    }
    processDataInAnalyticsArray(this);
  }

  /**
   * Call control pane to get client configs
   *
   * @param {*} writeKey
   * @memberof Analytics
   */
  load(writeKey, serverUrl, options) {
    // logger.debug("inside load ");
    if (this.loaded) return;

    // check if the below features are available in the browser or not
    // If not present dynamically load from the polyfill cdn
    if (
      !String.prototype.endsWith ||
      !String.prototype.startsWith ||
      !String.prototype.includes ||
      !Array.prototype.find ||
      !Array.prototype.includes ||
      !Promise ||
      !Object.entries
    ) {
      ScriptLoader("polyfill", POLYFILL_URL);
      const self = this;
      const interval = setInterval(function () {
        // check if the polyfill is loaded
        if (window.hasOwnProperty("polyfill")) {
          clearInterval(interval);
          self.loadAfterPolyfill(writeKey, serverUrl, options);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
      }, MAX_WAIT_FOR_INTEGRATION_LOAD);
    } else {
      this.loadAfterPolyfill(writeKey, serverUrl, options);
    }
  }

  ready(callback) {
    if (!this.loaded) return;
    if (typeof callback === "function") {
      this.readyCallback = callback;
      return;
    }
    logger.error("ready callback is not a function");
  }

  initializeCallbacks() {
    Object.keys(this.methodToCallbackMapping).forEach((methodName) => {
      if (this.methodToCallbackMapping.hasOwnProperty(methodName)) {
        this.on(methodName, () => {});
      }
    });
  }

  registerCallbacks(calledFromLoad) {
    if (!calledFromLoad) {
      Object.keys(this.methodToCallbackMapping).forEach((methodName) => {
        if (this.methodToCallbackMapping.hasOwnProperty(methodName)) {
          if (window.rudderanalytics) {
            if (
              typeof window.rudderanalytics[
                this.methodToCallbackMapping[methodName]
              ] === "function"
            ) {
              this.clientSuppliedCallbacks[methodName] =
                window.rudderanalytics[
                  this.methodToCallbackMapping[methodName]
                ];
            }
          }
          // let callback =
          //   ? typeof window.rudderanalytics[
          //       this.methodToCallbackMapping[methodName]
          //     ] == "function"
          //     ? window.rudderanalytics[this.methodToCallbackMapping[methodName]]
          //     : () => {}
          //   : () => {};

          // logger.debug("registerCallbacks", methodName, callback);

          // this.on(methodName, callback);
        }
      });
    }

    Object.keys(this.clientSuppliedCallbacks).forEach((methodName) => {
      if (this.clientSuppliedCallbacks.hasOwnProperty(methodName)) {
        logger.debug(
          "registerCallbacks",
          methodName,
          this.clientSuppliedCallbacks[methodName]
        );
        this.on(methodName, this.clientSuppliedCallbacks[methodName]);
      }
    });
  }

  sendSampleRequest() {
    ScriptLoader(
      "ad-block",
      "//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"
    );
  }

  /**
   * parse the given query string into usable Rudder object
   * @param {*} query
   */
  parseQueryString(query) {
    function getTraitsFromQueryObject(qObj) {
      const traits = {};
      Object.keys(qObj).forEach((key) => {
        if (key.substr(0, queryDefaults.trait.length) == queryDefaults.trait) {
          traits[key.substr(queryDefaults.trait.length)] = qObj[key];
        }
      });

      return traits;
    }

    function getEventPropertiesFromQueryObject(qObj) {
      const props = {};
      Object.keys(qObj).forEach((key) => {
        if (key.substr(0, queryDefaults.prop.length) == queryDefaults.prop) {
          props[key.substr(queryDefaults.prop.length)] = qObj[key];
        }
      });

      return props;
    }

    const returnObj = {};
    const queryObject = querystring.parse(query);
    const userTraits = getTraitsFromQueryObject(queryObject);
    const eventProps = getEventPropertiesFromQueryObject(queryObject);
    if (queryObject.ajs_uid) {
      returnObj.userId = queryObject.ajs_uid;
      returnObj.traits = userTraits;
    }
    if (queryObject.ajs_aid) {
      returnObj.anonymousId = queryObject.ajs_aid;
    }
    if (queryObject.ajs_event) {
      returnObj.event = queryObject.ajs_event;
      returnObj.properties = eventProps;
    }

    return returnObj;
  }
}

function pushQueryStringDataToAnalyticsArray(obj) {
  if (obj.anonymousId) {
    if (obj.userId) {
      instance.toBeProcessedArray.push(
        ["setAnonymousId", obj.anonymousId],
        ["identify", obj.userId, obj.traits]
      );
    } else {
      instance.toBeProcessedArray.push(["setAnonymousId", obj.anonymousId]);
    }
  } else if (obj.userId) {
    instance.toBeProcessedArray.push(["identify", obj.userId, obj.traits]);
  }

  if (obj.event) {
    instance.toBeProcessedArray.push(["track", obj.event, obj.properties]);
  }
}

function processDataInAnalyticsArray(analytics) {
  if (instance.loaded) {
    for (let i = 0; i < analytics.toBeProcessedArray.length; i++) {
      const event = [...analytics.toBeProcessedArray[i]];
      const method = event[0];
      event.shift();
      logger.debug("=====from analytics array, calling method:: ", method);
      analytics[method](...event);
    }

    instance.toBeProcessedArray = [];
  }
}

const instance = new Analytics();

Emitter(instance);

window.addEventListener(
  "error",
  (e) => {
    handleError(e, instance);
  },
  true
);

// if (process.browser) {
// test for adblocker
// instance.sendSampleRequest()

// initialize supported callbacks
instance.initializeCallbacks();

// register supported callbacks
instance.registerCallbacks(false);
const eventsPushedAlready =
  !!window.rudderanalytics &&
  window.rudderanalytics.push == Array.prototype.push;

const argumentsArray = window.rudderanalytics;

while (argumentsArray && argumentsArray[0] && argumentsArray[0][0] !== "load") {
  argumentsArray.shift();
}
if (
  argumentsArray &&
  argumentsArray.length > 0 &&
  argumentsArray[0][0] === "load"
) {
  const method = argumentsArray[0][0];
  argumentsArray[0].shift();
  logger.debug("=====from init, calling method:: ", method);
  instance[method](...argumentsArray[0]);
  argumentsArray.shift();
}

// once loaded, parse querystring of the page url to send events
const parsedQueryObject = instance.parseQueryString(window.location.search);

pushQueryStringDataToAnalyticsArray(parsedQueryObject);

if (argumentsArray && argumentsArray.length > 0) {
  for (let i = 0; i < argumentsArray.length; i++) {
    instance.toBeProcessedArray.push(argumentsArray[i]);
  }
}
if (eventsPushedAlready) {
  processDataInAnalyticsArray(instance);
}
// }

const ready = instance.ready.bind(instance);
const identify = instance.identify.bind(instance);
const page = instance.page.bind(instance);
const track = instance.track.bind(instance);
const alias = instance.alias.bind(instance);
const group = instance.group.bind(instance);
const reset = instance.reset.bind(instance);
const load = instance.load.bind(instance);
const initialized = (instance.initialized = true);
const getUserTraits = instance.getUserTraits.bind(instance);
const getAnonymousId = instance.getAnonymousId.bind(instance);
const setAnonymousId = instance.setAnonymousId.bind(instance);

export {
  initialized,
  ready,
  page,
  track,
  load,
  identify,
  reset,
  alias,
  group,
  getUserTraits,
  getAnonymousId,
  setAnonymousId,
};
