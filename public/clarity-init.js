/*
 * Microsoft Clarity (website-usage analytics). Project "Ankiro".
 * Kept as a separate file so the site's security policy (no inline scripts) can stay strict.
 * It only runs on the live domain, so local development and preview builds are never recorded.
 * Private areas (date of birth, request form, contact form, account forms) carry data-clarity-mask="True" in the page source.
 */
;(function (c, l, a, r, i, t, y) {
  if (!/^(www\.)?ankiro\.in$/i.test(location.hostname)) return
  c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) }
  t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i
  y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y)
})(window, document, 'clarity', 'script', 'z49mhm8v45')
