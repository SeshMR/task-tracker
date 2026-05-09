'use strict';

/* ─── Auth ──────────────────────────────────────────────────────────────── */
// Replace with your Google Cloud OAuth 2.0 Client ID
const GOOGLE_CLIENT_ID = '871342362207-fjdg7rsr9o0i994una8qnuueidji3u3n.apps.googleusercontent.com';
const AUTH_KEY = 'taskflow_user';

function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  ));
}

function getUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
  catch { return null; }
}

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

function renderUserInfo(user) {
  const el = document.getElementById('user-info');
  if (!el || !user) return;
  const avatarHtml = user.picture
    ? `<img class="user-avatar" src="${escHtml(user.picture)}" alt="${escHtml(user.name)}" referrerpolicy="no-referrer" />`
    : '';
  el.innerHTML = `
    ${avatarHtml}
    <span class="user-name">${escHtml(user.name)}</span>
    <button class="btn-ghost btn-sm" id="logout-btn">Sign out</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

function handleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  const user = { name: payload.name, email: payload.email, picture: payload.picture, sub: payload.sub };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  renderUserInfo(user);
  showApp();
  render();
}

function handleLogout() {
  localStorage.removeItem(AUTH_KEY);
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  document.getElementById('user-info').innerHTML = '';
  showLoginScreen();
}

function initGoogleSignIn() {
  if (!window.google || !google.accounts) { setTimeout(initGoogleSignIn, 150); return; }
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse, auto_select: false });
  google.accounts.id.renderButton(document.getElementById('google-signin-btn'), {
    theme: 'outline', size: 'large', width: 280, text: 'signin_with', shape: 'rectangular',
  });
}

/* ─── Storage ──────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'taskflow_tasks';

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ─── State ────────────────────────────────────────────────────────────── */
let tasks = loadTasks();
let currentFilter = 'all';
let currentSort   = 'date-asc';
let searchQuery   = '';
let pendingDeleteId = null;

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(dateStr) {
  return dateStr === todayISO();
}

function isUpcoming(dateStr) {
  return dateStr > todayISO();
}

function isOverdue(task) {
  if (task.completed) return false;
  if (!task.date) return false;
  if (task.date < todayISO()) return true;
  if (task.date === todayISO() && task.time) {
    const now = new Date();
    const [h, m] = task.time.split(':').map(Number);
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  }
  return false;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: dt.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Filtering & sorting ───────────────────────────────────────────────── */
function getFilteredTasks() {
  let list = tasks.slice();

  // filter
  if (currentFilter === 'today') {
    list = list.filter(t => isToday(t.date));
  } else if (currentFilter === 'upcoming') {
    list = list.filter(t => isUpcoming(t.date));
  } else if (currentFilter === 'completed') {
    list = list.filter(t => t.completed);
  }

  // search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.location || '').toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q)
    );
  }

  // sort
  list.sort((a, b) => {
    const da = (a.date || '9999') + (a.time || '99:99');
    const db = (b.date || '9999') + (b.time || '99:99');
    if (currentSort === 'date-asc')   return da < db ? -1 : da > db ? 1 : 0;
    if (currentSort === 'date-desc')  return da > db ? -1 : da < db ? 1 : 0;
    if (currentSort === 'title-asc')  return a.title.localeCompare(b.title);
    if (currentSort === 'title-desc') return b.title.localeCompare(a.title);
    return 0;
  });

  return list;
}

/* ─── Badges & stats ────────────────────────────────────────────────────── */
function updateSidebar() {
  const all       = tasks.length;
  const today     = tasks.filter(t => isToday(t.date) && !t.completed).length;
  const upcoming  = tasks.filter(t => isUpcoming(t.date) && !t.completed).length;
  const completed = tasks.filter(t => t.completed).length;

  document.getElementById('badge-all').textContent       = all;
  document.getElementById('badge-today').textContent     = today;
  document.getElementById('badge-upcoming').textContent  = upcoming;
  document.getElementById('badge-completed').textContent = completed;

  document.getElementById('stat-total').textContent   = all;
  document.getElementById('stat-done').textContent    = completed;
  document.getElementById('stat-pending').textContent = all - completed;

  const pct = all ? Math.round((completed / all) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = pct + '% complete';
}

/* ─── Render ────────────────────────────────────────────────────────────── */
function render() {
  const list = getFilteredTasks();
  const container = document.getElementById('task-list');
  const empty     = document.getElementById('empty-state');

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    container.innerHTML = list.map(renderTask).join('');
    attachTaskEvents();
  }

  updateSidebar();
}

function renderTask(task) {
  const overdue = isOverdue(task);
  const classes = [
    'task-card',
    task.completed ? 'completed' : '',
    overdue ? 'overdue' : '',
  ].filter(Boolean).join(' ');

  const datePart = task.date ? `
    <span class="task-meta-item">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${escHtml(formatDate(task.date))}${task.time ? ' · ' + escHtml(formatTime(task.time)) : ''}
    </span>` : '';

  const locPart = task.location ? `
    <span class="task-meta-item">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      ${escHtml(task.location)}
    </span>` : '';

  const notesPart = task.notes ? `
    <div class="task-notes">${escHtml(task.notes)}</div>` : '';

  return `
    <div class="${classes}" data-id="${task.id}">
      <button class="task-check" data-id="${task.id}" aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <div class="task-body">
        <div class="task-title">${escHtml(task.title)}</div>
        <div class="task-meta">${datePart}${locPart}</div>
        ${notesPart}
      </div>
      <div class="task-actions">
        <button class="task-action-btn edit" data-id="${task.id}" aria-label="Edit task">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="task-action-btn delete" data-id="${task.id}" aria-label="Delete task">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
}

