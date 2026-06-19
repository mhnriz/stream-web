/**
 * Library Page — TorBox torrents and downloads
 */

import API from '../api.js?v=1.3.8';
import { renderTopBar, toast } from '../components.js?v=1.3.8';

export default async function renderLibrary(container, router) {
  container.innerHTML = renderTopBar('Library', 'Your TorBox downloads');

  const content = document.createElement('div');
  content.className = 'fade-in';
  content.style.padding = '24px 48px';
  content.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:40px"><div class="loader-ring" style="margin:0 auto"><div></div><div></div><div></div></div><p style="margin-top:12px">Loading library...</p></div>';
  container.appendChild(content);

  try {
    const torrents = await API.getLibrary();

    if (!torrents.length) {
      content.innerHTML = `
        <div class="watchlist-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <h3>Library is empty</h3>
          <p>Torrents you play will appear here.</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-family:var(--font-display);font-weight:700">${torrents.length} item${torrents.length !== 1 ? 's' : ''}</h3>
        <div class="status-badge">
          <span>📦</span>
          <span>${torrents.length} Cached</span>
        </div>
      </div>
      <div class="streams-list">
        ${torrents.map(t => {
          const name = t.name || t.short_name || 'Unknown';
          const sizeGB = t.size ? (t.size / (1024*1024*1024)).toFixed(2) + ' GB' : '';
          const status = t.download_finished ? '✅ Ready' : t.download_speed ? '⬇️ Downloading' : '⏳ Pending';
          const progress = t.progress ? Math.round(t.progress * 100) : 0;

          return `
            <div class="stream-item" style="cursor:default">
              <span class="stream-quality-badge" style="background:${t.download_finished ? 'rgba(124,229,168,0.1)' : 'rgba(229,199,124,0.1)'};color:${t.download_finished ? 'var(--success)' : 'var(--warning)'}">
                ${status}
              </span>
              <div class="stream-info">
                <div class="stream-title-text">${name}</div>
                <div class="stream-meta-row">
                  ${sizeGB ? `<span>${sizeGB}</span>` : ''}
                  ${t.seeds ? `<span>👤 ${t.seeds} seeds</span>` : ''}
                  ${t.created_at ? `<span>${new Date(t.created_at).toLocaleDateString()}</span>` : ''}
                </div>
                ${!t.download_finished && progress > 0 ? `
                  <div style="margin-top:6px;height:3px;background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${progress}%;background:var(--accent);border-radius:99px;transition:width 0.3s"></div>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div class="watchlist-empty">
        <h3>Could not load library</h3>
        <p style="color:var(--text-dim)">${err.message || 'Check your TorBox API key.'}</p>
      </div>
    `;
  }

  const searchInput = container.querySelector('.search-topbar-input');
  if (searchInput) searchInput.addEventListener('focus', () => router.navigate('/search'));
}
