/**
 * HashRouter only reads location.hash. Direct hits like /gear (no hash) load index.html
 * at pathname /gear but React sees "/" — send those URLs to /#/gear (and other app paths).
 */
;(function () {
  if (location.hash && location.hash.length > 1) return

  var path = location.pathname || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  if (path === '/' || path === '/index.html') return

  if (/\.[a-z0-9]{2,8}$/i.test(path)) return
  if (
    path.indexOf('/assets/') === 0 ||
    path.indexOf('/data/') === 0 ||
    path.indexOf('/share/') === 0 ||
    path.indexOf('/og/') === 0 ||
    path.indexOf('/guidebook/') === 0
  ) {
    return
  }

  var base = ''
  var route = path
  if (path.indexOf('/Odyssey-Calc') === 0) {
    base = '/Odyssey-Calc'
    route = path.slice('/Odyssey-Calc'.length) || '/'
    if (route.length > 1 && route.endsWith('/')) route = route.slice(0, -1)
    if (route === '/' || route === '/index.html') return
  }

  var shareMatch = route.match(/^\/share\/meter-player\/([^/]+?)(?:\.html)?\/?$/i)
  if (shareMatch) {
    var key = decodeURIComponent(shareMatch[1])
    if (!/\.html$/i.test(path)) {
      location.replace(location.origin + base + '/share/meter-player/' + encodeURIComponent(key) + '.html' + location.search)
      return
    }
    location.replace(
      location.origin + base + '/#/meter/player/' + encodeURIComponent(key) + location.search,
    )
    return
  }

  location.replace(location.origin + base + '/#' + route + location.search)
})()
