const API_BASE = new URL('./api', window.location.href.replace(/[#?].*$/, '')).pathname.replace(/\/$/, '');
const UI_STORAGE_KEY = 'terminal-todo-ui-v1';

const symbolPresets = {
  checkbox: { label: 'Checkbox', open: '[ ]', done: '[X]' },
  angle: { label: 'Angle', open: '>', done: '✓' },
  bullet: { label: 'Bullet', open: '•', done: '◉' },
  arrow: { label: 'Arrow', open: '->', done: '=>' },
  star: { label: 'Star', open: '*', done: '✦' },
};

const defaultTheme = {
  accent: '#ff9e3d',
  background: '#101315',
  panel: '#171c1f',
  text: '#ebf2ed',
  done: '#5d7a68',
  sortOpenFirst: true,
};

const state = {
  tasks: [],
  filter: loadUiState().filter ?? 'all',
  theme: { ...defaultTheme },
  syncStatus: 'syncing...',
  syncTone: 'neutral',
  lastSyncAt: null,
};

const elements = {
  taskForm: document.querySelector('#taskForm'),
  taskInput: document.querySelector('#taskInput'),
  symbolPreset: document.querySelector('#symbolPreset'),
  customOpenSymbol: document.querySelector('#customOpenSymbol'),
  customDoneSymbol: document.querySelector('#customDoneSymbol'),
  taskColor: document.querySelector('#taskColor'),
  taskList: document.querySelector('#taskList'),
  taskCounter: document.querySelector('#taskCounter'),
  emptyState: document.querySelector('#emptyState'),
  clearDoneBtn: document.querySelector('#clearDoneBtn'),
  filters: document.querySelector('#filters'),
  clock: document.querySelector('#clock'),
  syncStatus: document.querySelector('#syncStatus'),
  template: document.querySelector('#taskItemTemplate'),
  accentColor: document.querySelector('#accentColor'),
  backgroundColor: document.querySelector('#backgroundColor'),
  panelColor: document.querySelector('#panelColor'),
  textColor: document.querySelector('#textColor'),
  doneColor: document.querySelector('#doneColor'),
  sortOpenFirst: document.querySelector('#sortOpenFirst'),
  resetThemeBtn: document.querySelector('#resetThemeBtn'),
};

init();

async function init() {
  populatePresets();
  bindEvents();
  startClock();
  syncThemeControls();
  render();
  await bootstrap();
  startAutoRefresh();
}

function populatePresets() {
  Object.entries(symbolPresets).forEach(([key, preset]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = `${preset.label} (${preset.open} / ${preset.done})`;
    elements.symbolPreset.appendChild(option);
  });
}

function bindEvents() {
  elements.taskForm.addEventListener('submit', handleAddTask);
  elements.clearDoneBtn.addEventListener('click', clearDoneTasks);
  elements.filters.addEventListener('click', handleFilterChange);
  elements.resetThemeBtn.addEventListener('click', resetTheme);

  [
    ['accentColor', 'accent'],
    ['backgroundColor', 'background'],
    ['panelColor', 'panel'],
    ['textColor', 'text'],
    ['doneColor', 'done'],
  ].forEach(([elementKey, themeKey]) => {
    elements[elementKey].addEventListener('change', async (event) => {
      state.theme[themeKey] = event.target.value;
      await persistTheme();
    });
  });

  elements.sortOpenFirst.addEventListener('change', async (event) => {
    state.theme.sortOpenFirst = event.target.checked;
    await persistTheme();
  });

  window.addEventListener('focus', () => bootstrap({ silent: true }));
}

async function bootstrap(options = {}) {
  const { silent = false } = options;
  try {
    if (!silent) setSyncStatus('syncing...', 'neutral');
    const payload = await api('/bootstrap');
    state.tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    state.theme = { ...defaultTheme, ...(payload.theme ?? {}) };
    syncThemeControls();
    setSyncStatus(`sync ok${formatLastSync()}`, 'good');
    render();
  } catch (error) {
    console.error(error);
    setSyncStatus('offline / server error', 'bad');
    render();
  }
}

async function handleAddTask(event) {
  event.preventDefault();
  const text = elements.taskInput.value.trim();
  if (!text) return;

  const preset = symbolPresets[elements.symbolPreset.value] ?? symbolPresets.checkbox;
  const customOpen = elements.customOpenSymbol.value.trim();
  const customDone = elements.customDoneSymbol.value.trim();

  try {
    setSyncStatus('saving...', 'neutral');
    await api('/tasks', {
      method: 'POST',
      body: {
        text,
        color: elements.taskColor.value,
        symbols: {
          open: customOpen || preset.open,
          done: customDone || preset.done,
        },
      },
    });
    event.target.reset();
    elements.taskColor.value = state.theme.accent;
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus('save failed', 'bad');
  }
}

function handleFilterChange(event) {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  persistUiState();
  render();
}

async function clearDoneTasks() {
  try {
    setSyncStatus('cleaning...', 'neutral');
    await api('/tasks?done=1', { method: 'DELETE' });
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus('delete failed', 'bad');
  }
}

async function resetTheme() {
  state.theme = { ...defaultTheme };
  syncThemeControls();
  render();
  await persistTheme();
}

async function toggleTask(taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;

  try {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: { done: !task.done },
    });
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus('toggle failed', 'bad');
  }
}

async function deleteTask(taskId) {
  try {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus('delete failed', 'bad');
  }
}

async function updateTaskColor(taskId, color) {
  try {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: { color },
    });
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus('color failed', 'bad');
  }
}

