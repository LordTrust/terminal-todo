const API_BASE = new URL('./api', window.location.href.replace(/[#?].*$/, '')).pathname.replace(/\/$/, '');
const UI_STORAGE_KEY = 'terminal-todo-ui-v4';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ORDINAL_LABELS = {
  1: '1.',
  2: '2.',
  3: '3.',
  4: '4.',
  '-1': 'letzter',
};

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

const defaultComposer = {
  symbolPreset: 'checkbox',
  taskColor: defaultTheme.accent,
  customOpenSymbol: '',
  customDoneSymbol: '',
  dueDate: '',
  recurrenceType: 'none',
  nthWorkday: '12',
  ordinal: '-1',
  weekday: '2',
  monthDay: '1',
  monthDayShift: 'none',
  daysBeforeEnd: '3',
  daysBeforeEndShift: 'none',
};

const uiState = loadUiState();

const state = {
  tasks: [],
  filter: uiState.filter ?? 'all',
  theme: { ...defaultTheme },
  syncStatus: 'syncing...',
  syncTone: 'neutral',
  lastSyncAt: null,
  menuOpen: false,
  editingTaskId: null,
  composer: { ...defaultComposer, ...(uiState.composer ?? {}) },
  calendar: {
    selectedDate: uiState.selectedDate ?? toIsoDate(new Date()),
    currentMonth: startOfMonth(parseIsoDate(uiState.selectedDate ?? toIsoDate(new Date()))),
  },
};

const elements = {
  taskForm: document.querySelector('#taskForm'),
  taskInput: document.querySelector('#taskInput'),
  composerSubmitBtn: document.querySelector('#composerSubmitBtn'),
  cancelEditBtn: document.querySelector('#cancelEditBtn'),
  composerMeta: document.querySelector('#composerMeta'),
  editModeBadge: document.querySelector('#editModeBadge'),
  symbolPreset: document.querySelector('#symbolPreset'),
  customOpenSymbol: document.querySelector('#customOpenSymbol'),
  customDoneSymbol: document.querySelector('#customDoneSymbol'),
  taskColor: document.querySelector('#taskColor'),
  dueDateInput: document.querySelector('#dueDateInput'),
  recurrenceType: document.querySelector('#recurrenceType'),
  nthWorkdayInput: document.querySelector('#nthWorkdayInput'),
  ordinalSelect: document.querySelector('#ordinalSelect'),
  weekdaySelect: document.querySelector('#weekdaySelect'),
  monthDayInput: document.querySelector('#monthDayInput'),
  monthDayShift: document.querySelector('#monthDayShift'),
  daysBeforeEndInput: document.querySelector('#daysBeforeEndInput'),
  daysBeforeEndShift: document.querySelector('#daysBeforeEndShift'),
  nthWorkdayRow: document.querySelector('#nthWorkdayRow'),
  lastWorkdayRow: document.querySelector('#lastWorkdayRow'),
  ordinalWeekdayRow: document.querySelector('#ordinalWeekdayRow'),
  monthDayRow: document.querySelector('#monthDayRow'),
  daysBeforeEndRow: document.querySelector('#daysBeforeEndRow'),
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
  menuToggleBtn: document.querySelector('#menuToggleBtn'),
  menuCloseBtn: document.querySelector('#menuCloseBtn'),
  settingsDrawer: document.querySelector('#settingsDrawer'),
  drawerBackdrop: document.querySelector('#drawerBackdrop'),
  miniWeekdays: document.querySelector('#miniWeekdays'),
  calendarWeekdays: document.querySelector('#calendarWeekdays'),
  miniCalendarGrid: document.querySelector('#miniCalendarGrid'),
  calendarGrid: document.querySelector('#calendarGrid'),
  miniMonthLabel: document.querySelector('#miniMonthLabel'),
  currentMonthLabel: document.querySelector('#currentMonthLabel'),
  miniPrevBtn: document.querySelector('#miniPrevBtn'),
  miniNextBtn: document.querySelector('#miniNextBtn'),
  prevMonthBtn: document.querySelector('#prevMonthBtn'),
  nextMonthBtn: document.querySelector('#nextMonthBtn'),
  jumpTodayBtn: document.querySelector('#jumpTodayBtn'),
  selectedDateLabel: document.querySelector('#selectedDateLabel'),
  selectedDateEvents: document.querySelector('#selectedDateEvents'),
  monthEventList: document.querySelector('#monthEventList'),
};

init();

async function init() {
  populatePresets();
  renderWeekdayHeaders();
  bindEvents();
  startClock();
  syncThemeControls();
  syncComposerControls();
  syncRecurrenceVisibility();
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

function renderWeekdayHeaders() {
  [elements.miniWeekdays, elements.calendarWeekdays].forEach((container) => {
    container.innerHTML = '';
    WEEKDAY_LABELS.forEach((label) => {
      const node = document.createElement('div');
      node.className = 'weekday-pill';
      node.textContent = label;
      container.appendChild(node);
    });
  });
}

function bindEvents() {
  elements.taskForm.addEventListener('submit', handleSubmitTask);
  elements.cancelEditBtn.addEventListener('click', cancelEditing);
  elements.clearDoneBtn.addEventListener('click', clearDoneTasks);
  elements.filters.addEventListener('click', handleFilterChange);
  elements.resetThemeBtn.addEventListener('click', resetTheme);
  elements.menuToggleBtn.addEventListener('click', () => toggleMenu());
  elements.menuCloseBtn.addEventListener('click', () => toggleMenu(false));
  elements.drawerBackdrop.addEventListener('click', () => toggleMenu(false));
  elements.miniPrevBtn.addEventListener('click', () => shiftCalendarMonth(-1));
  elements.miniNextBtn.addEventListener('click', () => shiftCalendarMonth(1));
  elements.prevMonthBtn.addEventListener('click', () => shiftCalendarMonth(-1));
  elements.nextMonthBtn.addEventListener('click', () => shiftCalendarMonth(1));
  elements.jumpTodayBtn.addEventListener('click', () => focusDate(toIsoDate(new Date())));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.menuOpen) {
      toggleMenu(false);
    }
  });

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

  [
    ['symbolPreset', 'symbolPreset'],
    ['taskColor', 'taskColor'],
    ['customOpenSymbol', 'customOpenSymbol'],
    ['customDoneSymbol', 'customDoneSymbol'],
    ['dueDateInput', 'dueDate'],
    ['recurrenceType', 'recurrenceType'],
    ['nthWorkdayInput', 'nthWorkday'],
    ['ordinalSelect', 'ordinal'],
    ['weekdaySelect', 'weekday'],
    ['monthDayInput', 'monthDay'],
    ['monthDayShift', 'monthDayShift'],
    ['daysBeforeEndInput', 'daysBeforeEnd'],
    ['daysBeforeEndShift', 'daysBeforeEndShift'],
  ].forEach(([elementKey, composerKey]) => {
    const handler = (event) => {
      state.composer[composerKey] = event.target.value;
      persistUiState();
      if (composerKey === 'recurrenceType') syncRecurrenceVisibility();
      renderComposerState();
    };
    elements[elementKey].addEventListener('input', handler);
    elements[elementKey].addEventListener('change', handler);
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
    syncComposerControls();
    setSyncStatus(`sync ok${formatLastSync()}`, 'good');
    render();
  } catch (error) {
    console.error(error);
    setSyncStatus('offline / server error', 'bad');
    render();
  }
}

async function handleSubmitTask(event) {
  event.preventDefault();
  const text = elements.taskInput.value.trim();
  if (!text) return;

  const payload = buildTaskPayload(text);

  try {
    setSyncStatus(state.editingTaskId ? 'updating...' : 'saving...', 'neutral');
    if (state.editingTaskId) {
      await api(`/tasks/${state.editingTaskId}`, {
        method: 'PATCH',
        body: payload,
      });
    } else {
      await api('/tasks', {
        method: 'POST',
        body: payload,
      });
    }

    resetComposer();
    await bootstrap({ silent: true });
  } catch (error) {
    console.error(error);
    setSyncStatus(error.message || 'save failed', 'bad');
  }
}

function buildTaskPayload(text) {
  const preset = symbolPresets[state.composer.symbolPreset] ?? symbolPresets.checkbox;
  const customOpen = state.composer.customOpenSymbol.trim();
  const customDone = state.composer.customDoneSymbol.trim();
  const recurrence = buildRecurrencePayload();
  const dueDate = recurrence ? (state.composer.dueDate || toIsoDate(new Date())) : (state.composer.dueDate || null);

  return {
    text,
    color: state.composer.taskColor,
    dueDate,
    recurrence,
    symbols: {
      open: customOpen || preset.open,
      done: customDone || preset.done,
    },
  };
}

function buildRecurrencePayload() {
  const kind = state.composer.recurrenceType;
  if (!kind || kind === 'none') return null;

  if (kind === 'monthly_nth_workday') {
    return { kind, nth: Number(state.composer.nthWorkday || 1) };
  }
  if (kind === 'monthly_last_workday') {
    return { kind };
  }
  if (kind === 'monthly_ordinal_weekday') {
    return {
      kind,
      ordinal: Number(state.composer.ordinal || -1),
      weekday: Number(state.composer.weekday || 0),
    };
  }
  if (kind === 'monthly_day_of_month') {
    return {
      kind,
      day: Number(state.composer.monthDay || 1),
      shift: state.composer.monthDayShift || 'none',
    };
  }
  if (kind === 'monthly_days_before_month_end') {
    return {
      kind,
      daysBefore: Number(state.composer.daysBeforeEnd || 0),
      shift: state.composer.daysBeforeEndShift || 'none',
    };
  }
  return null;
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

function toggleMenu(forceState) {
  state.menuOpen = typeof forceState === 'boolean' ? forceState : !state.menuOpen;
  elements.settingsDrawer.classList.toggle('open', state.menuOpen);
  elements.drawerBackdrop.hidden = !state.menuOpen;
  document.body.classList.toggle('drawer-open', state.menuOpen);
  elements.settingsDrawer.setAttribute('aria-hidden', String(!state.menuOpen));
  elements.menuToggleBtn.setAttribute('aria-expanded', String(state.menuOpen));
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
    setSyncStatus(error.message || 'toggle failed', 'bad');
  }
}

async function deleteTask(taskId) {
  if (state.editingTaskId === taskId) {
    resetComposer();
  }

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

  tasks.sort(compareTasks);
  return tasks;
}

function compareTasks(a, b) {
  if (state.theme.sortOpenFirst && a.done !== b.done) {
    return Number(a.done) - Number(b.done);
  }

  const aDue = a.dueDate ? parseIsoDate(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? parseIsoDate(b.dueDate).getTime() : Number.POSITIVE_INFINITY;

  if (aDue !== bDue) return aDue - bDue;
  return b.createdAt - a.createdAt;
}

function render() {
  applyTheme();
  renderComposerState();
  renderFilters();
  renderTasks();
  renderCalendars();
  elements.taskCounter.textContent = `${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}`;
  elements.syncStatus.textContent = state.syncStatus;
  elements.syncStatus.dataset.tone = state.syncTone;
}

function renderComposerState() {
  const editing = Boolean(state.editingTaskId);
  elements.taskForm.classList.toggle('editing', editing);
  elements.editModeBadge.hidden = !editing;
  elements.cancelEditBtn.hidden = !editing;
  elements.composerSubmitBtn.textContent = editing ? '✓' : '+';
  elements.composerSubmitBtn.setAttribute('aria-label', editing ? 'Task aktualisieren' : 'Task hinzufügen');

  const recurrence = buildRecurrencePayload();
  const dueText = state.composer.dueDate ? `Datum: ${formatDateOnly(state.composer.dueDate)}` : 'kein Datum';
  const recurrenceText = recurrence ? formatRecurrence(recurrence) : 'ohne Wiederholung';
  elements.composerMeta.textContent = editing
    ? `Bearbeite Task • ${dueText} • ${recurrenceText}`
    : `${dueText} • ${recurrenceText}`;
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
    const recurringBadge = fragment.querySelector('.recurring-badge');
    const overdueBadge = fragment.querySelector('.overdue-badge');
    const colorInput = fragment.querySelector('.task-color-input');
    const jumpButton = fragment.querySelector('.task-jump');
    const editButton = fragment.querySelector('.task-edit');
    const deleteButton = fragment.querySelector('.task-delete');

    const overdue = isTaskOverdue(task);

    item.classList.toggle('done', task.done);
    item.classList.toggle('overdue', overdue);
    toggle.classList.toggle('done', task.done);
    toggle.textContent = task.done ? task.symbols.done : task.symbols.open;
    toggle.style.borderColor = `${task.color}55`;
    toggle.style.color = task.done ? 'var(--done)' : task.color;
    toggle.title = task.recurrence ? 'Als erledigt markieren, nächste Fälligkeit wird gesetzt' : 'Task umschalten';
    toggle.addEventListener('click', () => toggleTask(task.id));

    text.textContent = task.text;

    recurringBadge.hidden = !task.recurrence;
    overdueBadge.hidden = !overdue;

    const metaParts = [task.done ? 'done' : 'open'];
    if (task.dueDate) metaParts.push(`fällig ${formatDateOnly(task.dueDate)}`);
    if (task.recurrence) metaParts.push(formatRecurrence(task.recurrence));
    if (task.lastCompletedAt) metaParts.push(`zuletzt ${formatDate(task.lastCompletedAt)}`);
    if (!task.dueDate) metaParts.push(formatDate(task.createdAt));

    meta.textContent = metaParts.join(' • ');
    meta.style.borderColor = `${task.color}44`;
    meta.style.color = overdue ? 'var(--danger)' : (task.done ? 'var(--done)' : task.color);
    meta.style.background = overdue ? 'rgba(255, 107, 107, 0.08)' : `${task.color}14`;

    colorInput.value = task.color;
    colorInput.addEventListener('change', (event) => updateTaskColor(task.id, event.target.value));

    jumpButton.hidden = !task.dueDate;
    if (task.dueDate) {
      jumpButton.addEventListener('click', () => focusDate(task.dueDate));
    }

    editButton.addEventListener('click', () => startEditing(task.id));
    deleteButton.addEventListener('click', () => deleteTask(task.id));

    elements.taskList.appendChild(fragment);
  });
}

function renderCalendars() {
  const monthDate = state.calendar.currentMonth;
  const events = getCalendarEventsForMonth(monthDate);
  const eventsByDate = groupEventsByDate(events);
  const selectedDate = parseIsoDate(state.calendar.selectedDate);

  elements.miniMonthLabel.textContent = formatMonthLabel(monthDate);
  elements.currentMonthLabel.textContent = formatMonthLabel(monthDate);

  renderCalendarGrid(elements.miniCalendarGrid, monthDate, eventsByDate, { mini: true });
  renderCalendarGrid(elements.calendarGrid, monthDate, eventsByDate, { mini: false });
  renderSelectedDateEvents(selectedDate, eventsByDate);
  renderMonthEventList(events);
}

function renderCalendarGrid(container, monthDate, eventsByDate, options = {}) {
  const { mini = false } = options;
  const cells = buildMonthCells(monthDate);
  container.innerHTML = '';

  cells.forEach((cellDate) => {
    const dateKey = toIsoDate(cellDate);
    const events = eventsByDate.get(dateKey) ?? [];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    if (!isSameMonth(cellDate, monthDate)) button.classList.add('outside');
    if (dateKey === state.calendar.selectedDate) button.classList.add('selected');
    if (isToday(cellDate)) button.classList.add('today');
    if (events.length) button.classList.add('has-events');
    button.addEventListener('click', () => focusDate(dateKey, { prefillComposer: true, openMenu: true }));

    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = String(cellDate.getDate());
    button.appendChild(dayNumber);

    const dots = document.createElement('div');
    dots.className = 'day-dots';
    events.slice(0, 4).forEach((event) => {
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      dot.style.background = event.color;
      dots.appendChild(dot);
    });
    button.appendChild(dots);

    if (!mini) {
      const stack = document.createElement('div');
      stack.className = 'day-event-stack';
      events.slice(0, 2).forEach((event) => {
        const preview = document.createElement('div');
        preview.className = 'event-preview';
        if (event.recurring) preview.classList.add('recurring');
        if (event.overdue) preview.classList.add('overdue');
        preview.style.borderLeft = `3px solid ${event.color}`;
        preview.textContent = event.recurring ? `↻ ${event.text}` : event.text;
        stack.appendChild(preview);
      });
      if (events.length > 2) {
        const more = document.createElement('div');
        more.className = 'event-preview more';
        more.textContent = `+${events.length - 2} mehr`;
        stack.appendChild(more);
      }
      button.appendChild(stack);
    }

    container.appendChild(button);
  });
}

function renderSelectedDateEvents(selectedDate, eventsByDate) {
  const selectedKey = toIsoDate(selectedDate);
  const events = eventsByDate.get(selectedKey) ?? [];
  elements.selectedDateLabel.textContent = formatDateLong(selectedKey);
  elements.selectedDateEvents.innerHTML = '';

  if (!events.length) {
    elements.selectedDateEvents.appendChild(buildEmptyState('Keine Einträge an diesem Tag.'));
    return;
  }

  events.forEach((event) => {
    elements.selectedDateEvents.appendChild(buildEventChip(event, { active: true }));
  });
}

function renderMonthEventList(events) {
  elements.monthEventList.innerHTML = '';
  if (!events.length) {
    elements.monthEventList.appendChild(buildEmptyState('Keine Einträge in diesem Monat.'));
    return;
  }

  events.forEach((event) => {
    const active = event.dateStr === state.calendar.selectedDate;
    elements.monthEventList.appendChild(buildEventChip(event, { active }));
  });
}

function buildEventChip(event, options = {}) {
  const { active = false } = options;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'event-chip';
  if (active) button.classList.add('active');
  if (event.overdue) button.classList.add('overdue');
  button.style.borderColor = `${event.color}55`;
  button.addEventListener('click', () => focusDate(event.dateStr));

  const title = document.createElement('div');
  title.className = 'event-chip-title';
  title.textContent = event.recurring ? `↻ ${event.text}` : event.text;

  const meta = document.createElement('div');
  meta.className = 'event-chip-meta';
  meta.textContent = `${formatDateLong(event.dateStr)} • ${event.metaLabel}`;

  button.appendChild(title);
  button.appendChild(meta);
  return button;
}

function buildEmptyState(text) {
  const node = document.createElement('div');
  node.className = 'event-chip-empty';
  node.textContent = text;
  return node;
}

function getCalendarEventsForMonth(monthDate) {
  return state.tasks
    .flatMap((task) => buildTaskEventsForMonth(task, monthDate))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.text.localeCompare(b.text, 'de'));
}

