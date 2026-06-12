// Exact-match dictionary of well-known cookie names. Pre-verified descriptions
// override the generic risk engine output for these cookies.
const COOKIE_DICTIONARY = {
  'ak_bmsc': {
    displayName: 'Akamai Bot Mitigation Token',
    owner: 'Akamai Technologies',
    category: 'Security & Bot Mitigation',
    purpose: 'Ensures your browser is human to prevent automated bot attacks and malicious scraping.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  '_abck': {
    displayName: 'Akamai Bot Manager Token',
    owner: 'Akamai Technologies',
    category: 'Security & Bot Mitigation',
    purpose: 'Collects signals about your browser and device to distinguish humans from automated bots.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  'bm_sz': {
    displayName: 'Akamai Bot Manager Session',
    owner: 'Akamai Technologies',
    category: 'Security & Bot Mitigation',
    purpose: 'Tracks a short-lived session used by Akamai bot detection to evaluate request patterns.',
    privacyThreat: 'low',
    breakageImpact: 'high',
  },
  '__cf_bm': {
    displayName: 'Cloudflare Bot Management',
    owner: 'Cloudflare, Inc.',
    category: 'Security & Bot Mitigation',
    purpose: 'Distinguishes legitimate visitors from bots and automated traffic to protect the site from abuse.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  'cf_clearance': {
    displayName: 'Cloudflare Challenge Clearance',
    owner: 'Cloudflare, Inc.',
    category: 'Security & Bot Mitigation',
    purpose: 'Records that you have already passed a Cloudflare security check, such as a CAPTCHA or JS challenge.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  '__cflb': {
    displayName: 'Cloudflare Load Balancer',
    owner: 'Cloudflare, Inc.',
    category: 'Site Infrastructure',
    purpose: 'Routes your requests to a consistent backend server for session continuity.',
    privacyThreat: 'low',
    breakageImpact: 'medium',
  },
  '_ga': {
    displayName: 'Google Analytics Client ID',
    owner: 'Google LLC',
    category: 'Analytics & Tracking',
    purpose: 'Assigns a randomly generated ID to distinguish you from other visitors for site usage statistics.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  '_gid': {
    displayName: 'Google Analytics Session ID',
    owner: 'Google LLC',
    category: 'Analytics & Tracking',
    purpose: 'Distinguishes unique users for a 24-hour window to compile aggregate usage statistics.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  '_gat': {
    displayName: 'Google Analytics Throttle',
    owner: 'Google LLC',
    category: 'Analytics & Tracking',
    purpose: 'Used to throttle the rate of requests sent to Google Analytics.',
    privacyThreat: 'low',
    breakageImpact: 'low',
  },
  '_gcl_au': {
    displayName: 'Google Ads Conversion Linker',
    owner: 'Google LLC',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Stores and links ad click information to conversions for Google Ads campaign measurement.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  'NID': {
    displayName: 'Google Personalization Identifier',
    owner: 'Google LLC',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Remembers your preferences and personalizes ads across Google services.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '1P_JAR': {
    displayName: 'Google Ad Personalization',
    owner: 'Google LLC',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Carries information about your visits to Google-owned sites for ad targeting and measurement.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  'IDE': {
    displayName: 'DoubleClick Advertising ID',
    owner: 'Google LLC (DoubleClick)',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Registers and reports your actions across sites for ad targeting and frequency capping.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  'test_cookie': {
    displayName: 'DoubleClick Cookie Support Check',
    owner: 'Google LLC (DoubleClick)',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'A short-lived cookie used to check whether your browser supports cookies at all.',
    privacyThreat: 'low',
    breakageImpact: 'low',
  },
  '_fbp': {
    displayName: 'Meta Pixel Browser ID',
    owner: 'Meta Platforms, Inc.',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Identifies your browser to Meta (Facebook/Instagram) for ad delivery and measurement across sites.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '_fbc': {
    displayName: 'Meta Click ID',
    owner: 'Meta Platforms, Inc.',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Stores information about ad clicks that referred you to this site for conversion attribution.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '_uetsid': {
    displayName: 'Microsoft Advertising Session ID',
    owner: 'Microsoft Corporation',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Tracks your session for Microsoft (Bing) Ads conversion tracking and retargeting.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '_uetvid': {
    displayName: 'Microsoft Advertising Visitor ID',
    owner: 'Microsoft Corporation',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Identifies your browser across visits for Microsoft (Bing) Ads retargeting.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '_clck': {
    displayName: 'Microsoft Clarity User ID',
    owner: 'Microsoft Corporation',
    category: 'Analytics & Tracking',
    purpose: 'Persists a unique user ID for Microsoft Clarity session-recording analytics.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  '_clsk': {
    displayName: 'Microsoft Clarity Session ID',
    owner: 'Microsoft Corporation',
    category: 'Analytics & Tracking',
    purpose: 'Connects multiple page views into a single Microsoft Clarity session recording.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  'lidc': {
    displayName: 'LinkedIn Routing Identifier',
    owner: 'LinkedIn Corporation',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Used for routing and load-balancing requests, also linked to ad targeting on LinkedIn.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  'bcookie': {
    displayName: 'LinkedIn Browser ID',
    owner: 'LinkedIn Corporation',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'A persistent identifier used by LinkedIn to recognize your browser across visits.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  '_pin_unauth': {
    displayName: 'Pinterest Unauthenticated Visitor ID',
    owner: 'Pinterest, Inc.',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Identifies visitors who are not logged in to Pinterest for ad measurement.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  'JSESSIONID': {
    displayName: 'Java Session Identifier',
    owner: null,
    category: 'Authentication & Session',
    purpose: 'Maintains your logged-in session and server-side state for Java-based web applications.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  'PHPSESSID': {
    displayName: 'PHP Session Identifier',
    owner: null,
    category: 'Authentication & Session',
    purpose: 'Maintains your logged-in session and server-side state for PHP-based web applications.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  'connect.sid': {
    displayName: 'Express.js Session Identifier',
    owner: null,
    category: 'Authentication & Session',
    purpose: 'Maintains your logged-in session and server-side state for Node.js (Express) applications.',
    privacyThreat: 'low',
    breakageImpact: 'critical',
  },
  'OptanonConsent': {
    displayName: 'OneTrust Consent Record',
    owner: 'OneTrust LLC',
    category: 'Consent Management',
    purpose: 'Records your cookie consent choices so the consent banner does not reappear on every visit.',
    privacyThreat: 'low',
    breakageImpact: 'medium',
  },
  'OptanonAlertBoxClosed': {
    displayName: 'OneTrust Banner Dismissal',
    owner: 'OneTrust LLC',
    category: 'Consent Management',
    purpose: 'Remembers that you closed the cookie consent banner.',
    privacyThreat: 'low',
    breakageImpact: 'medium',
  },
  '__stripe_mid': {
    displayName: 'Stripe Fraud Prevention ID',
    owner: 'Stripe, Inc.',
    category: 'Fraud Prevention',
    purpose: 'Helps Stripe detect fraudulent payment activity by recognizing your browser across sessions.',
    privacyThreat: 'low',
    breakageImpact: 'high',
  },
  '__stripe_sid': {
    displayName: 'Stripe Fraud Prevention Session',
    owner: 'Stripe, Inc.',
    category: 'Fraud Prevention',
    purpose: 'Short-lived identifier used by Stripe to detect fraudulent payment activity during checkout.',
    privacyThreat: 'low',
    breakageImpact: 'high',
  },
};

// Pattern-based matches for cookie names that embed a property/site-specific suffix.
const PATTERN_DICTIONARY = [
  {
    pattern: /^_ga_[A-Z0-9]+$/,
    displayName: 'Google Analytics 4 Session Identifier',
    owner: 'Google LLC',
    category: 'Analytics & Tracking',
    purpose: 'Property-specific Google Analytics 4 cookie used to persist session state and engagement metrics for this site.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  {
    pattern: /^__utm[a-z]$/,
    displayName: 'Legacy Google Analytics (Urchin) Identifier',
    owner: 'Google LLC',
    category: 'Analytics & Tracking',
    purpose: 'Legacy Google Analytics cookie used to track visitor sessions, traffic sources, and campaign data.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
  {
    pattern: /^_gcl_/,
    displayName: 'Google Ads Conversion Linker',
    owner: 'Google LLC',
    category: 'Advertising & Cross-Site Tracking',
    purpose: 'Stores and links ad click information to conversions for Google Ads campaign measurement.',
    privacyThreat: 'high',
    breakageImpact: 'low',
  },
  {
    pattern: /^_hj/,
    displayName: 'Hotjar Session Recording',
    owner: 'Hotjar Ltd.',
    category: 'Analytics & Tracking',
    purpose: 'Used by Hotjar to record session activity such as clicks, scrolls, and mouse movement for UX analytics.',
    privacyThreat: 'medium',
    breakageImpact: 'low',
  },
];

// Fallback substring patterns suggesting a tracking/identity purpose when the
// dictionary has no exact or pattern match.
const TRACKER_PATTERNS = [
  /uid/, /sess/, /dist[_-]?id/, /track/, /visitor/, /client[_-]?id/, /analytics/, /campaign/, /affiliate/,
];

function inferBreakageImpact(lowerName, isThirdParty) {
  if (/session|auth|token|login|csrf|xsrf|jwt/.test(lowerName)) return 'critical';
  if (/cart|checkout|order|payment|basket/.test(lowerName)) return 'high';
  if (/pref|consent|lang|locale|theme|currency|region/.test(lowerName)) return 'medium';
  if (isThirdParty) return 'low';
  return 'medium';
}

// Returns { displayName, owner, category, purpose, privacyThreat, breakageImpact }.
// displayName/owner are null when the cookie isn't in the dictionary, so the UI
// can fall back to the raw cookie name.
export function getCookieInsights(cookie) {
  const name = cookie.name || '';

  const dictEntry = COOKIE_DICTIONARY[name]
    || PATTERN_DICTIONARY.find(entry => entry.pattern.test(name));

  if (dictEntry) {
    return {
      displayName: dictEntry.displayName,
      owner: dictEntry.owner,
      category: dictEntry.category,
      purpose: dictEntry.purpose,
      privacyThreat: dictEntry.privacyThreat,
      breakageImpact: dictEntry.breakageImpact,
    };
  }

  const lower = name.toLowerCase();
  const isTrackerLike = TRACKER_PATTERNS.some(pattern => pattern.test(lower));

  let category;
  let purpose;
  let privacyThreat;

  if (isTrackerLike) {
    category = 'Suspected Identity/Tracker';
    purpose = "This cookie's name suggests it may assign a unique identifier for tracking, analytics, or attribution, though its specific function could not be verified.";
    privacyThreat = cookie.riskLevel === 'high' ? 'high' : 'medium';
  } else if (cookie.isThirdParty) {
    category = 'Third-Party / Embedded Content';
    purpose = 'Set by an embedded third-party resource (such as an ad, widget, or script) on this page rather than by the site itself.';
    privacyThreat = cookie.riskLevel || 'medium';
  } else {
    category = 'First-Party / Site Functionality';
    purpose = "Set directly by this site. Its specific purpose could not be automatically determined — review the technical flags below for more context.";
    privacyThreat = cookie.riskLevel || 'low';
  }

  return {
    displayName: null,
    owner: null,
    category,
    purpose,
    privacyThreat,
    breakageImpact: inferBreakageImpact(lower, cookie.isThirdParty),
  };
}

const PRIVACY_THREAT_MEANING = {
  low: 'This cookie does not track your personal identity, browsing history, or ad preferences across the web.',
  medium: 'This cookie may be used to analyze your behavior on this site or link your activity across browsing sessions.',
  high: 'This cookie is likely used to track your identity or behavior across multiple websites for advertising or profiling.',
};

const BREAKAGE_IMPACT_MEANING = {
  low: 'Deleting or blocking this cookie is unlikely to affect your experience on this site.',
  medium: 'Deleting or blocking this cookie may reset preferences or break minor features on this site.',
  high: 'Deleting or blocking this cookie will likely interrupt your session, cart, or in-progress activity.',
  critical: 'Deleting or blocking this cookie will directly break the site. Expect endless CAPTCHAs or immediate access denial.',
};

export function getPrivacyThreatMeaning(level) {
  return PRIVACY_THREAT_MEANING[level] || PRIVACY_THREAT_MEANING.medium;
}

export function getBreakageImpactMeaning(level) {
  return BREAKAGE_IMPACT_MEANING[level] || BREAKAGE_IMPACT_MEANING.medium;
}

// Decodes the raw boolean/enum security flags into user-facing status indicators:
// { level: 'safe'|'info'|'warning'|'critical', label, implication }
export function decodeFlags(cookie) {
  const flags = [];

  if (!cookie.secure && !cookie.httpOnly) {
    flags.push({
      level: 'critical',
      label: 'Critical Transport Risk',
      implication: 'This cookie is both unencrypted and accessible to JavaScript — the most exposed combination possible. It can be stolen via network interception or a Cross-Site Scripting (XSS) attack.',
    });
  }

  if (cookie.httpOnly) {
    flags.push({
      level: 'safe',
      label: 'Script-Protected',
      implication: 'Malicious JavaScript running on this page cannot read or steal this cookie. Safe from standard Cross-Site Scripting (XSS) data leaks.',
    });
  } else {
    flags.push({
      level: 'warning',
      label: 'Script-Accessible',
      implication: 'This cookie can be read by JavaScript on the page, including any malicious scripts injected via XSS.',
    });
  }

  if (cookie.secure) {
    flags.push({
      level: 'safe',
      label: 'Encrypted Transit',
      implication: 'This cookie is only sent over HTTPS connections, protecting it from interception on insecure networks.',
    });
  } else {
    flags.push({
      level: 'warning',
      label: 'Insecure Transmission',
      implication: 'This cookie can be sent over unencrypted HTTP connections. Highly vulnerable to interception if you are using unencrypted public Wi-Fi networks.',
    });
  }

  const sameSite = (cookie.sameSite || '').toLowerCase();
  if (sameSite === 'strict') {
    flags.push({
      level: 'safe',
      label: 'Strict Cross-Site Policy',
      implication: 'Never sent on cross-site requests, providing strong protection against cross-site request forgery (CSRF).',
    });
  } else if (sameSite === 'lax') {
    flags.push({
      level: 'info',
      label: 'Lax Cross-Site Policy',
      implication: 'Sent on top-level navigations from other sites but blocked in most embedded cross-site contexts — a reasonable default.',
    });
  } else if (sameSite === 'no_restriction' || sameSite === 'none') {
    flags.push({
      level: 'warning',
      label: 'Unrestricted Cross-Site',
      implication: 'Explicitly allowed on all cross-site requests, including embedded iframes. Required for some integrations but increases tracking surface.',
    });
  } else {
    flags.push({
      level: 'warning',
      label: 'Cross-Site Vulnerable',
      implication: 'The domain has not specified a cross-site policy. Depending on your browser, this cookie may leak during cross-site navigations.',
    });
  }

  if (cookie.isPartitioned) {
    flags.push({
      level: 'safe',
      label: 'Storage-Isolated',
      implication: 'This cookie is isolated to this top-level site (CHIPS), preventing it from being used to track you across different websites even when embedded.',
    });
  } else {
    flags.push({
      level: 'info',
      label: 'Shared Context',
      implication: 'This cookie is tied to a global browser profile context rather than isolated strictly to this specific top-level domain.',
    });
  }

  if (cookie.isThirdParty) {
    flags.push({
      level: 'warning',
      label: 'Cross-Site Origin',
      implication: "Set by an embedded resource (iframe or script) from a different domain than the one you're visiting — a common tracking pattern.",
    });
  } else {
    flags.push({
      level: 'safe',
      label: 'First-Party Origin',
      implication: 'Set directly by the site you intended to visit, not injected by an embedded external iframe or cross-site tracker.',
    });
  }

  return flags;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

function formatDuration(ms) {
  if (ms < HOUR) {
    const minutes = Math.max(1, Math.round(ms / MINUTE));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (ms < YEAR) {
    const days = Math.round(ms / DAY);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const years = Math.round((ms / YEAR) * 10) / 10;
  return `${years} year${years === 1 ? '' : 's'}`;
}

export function getLifespanText(cookie) {
  if (cookie.session) {
    return 'Session cookie (expires when the browser closes)';
  }
  if (!cookie.expirationDate) {
    return 'Persistent (expiration unknown)';
  }
  const msRemaining = cookie.expirationDate * 1000 - Date.now();
  if (msRemaining <= 0) {
    return 'Persistent (already expired, awaiting cleanup)';
  }
  return `Persistent (expires in ${formatDuration(msRemaining)})`;
}

export function getChurnText(changeCount) {
  if (!changeCount || changeCount <= 1) {
    return 'Stable (set once)';
  }
  if (changeCount < 10) {
    return `Modified ${changeCount} times`;
  }
  return `Modified ${changeCount} times — active behavior logging occurring`;
}

export function getDeleteWarning(insights) {
  switch (insights.breakageImpact) {
    case 'critical':
      return 'One-time deletion will instantly force this site to re-verify your browser or session on your next request — expect a logout, a new CAPTCHA, or a bot check.';
    case 'high':
      return 'Deleting this cookie will likely interrupt your current session, cart, or in-progress transaction.';
    case 'medium':
      return 'Deleting this cookie may reset saved preferences or settings on this site.';
    default:
      return 'Deleting this cookie is unlikely to affect your browsing experience.';
  }
}

export function getBlockWarning(insights, domain) {
  switch (insights.breakageImpact) {
    case 'critical':
      return `Danger: continuously dropping this cookie will likely block you from accessing ${domain} until it is unblocked.`;
    case 'high':
      return `Blocking ${domain} will likely interrupt logins, carts, or in-progress transactions on this site.`;
    case 'medium':
      return `Blocking ${domain} may reset saved preferences or break some features on this site.`;
    default:
      return `Blocking ${domain} is unlikely to break this site's core functionality.`;
  }
}
