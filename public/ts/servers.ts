import { escapeHtml, sendPostRequest, initToast, showToast, toastError } from './common';

interface ServersResponse {
  servers: Array<{
    id: string | number;
    hostname: string;
    serverIP: string;
    serverPort: string | number;
    connected: boolean;
    authenticated: boolean;
  }>;
}

function fetchServers(): void {
  $.ajax({ url: '/api/servers', type: 'GET' })
    .done((data: ServersResponse) => {
      try {
        const $list = $('#serverList').empty();
        if (!data.servers || data.servers.length === 0) {
          $list.append('<div class="alert alert-secondary">No servers configured yet.</div>');
          return;
        }
        data.servers.forEach(server => {
          const hostname   = escapeHtml(server.hostname);
          const serverIP   = escapeHtml(server.serverIP);
          const serverPort = escapeHtml(server.serverPort);
          const serverId   = escapeHtml(server.id);
          const isOnline   = server.connected && server.authenticated;
          const badgeClass  = isOnline ? 'badge-connected' : 'badge-disconnected';
          const badgeLabel  = isOnline ? 'Connected' : 'Disconnected';
          const card = `
            <div class="card server-card mb-3">
              <div class="card-header">
                <h3 class="card-title">
                  <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                  ${hostname}
                </h3>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
              </div>
              <div class="card-body">
                <p class="status mb-1 server-addr-line">${serverIP}:${serverPort}</p>
                <div class="server-card-actions">
                  ${(!isOnline)
                    ? `<button
                         class="btn btn-sm btn-success reconnect-server"
                         data-server-id="${serverId}"
                       >Reconnect</button>`
                    : ''
                  }
                  <a href="/manage/${serverId}" class="btn btn-sm btn-primary">Manage</a>
                  <button
                    class="btn btn-sm btn-danger delete-server"
                    data-server-id="${serverId}"
                  >Delete</button>
                </div>
              </div>
            </div>
          `;
          $list.append(card);
        });
      } catch (renderErr) {
        console.error('Render error:', renderErr);
        showToast('Failed to render server list.', 'error');
      }
    })
    .fail((_: JQuery.jqXHR, textStatus: string, err: string) => {
      console.error('Fetch servers failed:', textStatus, err);
      showToast('Failed to load server list.', 'error');
    });
}

export function initServersPage(): void {
  initToast();
  fetchServers();
  $('#serverList')
    .on('click', '.reconnect-server', function () {
      const sid = $(this).data('server-id') as string;
      sendPostRequest('/api/reconnect-server', { server_id: sid })
        .then(() => {
          showToast('Reconnected successfully.', 'success');
          fetchServers();
        })
        .catch(toastError('Reconnect failed.'));
    })
    .on('click', '.delete-server', function () {
      const sid = $(this).data('server-id') as string;
      if (!confirm('Delete this server?')) return;
      sendPostRequest('/api/delete-server', { server_id: sid })
        .then(() => fetchServers())
        .catch(toastError('Delete failed.'));
    });
}