function buildTaskEventsForMonth(task, monthDate) {
  if (!task.dueDate) return [];

  if (!task.recurrence) {
    const dueDate = parseIsoDate(task.dueDate);
    if (!isSameMonth(dueDate, monthDate)) return [];
    return [makeEvent(task, dueDate, 'Einmalig')];
  }

  const occurrence = getOccurrenceForMonth(task.recurrence, task.recurrenceAnchor || task.dueDate, monthDate);
  if (!occurrence) return [];
  return [makeEvent(task, occurrence, formatRecurrence(task.recurrence))];
}

function makeEvent(task, occurrenceDate, metaLabel) {
  return {
    taskId: task.id,
    text: task.text,
    color: task.color,
    date: occurrenceDate,
    dateStr: toIsoDate(occurrenceDate),
    metaLabel,
    recurring: Boolean(task.recurrence),
    overdue: !task.done && toIsoDate(occurrenceDate) < toIsoDate(new Date()),
  };
}

function getOccurrenceForMonth(rule, anchorIso, monthDate) {
  const anchorDate = parseIsoDate(anchorIso);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  let occurrence = null;

  if (rule.kind === 'monthly_nth_workday') {
    occurrence = nthWorkdayOfMonth(year, month, Number(rule.nth));
  }
  if (rule.kind === 'monthly_last_workday') {
    occurrence = lastWorkdayOfMonth(year, month);
  }
  if (rule.kind === 'monthly_ordinal_weekday') {
    occurrence = ordinalWeekdayOfMonth(year, month, Number(rule.weekday), Number(rule.ordinal));
  }
  if (rule.kind === 'monthly_day_of_month') {
    occurrence = monthlyDayOfMonth(year, month, Number(rule.day), rule.shift || 'none');
  }
  if (rule.kind === 'monthly_days_before_month_end') {
    occurrence = daysBeforeMonthEnd(year, month, Number(rule.daysBefore), rule.shift || 'none');
  }

  if (!occurrence) return null;
  return occurrence >= anchorDate ? occurrence : null;
}

