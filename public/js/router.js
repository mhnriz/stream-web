/**
 * Simple path-based SPA router using History API.
 */

class Router {
  constructor() {
    this.routes = [];
    this.currentCleanup = null;

    window.addEventListener('popstate', () => this.resolve());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || link.target === '_blank') return;
      e.preventDefault();
      this.navigate(href);
    });
  }

  add(pattern, handler) {
    // Convert "/details/:type/:id" → regex with named groups
    const keys = [];
    const regex = new RegExp(
      '^' +
      pattern.replace(/:(\w+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$'
    );
    this.routes.push({ pattern, regex, keys, handler });
    return this;
  }

  navigate(path) {
    if (path === window.location.pathname) return;
    window.history.pushState(null, '', path);
    this.resolve();
  }

  resolve() {
    const path = window.location.pathname;

    // Cleanup previous page
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1]);
        });
        const cleanup = route.handler(params);
        if (typeof cleanup === 'function') {
          this.currentCleanup = cleanup;
        }
        this.updateActiveNav(path);
        return;
      }
    }

    // 404 fallback
    this.routes[0]?.handler({});
    this.updateActiveNav('/');
  }

  updateActiveNav(path) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      const href = item.getAttribute('href');
      if (href === path || (href !== '/' && path.startsWith(href))) {
        item.classList.add('active');
      } else if (href === '/' && path === '/') {
        item.classList.add('active');
      }
    });
  }
}

export default Router;
