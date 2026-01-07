import { sanitizeInput } from '../lib/utils.js';

const TRACKING_KEYWORDS = [
  '_ga', '_gid', '_fbp', '_fbc', 'utm_', '__utma', '__utmz',
  'doubleclick', 'adsense', 'adroll', 'criteo', '_hjid',
  'optimizely', 'mixpanel', 'segment', 'amplitude',
  'pixel', 'tracker', 'uuid'
];

const ANALYTICS_KEYWORDS = [
  'analytics', 'stats', 'metrics', '_gat', 'matomo', 'piwik',
  'hotjar', 'newrelic', 'datadog', 'sentry',
];

const FUNCTIONAL_KEYWORDS = [
  'session', 'auth', 'token', 'csrf', 'xsrf', 'login',
  'user', 'pref', 'lang', 'locale', 'timezone', 'theme',
  'cart', 'checkout', 'order', 'payment',
];

export function classifyCookie(cookie, isThirdParty) {
  const safeName = sanitizeInput(cookie.name).toLowerCase();
  const safeValue = sanitizeInput(cookie.value || "").toLowerCase();
  
  const isPartitioned = !!cookie.partitionKey;

  if (isThirdParty) {
    if (!isPartitioned) {
      return 'high';
    } else {
      return 'medium';
    }
  }

  const matches = (keywords) => keywords.some(k => safeName.includes(k) || safeValue.includes(k));

  if (matches(TRACKING_KEYWORDS)) {
    return 'medium';
  }

  if (matches(ANALYTICS_KEYWORDS)) {
    return 'medium';
  }

  if (matches(FUNCTIONAL_KEYWORDS)) {
    return 'low';
  }

  if (!cookie.expirationDate) {
    return 'low'; 
  }

  return 'low';
}