function groupEventsByDate(events) {
  const map = new Map();
  events.forEach((event) => {
    if (!map.has(event.dateStr)) map.set(event.dateStr, []);
    map.get(event.dateStr).push(event);
  });
  return map;
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
}

function syncComposerControls() {
  if (!state.composer.taskColor) {
    state.composer.taskColor = state.theme.accent;
  }

  elements.symbolPreset.value = state.composer.symbolPreset;
  elements.taskColor.value = state.composer.taskColor;
  elements.customOpenSymbol.value = state.composer.customOpenSymbol;
  elements.customDoneSymbol.value = state.composer.customDoneSymbol;
  elements.dueDateInput.value = state.composer.dueDate;
  elements.recurrenceType.value = state.composer.recurrenceType;
  elements.nthWorkdayInput.value = state.composer.nthWorkday;
  elements.ordinalSelect.value = state.composer.ordinal;
  elements.weekdaySelect.value = state.composer.weekday;
  elements.monthDayInput.value = state.composer.monthDay;
  elements.monthDayShift.value = state.composer.monthDayShift;
  elements.daysBeforeEndInput.value = state.composer.daysBeforeEnd;
  elements.daysBeforeEndShift.value = state.composer.daysBeforeEndShift;
}

function syncRecurrenceVisibility() {
  const type = state.composer.recurrenceType;
  elements.nthWorkdayRow.hidden = type !== 'monthly_nth_workday';
  elements.lastWorkdayRow.hidden = type !== 'monthly_last_workday';
  elements.ordinalWeekdayRow.hidden = type !== 'monthly_ordinal_weekday';
  elements.monthDayRow.hidden = type !== 'monthly_day_of_month';
  elements.daysBeforeEndRow.hidden = type !== 'monthly_days_before_month_end';
}

