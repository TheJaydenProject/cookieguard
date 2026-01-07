const COMMON_SUFFIXES = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
  'io', 'co', 'ai', 'app', 'dev',
  'co.uk', 'ac.uk', 'gov.uk', 'org.uk',
  'co.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.au', 'net.au', 'org.au', 'edu.au',
  'com.sg', 'edu.sg', 'org.sg', 'net.sg',
  'co.kr', 'ne.kr', 'or.kr',
  'com.br', 'gov.br',
  'co.in', 'net.in',
  'co.nz', 'org.nz',
  'github.io', 'gitlab.io', 'herokuapp.com',
  'azurewebsites.net', 'vercel.app', 'netlify.app'
]);

export function getETLDPlus1(hostname) {
  if (!hostname) return "unknown";
  
  const host = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  const parts = host.toLowerCase().split('.');

  if (parts.length <= 1) return host;
  
  const threePart = parts.slice(-3).join('.');
  if (COMMON_SUFFIXES.has(threePart)) {
    return parts.slice(-4).join('.');
  }

  const twoPart = parts.slice(-2).join('.');
  if (COMMON_SUFFIXES.has(twoPart)) {
    return parts.slice(-3).join('.');
  }
  
  return parts.slice(-2).join('.');
}

export function isThirdParty(cookieDomain, tabUrl) {
  try {
    if (!tabUrl || tabUrl.startsWith('chrome:') || tabUrl.startsWith('about:') || tabUrl.startsWith('moz-extension:')) {
      return false;
    }

    const tabHost = new URL(tabUrl).hostname;
    const cleanCookieDomain = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;

    const tabETLD = getETLDPlus1(tabHost);
    const cookieETLD = getETLDPlus1(cleanCookieDomain);

    return tabETLD !== cookieETLD;
  } catch (e) {
    return true; 
  }
}