function attachTaskEvents() {
  document.querySelectorAll('.task-check').forEach(btn => {
    btn.addEventListener('click', () => toggleComplete(btn.dataset.id));
  });
  document.querySelectorAll('.task-action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  document.querySelectorAll('.task-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteDialog(btn.dataset.id));
  });
}

/* ─── CRUD ──────────────────────────────────────────────────────────────── */
function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks(tasks);
  render();
}

function addTask(data) {
  tasks.unshift({ id: uid(), completed: false, ...data });
  saveTasks(tasks);
  render();
  toast('Task added', 'success');
}

function updateTask(id, data) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], ...data };
  saveTasks(tasks);
  render();
  toast('Task updated', 'success');
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(tasks);
  render();
  toast('Task deleted');
}

/* ─── Modal ─────────────────────────────────────────────────────────────── */
const backdrop  = document.getElementById('modal-backdrop');
const form      = document.getElementById('task-form');
const modalTitle = document.getElementById('modal-title');

function openAddModal() {
  document.getElementById('task-id').value    = '';
  document.getElementById('task-title').value  = '';
  document.getElementById('task-date').value   = todayISO();
  document.getElementById('task-time').value   = '';
  document.getElementById('task-location').value = '';
  document.getElementById('task-notes').value  = '';
  clearErrors();
  modalTitle.textContent = 'Add Task';
  document.getElementById('modal-submit').textContent = 'Save Task';
  showModal();
  document.getElementById('task-title').focus();
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  document.getElementById('task-id').value      = task.id;
  document.getElementById('task-title').value   = task.title;
  document.getElementById('task-date').value    = task.date || '';
  document.getElementById('task-time').value    = task.time || '';
  document.getElementById('task-location').value = task.location || '';
  document.getElementById('task-notes').value   = task.notes || '';
  clearErrors();
  modalTitle.textContent = 'Edit Task';
  document.getElementById('modal-submit').textContent = 'Update Task';
  showModal();
  document.getElementById('task-title').focus();
}

function showModal() {
  backdrop.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  backdrop.style.display = 'none';
  document.body.style.overflow = '';
}

function clearErrors() {
  document.getElementById('title-error').textContent = '';
  document.getElementById('date-error').textContent  = '';
  document.getElementById('task-title').classList.remove('error');
  document.getElementById('task-date').classList.remove('error');
}

form.addEventListener('submit', e => {
  e.preventDefault();
  clearErrors();

  const title = document.getElementById('task-title').value.trim();
  const date  = document.getElementById('task-date').value;
  let valid = true;

  if (!title) {
    document.getElementById('title-error').textContent = 'Title is required.';
    document.getElementById('task-title').classList.add('error');
    valid = false;
  }
  if (!date) {
    document.getElementById('date-error').textContent = 'Date is required.';
    document.getElementById('task-date').classList.add('error');
    valid = false;
  }
  if (!valid) return;

  const data = {
    title,
    date,
    time:     document.getElementById('task-time').value || '',
    location: document.getElementById('task-location').value.trim(),
    notes:    document.getElementById('task-notes').value.trim(),
  };

  const id = document.getElementById('task-id').value;
  if (id) updateTask(id, data);
  else    addTask(data);

  closeModal();
});

/* ─── Delete dialog ─────────────────────────────────────────────────────── */
const deleteBackdrop = document.getElementById('delete-backdrop');

function openDeleteDialog(id) {
  pendingDeleteId = id;
  deleteBackdrop.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDeleteDialog() {
  pendingDeleteId = null;
  deleteBackdrop.style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('delete-confirm').addEventListener('click', () => {
  if (pendingDeleteId) deleteTask(pendingDeleteId);
  closeDeleteDialog();
});

document.getElementById('delete-cancel').addEventListener('click', closeDeleteDialog);

deleteBackdrop.addEventListener('click', e => {
  if (e.target === deleteBackdrop) closeDeleteDialog();
});

/* ─── Toast ─────────────────────────────────────────────────────────────── */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = ['toast', type].filter(Boolean).join(' ');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .2s ease forwards';
    el.addEventListener('animationend', () => el.remove());
  }, 2800);
}

/* ─── Nav ───────────────────────────────────────────────────────────────── */
const viewTitles = { all: 'All Tasks', today: 'Today', upcoming: 'Upcoming', completed: 'Completed' };

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    document.getElementById('view-title').textContent = viewTitles[currentFilter];
    closeSidebar();
    render();
  });
});

/* ─── Sort & search ─────────────────────────────────────────────────────── */
document.getElementById('sort-select').addEventListener('change', e => {
  currentSort = e.target.value;
  render();
});

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  render();
});

/* ─── Add button & modal close ──────────────────────────────────────────── */
document.getElementById('add-task-btn').addEventListener('click', openAddModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

/* ─── Keyboard shortcuts ────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (backdrop.style.display !== 'none') closeModal();
    if (deleteBackdrop.style.display !== 'none') closeDeleteDialog();
  }
  if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    openAddModal();
  }
});

/* ─── Mobile sidebar ────────────────────────────────────────────────────── */
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebar-overlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('menu-toggle').addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
});

overlay.addEventListener('click', closeSidebar);

/* ─── Boot ──────────────────────────────────────────────────────────────── */
(function initAuth() {
  const user = getUser();
  if (user) {
    showApp();
    renderUserInfo(user);
    render();
  } else {
    showLoginScreen();
    initGoogleSignIn();
  }
})();