function resetComposer(options = {}) {
  const { preserveDate = false } = options;
  const selectedDate = state.composer.dueDate;
  state.editingTaskId = null;
  state.composer = {
    ...defaultComposer,
    dueDate: preserveDate ? selectedDate : '',
    taskColor: state.theme.accent,
  };
  syncComposerControls();
  syncRecurrenceVisibility();
  renderComposerState();
  persistUiState();
  elements.taskInput.value = '';
}

function cancelEditing() {
  resetComposer({ preserveDate: true });
}

function startEditing(taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;

  state.editingTaskId = taskId;
  state.composer = {
    ...defaultComposer,
    taskColor: task.color,
    customOpenSymbol: task.symbols.open,
    customDoneSymbol: task.symbols.done,
    dueDate: task.recurrenceAnchor || task.dueDate || '',
  };

  if (task.recurrence) {
    state.composer.recurrenceType = task.recurrence.kind;
    if (task.recurrence.nth) state.composer.nthWorkday = String(task.recurrence.nth);
    if (task.recurrence.ordinal !== undefined) state.composer.ordinal = String(task.recurrence.ordinal);
    if (task.recurrence.weekday !== undefined) state.composer.weekday = String(task.recurrence.weekday);
    if (task.recurrence.day !== undefined) state.composer.monthDay = String(task.recurrence.day);
    if (task.recurrence.shift) state.composer.monthDayShift = task.recurrence.shift;
    if (task.recurrence.daysBefore !== undefined) state.composer.daysBeforeEnd = String(task.recurrence.daysBefore);
    if (task.recurrence.shift) state.composer.daysBeforeEndShift = task.recurrence.shift;
  }

  elements.taskInput.value = task.text;
  syncComposerControls();
  syncRecurrenceVisibility();
  renderComposerState();
  persistUiState();
  toggleMenu(true);
  elements.taskInput.focus();
  elements.taskInput.select();
}

