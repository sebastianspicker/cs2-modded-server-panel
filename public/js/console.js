// public/js/console.js
$(document).ready(function () {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  const currentPath = window.location.pathname;

  function escapeHtml(str) {
    if (str == null) return '';
    const s = String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  //
  // === OVERVIEW PAGE: /servers ===
  //
  if (currentPath === '/servers') {
    fetchServers();
  }

  // Fetch & render server cards
  function fetchServers() {
    $.ajax({ url: '/api/servers', type: 'GET' })
      .done(data => {
        try {
          const $list = $('#serverList').empty();
          if (!data.servers || data.servers.length === 0) {
            $list.append('<div class="alert alert-secondary">No servers configured yet.</div>');
            return;
          }
          data.servers.forEach(server => {
            const hostname = escapeHtml(server.hostname);
            const serverIP = escapeHtml(server.serverIP);
            const serverPort = escapeHtml(server.serverPort);
            const rconPassword = escapeHtml(server.rconPassword);
            const serverId = escapeHtml(server.id);
            const card = `
              <div class="card server-card mb-3">
                <div class="card-header">
                  <h3 class="card-title">
                    ${hostname} (${serverIP}:${serverPort})
                  </h3>
                </div>
                <div class="card-body">
                  <div class="mb-2">
                    RCON Password:
                    <input
                      type="password"
                      class="form-control d-inline-block rcon-password-${serverId}"
                      value="${rconPassword}"
                      aria-label="RCON password"
                      disabled
                      style="width:auto;"
                    />
                    <button
                      class="btn btn-sm btn-secondary toggle-password"
                      data-server-id="${serverId}"
                      aria-label="Toggle RCON password visibility"
                    >
                      <i class="fa fa-eye" id="toggleEyeIcon-${serverId}" aria-hidden="true"></i>
                    </button>
                  </div>
                  <p class="status mb-1">
                    RCON Connected:
                    <strong>${server.connected ? 'Yes' : 'No'}</strong>
                  </p>
                  <p class="status mb-3">
                    RCON Authenticated:
                    <strong>${server.authenticated ? 'Yes' : 'No'}</strong>
                  </p>
                  ${(!server.connected || !server.authenticated)
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
            `;
            $list.append(card);
          });
        } catch (renderErr) {
          console.error('Render error:', renderErr);
          alert('Ein Fehler beim Anzeigen der Server ist aufgetreten.');
        }
      })
      .fail((_, textStatus, err) => {
        console.error('Fetch servers failed:', textStatus, err);
        alert('Konnte Serverliste nicht laden.');
      });
  }

  //
  // === DELEGATED EVENT HANDLERS FOR OVERVIEW ===
  //
  $('#serverList')
    .on('click', '.toggle-password', function () {
      const sid    = $(this).data('server-id');
      const $input = $(`.rcon-password-${sid}`);
      const $icon  = $(`#toggleEyeIcon-${sid}`);
      if ($input.attr('type') === 'password') {
        $input.attr('type', 'text');
        $icon.removeClass('fa-eye').addClass('fa-eye-slash');
      } else {
        $input.attr('type', 'password');
        $icon.removeClass('fa-eye-slash').addClass('fa-eye');
      }
    })
    .on('click', '.reconnect-server', function () {
      const sid = $(this).data('server-id');
      sendPostRequest('/api/reconnect-server', { server_id: sid })
        .then(() => {
          alert('Reconnected successfully');
          fetchServers();
        })
        .catch(() => alert('Reconnect fehlgeschlagen.'));
    })
    .on('click', '.delete-server', function () {
      const sid = $(this).data('server-id');
      if (!confirm('Server wirklich löschen?')) return;
      sendPostRequest('/api/delete-server', { server_id: sid })
        .then(() => fetchServers())
        .catch(() => alert('Löschen fehlgeschlagen.'));
    });

  //
  // === MANAGE PAGE: /manage/:id ===
  //
  if (currentPath.startsWith('/manage/')) {
    // --- Helpers to load game types/maps ---
    const $gameType  = $('#gameType');
    const $gameMode  = $('#gameMode');
    const $mapSelect = $('#selectedMap');

    async function loadGameModes(type) {
      try {
        const resp = await fetch(`/api/game-types/${encodeURIComponent(type)}/game-modes`);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const { gameModes: modes } = await resp.json();
        $gameMode.empty();
        if (modes.length) {
          modes.forEach(m => $gameMode.append(`<option>${m}</option>`));
          loadMaps(type, modes[0]);
        } else {
          $gameMode.append('<option disabled>Keine Spielmodi verfügbar</option>');
          $mapSelect.empty().append('<option disabled>Keine Karten verfügbar</option>');
        }
      } catch (err) {
        console.error('loadGameModes error:', err);
        alert('Konnte Spielmodi nicht laden.');
      }
    }

    async function loadMaps(type, mode) {
      try {
        const resp = await fetch(
          `/api/game-types/${encodeURIComponent(type)}/game-modes/${encodeURIComponent(mode)}/maps`
        );
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const { maps } = await resp.json();
        $mapSelect.empty();
        if (maps.length) {
          maps.forEach(m => $mapSelect.append(`<option>${m}</option>`));
        } else {
          $mapSelect.append('<option disabled>Keine Karten verfügbar</option>');
        }
      } catch (err) {
        console.error('loadMaps error:', err);
        alert('Konnte Karten nicht laden.');
      }
    }

    // initial
    loadGameModes($gameType.val());
    $gameType.on('change', () => loadGameModes($gameType.val()));
    $gameMode.on('change', () => loadMaps($gameType.val(), $gameMode.val()));

    // --- New Quick Commands ---
    const quickCommands = [
      { selector: '#scramble_teams',     endpoint: '/api/scramble-teams' },
      { selector: '#kick_all_bots',      endpoint: '/api/kick-all-bots' },
      { selector: '#add_bot',            endpoint: '/api/add-bot' },
      { selector: '#kill_bots',          endpoint: '/api/kill-bots' },
    ];

    quickCommands.forEach(cmd => {
      $(cmd.selector).click(() => {
        sendPostRequest(cmd.endpoint, { server_id: window.server_id })
          .then(d => alert(d.message))
          .catch(() => alert('Quick Command fehlgeschlagen.'));
      });
    });
    $('#limitteams_on').click(() =>
  sendPostRequest('/api/limitteams-toggle', { server_id: window.server_id, value: 1 })
    .then(d => alert(d.message))
    .catch(() => alert('LimitTeams On failed.'))
);
$('#limitteams_off').click(() =>
  sendPostRequest('/api/limitteams-toggle', { server_id: window.server_id, value: 0 })
    .then(d => alert(d.message))
    .catch(() => alert('LimitTeams Off failed.'))
);

$('#autoteam_on').click(() =>
  sendPostRequest('/api/autoteam-toggle', { server_id: window.server_id, value: 1 })
    .then(d => alert(d.message))
    .catch(() => alert('AutoBalance On failed.'))
);
$('#autoteam_off').click(() =>
  sendPostRequest('/api/autoteam-toggle', { server_id: window.server_id, value: 0 })
    .then(d => alert(d.message))
    .catch(() => alert('AutoBalance Off failed.'))
);

$('#friendlyfire_on').click(() =>
  sendPostRequest('/api/friendlyfire-toggle', { server_id: window.server_id, value: 1 })
    .then(d => alert(d.message))
    .catch(() => alert('FriendlyFire On failed.'))
);
$('#friendlyfire_off').click(() =>
  sendPostRequest('/api/friendlyfire-toggle', { server_id: window.server_id, value: 0 })
    .then(d => alert(d.message))
    .catch(() => alert('FriendlyFire Off failed.'))
);

$('#autokick_on').click(() =>
  sendPostRequest('/api/autokick-toggle', { server_id: window.server_id, value: 1 })
    .then(d => alert(d.message))
    .catch(() => alert('AutoKick On failed.'))
);
$('#autokick_off').click(() =>
  sendPostRequest('/api/autokick-toggle', { server_id: window.server_id, value: 0 })
    .then(d => alert(d.message))
    .catch(() => alert('AutoKick Off failed.'))
);

    // --- Existing Action Buttons ---
    $('#pause_game').click(() => {
      if (!confirm('Pause the game?')) return;
      sendPostRequest('/api/pause', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Pause fehlgeschlagen.'));
    });
    $('#unpause_game').click(() => {
      if (!confirm('Unpause the game?')) return;
      sendPostRequest('/api/unpause', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Unpause fehlgeschlagen.'));
    });
    $('#restart_game').click(() => {
      if (!confirm('Restart the game?')) return;
      sendPostRequest('/api/restart', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Restart fehlgeschlagen.'));
    });
    $('#start_warmup').click(() => {
      if (!confirm('Start warmup?')) return;
      sendPostRequest('/api/start-warmup', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Warmup fehlgeschlagen.'));
    });
    $('#knife_start').click(() => {
      if (!confirm('Start knife round?')) return;
      sendPostRequest('/api/start-knife', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Knife start fehlgeschlagen.'));
    });
    $('#swap_team').click(() => {
      if (!confirm('Swap teams?')) return;
      sendPostRequest('/api/swap-team', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Swap teams fehlgeschlagen.'));
    });
    $('#go_live').click(() => {
      if (!confirm('Go live?')) return;
      sendPostRequest('/api/go-live', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Go live fehlgeschlagen.'));
    });

    // --- RCON Commands & Say ---
    $('#say_input_btn').click(() => {
      const msg = $('#say_input').val().trim();
      if (!msg) return alert('Nachricht darf nicht leer sein.');
      sendPostRequest('/api/say-admin', {
        server_id: window.server_id,
        message: msg
      })
      .then(d => alert(d.message))
      .catch(() => alert('Nachricht senden fehlgeschlagen.'));
      $('#say_input').val('');
    });
    $('#rconInputBtn').click(() => {
      const cmd = $('#rconInput').val().trim();
      if (!cmd) return alert('Kommando darf nicht leer sein.');
      sendPostRequest('/api/rcon', {
        server_id: window.server_id,
        command: cmd
      })
      .then(d => {
        if (d.message.includes('Response')) {
          $('#rconResultBox').show();
          $('#rconResultText').text(d.message.replace(/^.*Response:\s*/, ''));
        } else {
          $('#rconResultBox').hide();
          alert(d.message);
        }
      })
      .catch(() => alert('RCON-Kommando fehlgeschlagen.'));
      $('#rconInput').val('');
    });

    // --- Backups ---
    $('#list_backups').click(() => {
      sendPostRequest('/api/list-backups', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('List backups failed.'));
    });
    $('#restore_latest_backup').click(() => {
      if (!confirm('Restore latest backup?')) return;
      sendPostRequest('/api/restore-latest-backup', { server_id: window.server_id })
        .then(d => alert(d.message))
        .catch(() => alert('Restore latest fehlgeschlagen.'));
    });
    $('#restore_backup').click(() => {
      const num = prompt('Enter round number to restore:');
      const n   = parseInt(num, 10);
      if (isNaN(n)) return alert('Invalid round number');
      sendPostRequest('/api/restore-round', {
        server_id: window.server_id,
        round_number: n
      })
      .then(d => alert(d.message))
      .catch(() => alert('Restore fehlgeschlagen.'));
    });

    // --- Setup‐game form handler ---
    $('#server_setup_form').submit(function (e) {
      e.preventDefault();
      const payload = {
        server_id:   window.server_id,
        team1:       $('#team1').val(),
        team2:       $('#team2').val(),
        game_type:   $('#gameType').val(),
        game_mode:   $('#gameMode').val(),
        selectedMap: $('#selectedMap').val()
      };
      sendPostRequest('/api/setup-game', payload)
        .then(d => alert(d.message))
        .catch(() => alert('Setup Game failed.'));
    });

    // --- Apply plugins override ---
    $('#apply_plugins').click(e => {
      e.preventDefault();
      const enable  = $('.plugin-checkbox:checked').map((_,el) => el.value).get();
      const all     = window.rootPlugins.concat(window.disabledPlugins);
      const disable = all.filter(p => !enable.includes(p));
      sendPostRequest('/api/plugins/apply', {
        server_id: window.server_id,
        enable,
        disable
      })
      .then(d => alert(d.message))
      .catch(() => alert('Plugin-Override via RCON fehlgeschlagen.'));
    });

    //
    // === LIVE-STATUS: nur eine einzige Funktion ===
    //
    async function fetchLiveStatus() {
      try {
        const resp = await fetch(`/api/status/${window.server_id}`);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();

        // Fünf Felder aktualisieren:
        document.getElementById('live-map').textContent       = data.map           || '–';
        document.getElementById('live-humans').textContent    = data.humans  != null ? data.humans  : '–';
        document.getElementById('live-bots').textContent      = data.bots    != null ? data.bots    : '–';
        document.getElementById('last-game-type').textContent = data.last_game_type || '–';
        document.getElementById('last-game-mode').textContent = data.last_game_mode || '–';

      } catch (err) {
        console.error('Live-Status fehlerhaft:', err);
      }
    }

    // Bei Seitenaufruf und Klick auf “Refresh”
    fetchLiveStatus();
    $('#refresh_status').click(fetchLiveStatus);
  }

  //
  // === HELPER: JSON POST ===
  //
  async function sendPostRequest(endpoint, data = {}) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });
      if (!resp.ok) {
        if (resp.status === 401) throw new Error('Unauthorized');
        throw new Error(`Status ${resp.status}`);
      }
      return await resp.json();
    } catch (err) {
      console.error(`Error POST ${endpoint}:`, err);
      throw err;
    }
  }
});
