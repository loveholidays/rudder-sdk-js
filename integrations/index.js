import * as AdobeAnalytics from "./AdobeAnalytics";
import * as Amplitude from "./Amplitude";
import * as Appcues from "./Appcues";
import * as BingAds from "./BingAds";
import * as Braze from "./Braze";
import * as Bugsnag from "./Bugsnag";
import * as Chartbeat from "./Chartbeat";
import * as Clevertap from "./Clevertap";
import * as Comscore from "./Comscore";
import * as Criteo from "./Criteo";
import * as CustomerIO from "./CustomerIO";
import * as Drip from "./Drip";
import * as FBPixel from "./FacebookPixel";
import * as Fullstory from "./Fullstory";
import * as GA from "./GA";
import * as GA4 from "./GA4";
import * as GoogleAds from "./GoogleAds";
import * as GoogleTagManager from "./GoogleTagManager";
import * as Heap from "./Heap";
import * as Hotjar from "./Hotjar";
import * as HubSpot from "./HubSpot";
import * as INTERCOM from "./INTERCOM";
import * as Keen from "./Keen";
import * as Kissmetrics from "./Kissmetrics";
import * as Klaviyo from "./Klaviyo";
import * as LinkedInInsightTag from "./LinkedInInsightTag";
import * as Lotame from "./Lotame";
import * as Lytics from "./Lytics";
import * as Mixpanel from "./Mixpanel";
import * as MoEngage from "./MoEngage";
import * as Optimizely from "./Optimizely";
import * as Pendo from "./Pendo";
import * as PinterestTag from "./PinterestTag";
import * as QuantumMetric from "./QuantumMetric";
import * as Posthog from "./Posthog";
import * as ProfitWell from "./ProfitWell";
import * as Qualtrics from "./Qualtrics";
import * as RedditPixel from "./RedditPixel";
import * as Sentry from "./Sentry";
import * as SnapPixel from "./SnapPixel";
import * as TVSquared from "./TVSquared";
import * as VWO from "./VWO";
import * as PostAffiliatePro from "./PostAffiliatePro";
// the key names should match the destination.name value to keep partity everywhere
// (config-plan name, native destination.name , exported integration name(this one below))
const integrations = {
  ADOBE_ANALYTICS: AdobeAnalytics.default,
  AM: Amplitude.default,
  APPCUES: Appcues.default,
  BINGADS: BingAds.default,
  BRAZE: Braze.default,
  BUGSNAG: Bugsnag.default,
  CHARTBEAT: Chartbeat.default,
  CLEVERTAP: Clevertap.default,
  COMSCORE: Comscore.default,
  CRITEO: Criteo.default,
  CUSTOMERIO: CustomerIO.default,
  DRIP: Drip.default,
  FACEBOOK_PIXEL: FBPixel.default,
  FULLSTORY: Fullstory.default,
  GA4: GA4.default,
  GA: GA.default,
  GOOGLEADS: GoogleAds.default,
  GTM: GoogleTagManager.default,
  HEAP: Heap.default,
  HOTJAR: Hotjar.default,
  HS: HubSpot.default,
  INTERCOM: INTERCOM.default,
  KEEN: Keen.default,
  KISSMETRICS: Kissmetrics.default,
  KLAVIYO: Klaviyo.default,
  LINKEDIN_INSIGHT_TAG: LinkedInInsightTag.default,
  LOTAME: Lotame.default,
  LYTICS: Lytics.default,
  MOENGAGE: MoEngage.default,
  MP: Mixpanel.default,
  OPTIMIZELY: Optimizely.default,
  PENDO: Pendo.default,
  PINTEREST_TAG: PinterestTag.default,
  QUANTUMMETRIC: QuantumMetric.default,
  POSTHOG: Posthog.default,
  PROFITWELL: ProfitWell.default,
  QUALTRICS: Qualtrics.default,
  REDDIT_PIXEL: RedditPixel.default,
  SENTRY: Sentry.default,
  SNAP_PIXEL: SnapPixel.default,
  TVSQUARED: TVSquared.default,
  VWO: VWO.default,
  POSTAFFILIATEPRO: PostAffiliatePro.default,
};

export { integrations };