function prefillComposerDate(isoDate) {
  state.composer.dueDate = isoDate;
  syncComposerControls();
  renderComposerState();
  persistUiState();
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
  renderSyncOnly();
}

function renderSyncOnly() {
  elements.syncStatus.textContent = state.syncStatus;
  elements.syncStatus.dataset.tone = state.syncTone;
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

function formatDateOnly(isoDate) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

function formatDateLong(isoDate) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(isoDate));
}

function formatMonthLabel(monthDate) {
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
  }).format(monthDate);
}

function formatRecurrence(rule) {
  if (!rule) return 'Einmalig';
  if (rule.kind === 'monthly_nth_workday') {
    return `${rule.nth}. Arbeitstag im Monat`;
  }
  if (rule.kind === 'monthly_last_workday') {
    return 'letzter Arbeitstag im Monat';
  }
  if (rule.kind === 'monthly_ordinal_weekday') {
    return `${ORDINAL_LABELS[String(rule.ordinal)]} ${WEEKDAY_LONG[Number(rule.weekday)]} im Monat`;
  }
  if (rule.kind === 'monthly_day_of_month') {
    const shiftMap = {
      none: '',
      previous_workday: ' (vorheriger Arbeitstag)',
      next_workday: ' (nächster Arbeitstag)',
    };
    return `${rule.day}. im Monat${shiftMap[rule.shift] ?? ''}`;
  }
  if (rule.kind === 'monthly_days_before_month_end') {
    const shiftMap = {
      none: '',
      previous_workday: ' (vorheriger Arbeitstag)',
      next_workday: ' (nächster Arbeitstag)',
    };
    return `${rule.daysBefore} Tage vor Monatsende${shiftMap[rule.shift] ?? ''}`;
  }
  return 'Serie';
}

