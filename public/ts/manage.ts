import { escapeHtml, sendPostRequest, initToast, showToast, toastError, withLoading } from './common';

interface GameModesResponse {
  gameModes: string[];
}

interface MapsResponse {
  maps: string[];
}

interface LiveStatusResponse {
  map?: string;
  humans?: number;
  bots?: number;
  last_game_type?: string;
  last_game_mode?: string;
}

function setToggleActive(groupKey: string, val: number): void {
  $(`[data-toggle-group="${groupKey}"]`).each(function () {
    const btnVal = parseInt($(this).data('toggle-val') as string, 10);
    if (btnVal === val) {
      $(this).removeClass('btn-outline-info').addClass('btn-info');
    } else {
      $(this).removeClass('btn-info').addClass('btn-outline-info');
    }
  });
}

function setPresetActive(containerSel: string, activeId: string): void {
  $(`${containerSel} .btn`).removeClass('btn-active');
  $(activeId).addClass('btn-active');
}

function bindToggle(key: string, endpoint: string, label: string): void {
  $(`#${key}_on`).click(() =>
    sendPostRequest(`/api/${endpoint}`, { server_id: window.server_id, value: 1 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 1); })
      .catch(toastError(`${label} On failed.`)),
  );
  $(`#${key}_off`).click(() =>
    sendPostRequest(`/api/${endpoint}`, { server_id: window.server_id, value: 0 })
      .then(d => { showToast(d.message, 'success'); setToggleActive(key, 0); })
      .catch(toastError(`${label} Off failed.`)),
  );
}

function bindPreset(
  values: number[],
  endpoint: string,
  containerSel: string,
  idPrefix: string,
  label: string,
): void {
  values.forEach(v => {
    $(`#${idPrefix}${v}`).click(() =>
      sendPostRequest(`/api/${endpoint}`, { server_id: window.server_id, value: v })
        .then(d => { showToast(d.message, 'success'); setPresetActive(containerSel, `#${idPrefix}${v}`); })
        .catch(toastError(`${label} failed.`)),
    );
  });
}