async function persistTheme() {
  try {
    setSyncStatus('saving theme...', 'neutral');
    const payload = await api('/settings', {
      method: 'PATCH',
      body: state.theme,
    });
    state.theme = { ...defaultTheme, ...(payload.theme ?? {}) };
    syncThemeControls();
    setSyncStatus(`sync ok${formatLastSync()}`, 'good');
    render();
  } catch (error) {
    console.error(error);
    setSyncStatus('theme save failed', 'bad');
  }
}

function getVisibleTasks() {
  let tasks = [...state.tasks];

  if (state.filter === 'open') {
    tasks = tasks.filter((task) => !task.done);
  }
  if (state.filter === 'done') {
    tasks = tasks.filter((task) => task.done);
  }

  if (state.theme.sortOpenFirst) {
    tasks.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  } else {
    tasks.sort((a, b) => b.createdAt - a.createdAt);
  }

  return tasks;
}

function render() {
  applyTheme();
  renderFilters();
  renderTasks();
  elements.taskCounter.textContent = `${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}`;
  elements.syncStatus.textContent = state.syncStatus;
  elements.syncStatus.dataset.tone = state.syncTone;
}

function renderFilters() {
  elements.filters.querySelectorAll('.filter-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();
  elements.taskList.innerHTML = '';
  elements.emptyState.hidden = visibleTasks.length > 0;

  visibleTasks.forEach((task) => {
    const fragment = elements.template.content.cloneNode(true);
    const item = fragment.querySelector('.task-item');
    const toggle = fragment.querySelector('.task-toggle');
    const text = fragment.querySelector('.task-text');
    const meta = fragment.querySelector('.task-meta');
    const colorInput = fragment.querySelector('.task-color-input');
    const deleteButton = fragment.querySelector('.task-delete');

    item.classList.toggle('done', task.done);
    toggle.classList.toggle('done', task.done);
    toggle.textContent = task.done ? task.symbols.done : task.symbols.open;
    toggle.style.borderColor = `${task.color}55`;
    toggle.style.color = task.done ? 'var(--done)' : task.color;
    toggle.addEventListener('click', () => toggleTask(task.id));

    text.textContent = task.text;

    meta.textContent = `${task.done ? 'done' : 'open'} • ${formatDate(task.createdAt)}`;
    meta.style.borderColor = `${task.color}44`;
    meta.style.color = task.done ? 'var(--done)' : task.color;
    meta.style.background = `${task.color}14`;

    colorInput.value = task.color;
    colorInput.addEventListener('change', (event) => updateTaskColor(task.id, event.target.value));

    deleteButton.addEventListener('click', () => deleteTask(task.id));

    elements.taskList.appendChild(fragment);
  });
}

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--bg', state.theme.background);
  root.style.setProperty('--panel', state.theme.panel);
  root.style.setProperty('--text', state.theme.text);
  root.style.setProperty('--accent', state.theme.accent);
  root.style.setProperty('--done', state.theme.done);
  root.style.setProperty('--accent-soft', `${state.theme.accent}22`);
  root.style.setProperty('--panel-border', `${state.theme.accent}33`);

  document.body.style.background = `radial-gradient(circle at top right, ${state.theme.accent}14, transparent 22%), linear-gradient(180deg, #0d1011 0%, ${state.theme.background} 100%)`;
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.style.background = `linear-gradient(180deg, ${hexToRgba(state.theme.panel, 0.92)}, ${hexToRgba(state.theme.panel, 0.82)})`;
  });
}

function syncThemeControls() {
  elements.accentColor.value = state.theme.accent;
  elements.backgroundColor.value = state.theme.background;
  elements.panelColor.value = state.theme.panel;
  elements.textColor.value = state.theme.text;
  elements.doneColor.value = state.theme.done;
  elements.sortOpenFirst.checked = Boolean(state.theme.sortOpenFirst);
  elements.taskColor.value = state.theme.accent;
}

function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

function startAutoRefresh() {
  setInterval(() => bootstrap({ silent: true }), 10000);
}

function setSyncStatus(text, tone = 'neutral') {
  state.syncStatus = text;
  state.syncTone = tone;
  if (tone === 'good') {
    state.lastSyncAt = Date.now();
  }
  render();
}

function formatLastSync() {
  if (!state.lastSyncAt) return '';
  return ` • ${new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(state.lastSyncAt))}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persistUiState() {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ filter: state.filter }));
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