function isTaskOverdue(task) {
  if (!task.dueDate || task.done) return false;
  return parseIsoDate(task.dueDate) < startOfDay(new Date());
}

function focusDate(isoDate, options = {}) {
  const { prefillComposer = false, openMenu = false } = options;
  state.calendar.selectedDate = isoDate;
  state.calendar.currentMonth = startOfMonth(parseIsoDate(isoDate));
  if (prefillComposer) {
    prefillComposerDate(isoDate);
  }
  persistUiState();
  render();
  if (openMenu) {
    toggleMenu(true);
    elements.taskInput.focus();
  }
}

function shiftCalendarMonth(delta) {
  state.calendar.currentMonth = addMonths(state.calendar.currentMonth, delta);
  if (!isSameMonth(parseIsoDate(state.calendar.selectedDate), state.calendar.currentMonth)) {
    state.calendar.selectedDate = toIsoDate(state.calendar.currentMonth);
  }
  persistUiState();
  render();
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
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
    filter: state.filter,
    composer: state.composer,
    selectedDate: state.calendar.selectedDate,
  }));
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

function parseIsoDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value, delta) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function addDays(value, delta) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + delta);
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isToday(value) {
  return toIsoDate(value) === toIsoDate(new Date());
}

function buildMonthCells(monthDate) {
  const first = startOfMonth(monthDate);
  const offset = mondayIndex(first);
  const cursor = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(cursor, index));
}