export function initManagePage(): void {
  initToast();

  let currentOtMaxrounds = 6;

  const $gameType  = $('#gameType');
  const $gameMode  = $('#gameMode');
  const $mapSelect = $('#selectedMap');

  async function loadGameModes(type: string): Promise<void> {
    try {
      const resp = await fetch(`/api/game-types/${encodeURIComponent(type)}/game-modes`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const { gameModes: modes } = await resp.json() as GameModesResponse;
      $gameMode.empty();
      if (modes.length) {
        modes.forEach(m => $gameMode.append(`<option>${escapeHtml(m)}</option>`));
        await loadMaps(type, modes[0]);
      } else {
        $gameMode.append('<option disabled>No game modes available</option>');
        $mapSelect.empty().append('<option disabled>No maps available</option>');
      }
    } catch (err) {
      console.error('loadGameModes error:', err);
      showToast('Failed to load game modes.', 'error');
    }
  }

  async function loadMaps(type: string, mode: string): Promise<void> {
    try {
      const resp = await fetch(
        `/api/game-types/${encodeURIComponent(type)}/game-modes/${encodeURIComponent(mode)}/maps`,
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const { maps } = await resp.json() as MapsResponse;
      $mapSelect.empty();
      if (maps.length) {
        maps.forEach(m => $mapSelect.append(`<option>${escapeHtml(m)}</option>`));
      } else {
        $mapSelect.append('<option disabled>No maps available</option>');
      }
    } catch (err) {
      console.error('loadMaps error:', err);
      showToast('Failed to load maps.', 'error');
    }
  }

  void loadGameModes($gameType.val() as string);
  $gameType.on('change', () => { void loadGameModes($gameType.val() as string); });
  $gameMode.on('change', () => { void loadMaps($gameType.val() as string, $gameMode.val() as string); });

  // --- Quick Commands ---
  const quickCommands: Array<{ selector: string; endpoint: string }> = [
    { selector: '#scramble_teams', endpoint: '/api/scramble-teams' },
    { selector: '#kick_all_bots',  endpoint: '/api/kick-all-bots' },
    { selector: '#add_bot',        endpoint: '/api/add-bot' },
    { selector: '#kill_bots',      endpoint: '/api/kill-bots' },
  ];
  quickCommands.forEach(cmd => {
    $(cmd.selector).click(() => {
      sendPostRequest(cmd.endpoint, { server_id: window.server_id })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Quick command failed.'));
    });
  });

  // --- Match Settings toggles ---
  bindToggle('limitteams', 'limitteams-toggle', 'LimitTeams');
  bindToggle('autoteam', 'autoteam-toggle', 'AutoBalance');
  bindToggle('friendlyfire', 'friendlyfire-toggle', 'FriendlyFire');
  bindToggle('autokick', 'autokick-toggle', 'AutoKick');

  // --- Practice Controls toggles ---
  bindToggle('cheats', 'cheats-toggle', 'Cheats');
  bindToggle('free_armor', 'free-armor-toggle', 'Free Armor');
  bindToggle('buy_anywhere', 'buy-anywhere-toggle', 'Buy Anywhere');
  bindToggle('grenade_trail', 'grenade-trajectory-toggle', 'Grenade Trail');
  bindToggle('show_impacts', 'show-impacts-toggle', 'Show Impacts');

  $('#respawn_on').click(() =>
    sendPostRequest('/api/respawn-toggle', { server_id: window.server_id, value: 1 })
      .then(d => { showToast(d.message, 'success'); setToggleActive('respawn', 1); })
      .catch(toastError('Respawn On failed.')),
  );
  $('#respawn_off').click(() =>
    sendPostRequest('/api/respawn-toggle', { server_id: window.server_id, value: 0 })
      .then(d => { showToast(d.message, 'success'); setToggleActive('respawn', 0); })
      .catch(toastError('Respawn Off failed.')),
  );

  // --- Practice presets ---
  bindPreset([0, 1, 2], 'infinite-ammo-toggle', '#inf-ammo-presets', 'inf_ammo_', 'Infinite ammo');
  bindPreset([0, 5, 10, 15, 20], 'set-freezetime', '#freezetime-presets', 'freezetime_', 'Freeze time');
  bindPreset([0, 800, 1600, 3200, 16000], 'set-startmoney', '#startmoney-presets', 'startmoney_', 'Start money');
  bindPreset([0, 1, 2, 3], 'bot-difficulty', '#bot-difficulty-presets', 'bot_difficulty_', 'Bot difficulty');
  bindPreset([1, 2, 5, 60], 'set-roundtime', '#roundtime-presets', 'roundtime_', 'Round time');

  // --- Per-team bot controls ---
  const botCmds: Array<{ id: string; endpoint: string }> = [
    { id: 'bot_add_ct',  endpoint: '/api/bot-add-ct' },
    { id: 'bot_add_t',   endpoint: '/api/bot-add-t' },
    { id: 'bot_kick_ct', endpoint: '/api/bot-kick-ct' },
    { id: 'bot_kick_t',  endpoint: '/api/bot-kick-t' },
  ];
  botCmds.forEach(cmd => {
    $(`#${cmd.id}`).click(() =>
      sendPostRequest(cmd.endpoint, { server_id: window.server_id })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Bot action failed.')),
    );
  });

  // --- Give Nade Kit ---
  const nadeMap: Record<string, string> = {
    give_flash:   'weapon_flashbang',
    give_smoke:   'weapon_smokegrenade',
    give_he:      'weapon_hegrenade',
    give_molotov: 'weapon_molotov',
    give_decoy:   'weapon_decoy',
    give_incen:   'weapon_incgrenade',
  };
  Object.keys(nadeMap).forEach(id => {
    $(`#${id}`).click(() =>
      sendPostRequest('/api/give-weapon', { server_id: window.server_id, weapon: nadeMap[id] })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Give weapon failed.')),
    );
  });

  // --- Scrim Controls ---
  bindPreset([16, 24, 30], 'set-maxrounds', '#maxrounds-presets', 'maxrounds_', 'Max rounds');

  [3, 5, 6].forEach(n => {
    $(`#ot_rounds_${n}`).click(() => {
      currentOtMaxrounds = n;
      setPresetActive('#ot-rounds-presets', `#ot_rounds_${n}`);
    });
  });

  $('#overtime_on').click(() =>
    sendPostRequest('/api/set-overtime', { server_id: window.server_id, enable: 1, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 1); })
      .catch(toastError('Overtime On failed.')),
  );
  $('#overtime_off').click(() =>
    sendPostRequest('/api/set-overtime', { server_id: window.server_id, enable: 0, ot_rounds: currentOtMaxrounds })
      .then(d => { showToast(d.message, 'success'); setToggleActive('overtime', 0); })
      .catch(toastError('Overtime Off failed.')),
  );

  // --- Fun Mode Controls ---
  bindPreset([400, 600, 800], 'set-gravity', '#gravity-presets', 'gravity_', 'Gravity');

  $('#reload_mode').click(() =>
    sendPostRequest('/api/reload-mode', { server_id: window.server_id })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Reload mode failed.')),
  );

  // --- Confirm-and-execute action buttons ---
  const confirmActions: Array<{ id: string; endpoint: string; prompt: string; fallback: string }> = [
    { id: 'pause_game',    endpoint: '/api/pause',       prompt: 'Pause the game?',      fallback: 'Pause failed.' },
    { id: 'unpause_game',  endpoint: '/api/unpause',     prompt: 'Unpause the game?',    fallback: 'Unpause failed.' },
    { id: 'restart_game',  endpoint: '/api/restart',     prompt: 'Restart the game?',    fallback: 'Restart failed.' },
    { id: 'start_warmup',  endpoint: '/api/start-warmup', prompt: 'Start warmup?',       fallback: 'Warmup failed.' },
    { id: 'knife_start',   endpoint: '/api/start-knife', prompt: 'Start knife round?',   fallback: 'Knife start failed.' },
    { id: 'swap_team',     endpoint: '/api/swap-team',   prompt: 'Swap teams?',          fallback: 'Swap teams failed.' },
    { id: 'go_live',       endpoint: '/api/go-live',     prompt: 'Go live?',             fallback: 'Go live failed.' },
  ];
  confirmActions.forEach(({ id, endpoint, prompt: msg, fallback }) => {
    $(`#${id}`).click(() => {
      if (!confirm(msg)) return;
      sendPostRequest(endpoint, { server_id: window.server_id })
        .then(d => showToast(d.message, 'success'))
        .catch(toastError(fallback));
    });
  });

  // --- RCON Commands & Say ---
  function sendSayMessage(): void {
    const msg = ($('#say_input').val() as string).trim();
    if (!msg) return showToast('Message cannot be empty.', 'error');
    sendPostRequest('/api/say-admin', { server_id: window.server_id, message: msg })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Failed to send message.'));
    $('#say_input').val('');
  }
  $('#say_input_btn').click(sendSayMessage);
  $('#say_input').on('keydown', (e: JQuery.KeyDownEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); sendSayMessage(); }
  });

  function sendRconCommand(): void {
    const cmd = ($('#rconInput').val() as string).trim();
    if (!cmd) return showToast('Command cannot be empty.', 'error');
    const $btn = $('#rconInputBtn');
    withLoading($btn, () =>
      sendPostRequest('/api/rcon', { server_id: window.server_id, command: cmd })
        .then(d => {
          if (d.message.includes('Response')) {
            const output = d.message.replace(/^.*Response:\s*/, '');
            const $box = $('#rconResultBox');
            const $text = $('#rconResultText');
            const timestamp = new Date().toLocaleTimeString();
            const prev = $text.text();
            const entry = `[${timestamp}] > ${cmd}\n${output}`;
            $text.text(prev ? `${prev}\n${entry}` : entry);
            $box.show();
            // Auto-scroll to bottom of RCON output
            const preEl = $text[0];
            if (preEl) preEl.scrollTop = preEl.scrollHeight;
          } else {
            showToast(d.message, 'success');
          }
        })
        .catch(toastError('RCON command failed.'))
    );
    $('#rconInput').val('');
  }
  $('#rconInputBtn').click(sendRconCommand);
  $('#rconInput').on('keydown', (e: JQuery.KeyDownEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); sendRconCommand(); }
  });

  // --- RCON Clear ---
  $('#rconClearBtn').click(() => {
    $('#rconResultText').text('');
    $('#rconResultBox').hide();
  });

  // --- Backups ---
  $('#list_backups').click(() => {
    sendPostRequest('/api/list-backups', { server_id: window.server_id })
      .then(d => showToast(d.message, 'info'))
      .catch(toastError('List backups failed.'));
  });
  $('#restore_latest_backup').click(() => {
    if (!confirm('Restore latest backup?')) return;
    sendPostRequest('/api/restore-latest-backup', { server_id: window.server_id })
      .then((d) => showToast(d.message, 'success'))
      .catch(toastError('Restore latest failed.'));
  });
  $('#restore_backup').click(() => {
    const $row = $('#restore_backup_row');
    $row.toggle();
    if ($row.is(':visible')) ($('#restore_round_input').focus() as JQuery).val('');
  });
  $('#restore_round_cancel').click(() => $('#restore_backup_row').hide());
  $('#restore_round_input').on('keydown', (e: JQuery.KeyDownEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#restore_round_submit').trigger('click'); }
  });
  $('#restore_round_submit').click(() => {
    const n = parseInt($('#restore_round_input').val() as string, 10);
    if (isNaN(n) || n < 1 || n > 99) {
      showToast('Invalid round number (1–99)', 'error');
      return;
    }
    sendPostRequest('/api/restore-round', { server_id: window.server_id, round_number: n })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Restore failed.'));
    $('#restore_backup_row').hide();
  });

  // --- Setup-game form ---
  const $deployBtn = $('#server_setup_form button[type="submit"]');
  $('#server_setup_form').submit(function (e) {
    e.preventDefault();
    const payload = {
      server_id:   window.server_id,
      team1:       $('#team1').val() as string,
      team2:       $('#team2').val() as string,
      game_type:   $('#gameType').val() as string,
      game_mode:   $('#gameMode').val() as string,
      selectedMap: $('#selectedMap').val() as string,
    };
    withLoading($deployBtn, () =>
      sendPostRequest('/api/setup-game', payload)
        .then(d => showToast(d.message, 'success'))
        .catch(toastError('Setup Game failed.'))
    );
  });

  // --- Apply plugins ---
  $('#apply_plugins').click(e => {
    e.preventDefault();
    const enable  = $('.plugin-checkbox:checked').map((_i, el) => (el as HTMLInputElement).value).get();
    const all     = window.rootPlugins.concat(window.disabledPlugins);
    const disable = all.filter(p => !enable.includes(p));
    sendPostRequest('/api/plugins/apply', { server_id: window.server_id, enable, disable })
      .then(d => showToast(d.message, 'success'))
      .catch(toastError('Plugin apply failed.'));
  });

  // --- Live Status ---
  function setEl(id: string, val: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  async function fetchLiveStatus(): Promise<void> {
    try {
      const resp = await fetch(`/api/status/${window.server_id}`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json() as LiveStatusResponse;

      setEl('live-map',       data.map            ?? '–');
      setEl('live-humans',    data.humans   != null ? String(data.humans)  : '–');
      setEl('live-bots',      data.bots     != null ? String(data.bots)    : '–');
      setEl('last-game-type', data.last_game_type  ?? '–');
      setEl('last-game-mode', data.last_game_mode  ?? '–');

      const cfgLabel = (data.last_game_type && data.last_game_mode)
        ? `${data.last_game_type} / ${data.last_game_mode}`
        : '–';
      setEl('live-active-cfg', cfgLabel);

      $('#live-status-updated').text('Last updated: ' + new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Live status error:', err);
    }
  }

  void fetchLiveStatus();
  $('#refresh_status').click(() => { void fetchLiveStatus(); });
  const liveStatusInterval = setInterval(() => { void fetchLiveStatus(); }, 30000);
  $(window).on('beforeunload', () => clearInterval(liveStatusInterval));
}