function mondayIndex(value) {
  return (value.getDay() + 6) % 7;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isWorkday(value) {
  return mondayIndex(value) < 5;
}

function shiftToWorkday(value, direction) {
  const delta = direction === 'previous_workday' ? -1 : 1;
  let current = value;
  while (!isWorkday(current)) {
    current = addDays(current, delta);
  }
  return current;
}

function nthWorkdayOfMonth(year, monthIndex, nth) {
  let counter = 0;
  for (let day = 1; day <= lastDayOfMonth(year, monthIndex); day += 1) {
    const current = new Date(year, monthIndex, day);
    if (isWorkday(current)) {
      counter += 1;
      if (counter === nth) return current;
    }
  }
  return null;
}

function lastWorkdayOfMonth(year, monthIndex) {
  let current = new Date(year, monthIndex, lastDayOfMonth(year, monthIndex));
  while (!isWorkday(current)) {
    current = addDays(current, -1);
  }
  return current;
}

function ordinalWeekdayOfMonth(year, monthIndex, weekday, ordinal) {
  const matches = [];
  for (let day = 1; day <= lastDayOfMonth(year, monthIndex); day += 1) {
    const current = new Date(year, monthIndex, day);
    if (mondayIndex(current) === weekday) matches.push(current);
  }
  if (!matches.length) return null;
  if (ordinal === -1) return matches.at(-1);
  return matches[ordinal - 1] ?? null;
}

function monthlyDayOfMonth(year, monthIndex, day, shift) {
  const safeDay = Math.min(day, lastDayOfMonth(year, monthIndex));
  let current = new Date(year, monthIndex, safeDay);
  if (shift === 'none' || isWorkday(current)) return current;
  return shiftToWorkday(current, shift);
}

function daysBeforeMonthEnd(year, monthIndex, daysBefore, shift) {
  let current = addDays(new Date(year, monthIndex, lastDayOfMonth(year, monthIndex)), -daysBefore);
  if (current.getMonth() !== monthIndex) return null;
  if (shift === 'none' || isWorkday(current)) return current;
  return shiftToWorkday(current, shift);
}
