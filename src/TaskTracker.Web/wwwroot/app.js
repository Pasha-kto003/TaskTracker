const API = '/api/tasks';
let viewMode = 'list';
let filters = { status: '', priority: '', tag: '', query: '', view: '' };

const $ = id => document.getElementById(id);
const STATUS_LABEL = { todo: 'Todo', inProgress: 'In Progress', done: 'Done' };
const STATUS_PILL = { todo: 'pill-yel', inProgress: 'pill-pink', done: 'pill-mint' };
const PRIO_PILL = { low: 'pill-mint', medium: 'pill-yel', high: 'pill-coral' };

// ---------- Utilities ----------
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const todayStr = () => new Date().toISOString().slice(0, 10);

function humanDeadline(deadline, status) {
    if (!deadline) return '';
    const diff = Math.round((new Date(deadline) - new Date(todayStr())) / 86_400_000);
    if (status === 'done') return deadline;
    if (diff < 0) return `${deadline} · ${-diff}d overdue`;
    if (diff === 0) return 'due today';
    if (diff === 1) return 'due tomorrow';
    return `in ${diff}d`;
}

const formatDate = iso =>
    new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const parseTags = str => (str || '').split(',').map(t => t.trim()).filter(Boolean);

// SVG icons
const iconEdit = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
const iconCycle = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/></svg>`;
const iconTrash = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const iconCalendar = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

// ---------- Toasts ----------
function toast(message, type = 'success') {
    const colors = {
        success: 'bg-mint',
        error: 'bg-coral text-paper',
        info: 'bg-sky',
    };
    const el = document.createElement('div');
    el.className = `toast ${colors[type]} text-ink border-2 border-ink shadow-hard px-4 py-2.5 rounded-lg text-sm font-medium font-mono`;
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateY(4px)';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

// ---------- Confirm dialog ----------
let confirmResolve = null;
function askConfirm(text) {
    return new Promise(res => {
        confirmResolve = res;
        $('confirmText').textContent = text;
        $('confirmModal').classList.remove('hidden');
        $('confirmModal').classList.add('flex');
    });
}
function closeConfirm(answer) {
    $('confirmModal').classList.add('hidden');
    $('confirmModal').classList.remove('flex');
    confirmResolve?.(answer);
    confirmResolve = null;
}
$('confirmYes').onclick = () => closeConfirm(true);
$('confirmNo').onclick = () => closeConfirm(false);

// ---------- Modal ----------
const modal = $('modal');
const form = $('taskForm');

function openModal(task = null) {
    $('modalTitle').textContent = task ? 'Edit Task' : 'New Task';
    $('taskId').value = task?.id ?? '';
    $('title').value = task?.title ?? '';
    $('description').value = task?.description ?? '';
    $('priority').value = task?.priority ?? 'medium';
    $('deadline').value = task?.deadline ?? '';
    $('tags').value = (task?.tags ?? []).join(', ');

    const sec = $('historySection');
    if (task?.history?.length) {
        sec.classList.remove('hidden');
        $('historyList').innerHTML = task.history.map(h =>
            `<li><span class="pill ${STATUS_PILL[h.from] ?? ''}" style="padding:1px 6px;">${STATUS_LABEL[h.from] ?? h.from}</span> → <span class="pill ${STATUS_PILL[h.to] ?? ''}" style="padding:1px 6px;">${STATUS_LABEL[h.to] ?? h.to}</span> <span class="ml-1">${formatDate(h.at)}</span></li>`
        ).join('');
    } else {
        sec.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    $('title').focus();
}

function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    form.reset();
}

$('openCreate').onclick = () => openModal();
$('cancelBtn').onclick = closeModal;
modal.onclick = e => { if (e.target === modal) closeModal(); };

form.onsubmit = async e => {
    e.preventDefault();
    const id = $('taskId').value;
    const payload = {
        title: $('title').value.trim(),
        description: $('description').value.trim() || null,
        priority: $('priority').value,
        deadline: $('deadline').value || null,
        tags: parseTags($('tags').value),
    };
    const isEdit = Boolean(id);
    const res = await fetch(isEdit ? `${API}/${id}` : API, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Error saving task', 'error');
        return;
    }
    closeModal();
    toast(isEdit ? 'Task updated' : 'Task created');
    await load();
};

// ---------- Loading ----------
async function load() {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.query) params.set('q', filters.query);
    if (filters.view) params.set('view', filters.view);

    const res = await fetch(`${API}?${params}`);
    if (!res.ok) {
        console.error('Load failed:', await res.text());
        $('list').innerHTML = '<li class="text-coral text-center py-10 font-mono">Failed to load tasks</li>';
        return;
    }
    const tasks = await res.json();
    viewMode === 'kanban' ? renderKanban(tasks) : renderList(tasks);
    loadStats();
    loadTags();
}

async function loadStats() {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const s = await res.json();
    const pill = (label, value, bgClass) =>
        `<div class="card-brutal rounded-lg p-3 ${bgClass}">
       <div class="font-display font-bold text-3xl leading-none">${value}</div>
       <div class="text-xs font-mono uppercase tracking-wider text-ink/70 mt-2">${label}</div>
     </div>`;
    $('statsBar').innerHTML =
        pill('Total', s.total, 'bg-paper') +
        pill('Todo', s.todo, 'bg-yel') +
        pill('In Progress', s.inProgress, 'bg-pink') +
        pill('Done', s.done, 'bg-mint') +
        pill('Overdue', s.overdue, s.overdue ? 'bg-coral text-paper' : 'bg-paper') +
        pill('Done this week', s.doneThisWeek, 'bg-lilac');
}

async function loadTags() {
    const res = await fetch('/api/tags');
    if (!res.ok) return;
    const tags = await res.json();
    const sel = $('fTag');
    const current = sel.value;
    sel.innerHTML = '<option value="">Any tag</option>' +
        tags.map(t => `<option value="${escapeHtml(t.tag)}">#${escapeHtml(t.tag)} (${t.count})</option>`).join('');
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
}

// ---------- List view ----------
function renderList(tasks) {
    const list = $('list');
    if (!tasks.length) {
        const filtered = filters.status || filters.priority || filters.tag || filters.query || filters.view;
        list.innerHTML = filtered
            ? `<li class="card-brutal rounded-xl py-12 text-center">
           <div class="font-display font-bold text-xl mb-2">Nothing here</div>
           <div class="text-ink/60 text-sm mb-4">No tasks match your filters.</div>
           <button onclick="resetFilters()" class="btn-brutal bg-yel px-4 py-2 rounded-lg font-medium shadow-hard-sm">Reset filters</button>
         </li>`
            : `<li class="card-brutal rounded-xl py-16 text-center">
           <div class="font-display font-bold text-2xl mb-2">Your board is empty</div>
           <div class="text-ink/60 text-sm mb-5">Start by creating your first task.</div>
           <button onclick="openModal()" class="btn-brutal bg-yel px-5 py-2 rounded-lg font-medium shadow-hard">+ New Task</button>
           <div class="mt-4 text-xs font-mono text-ink/40">or press <kbd>N</kbd></div>
         </li>`;
        return;
    }
    const today = todayStr();
    list.innerHTML = tasks.map(t => {
        const overdue = t.deadline && t.deadline < today && t.status !== 'done';
        return `
      <li class="card-brutal rounded-xl p-4 hover:shadow-hard-lg transition-shadow">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 cursor-pointer min-w-0" onclick="editTask(${t.id})">
            <div class="flex items-center gap-2 mb-2">
              <span class="status-marker ${t.status === 'done' ? 'bg-mint' : t.status === 'inProgress' ? 'bg-pink' : 'bg-yel'} border-2 border-ink"></span>
              <span class="font-mono text-xs text-ink/50">#${t.id}</span>
              <span class="pill ${PRIO_PILL[t.priority]}">${t.priority}</span>
              ${overdue ? `<span class="overdue-marker">OVERDUE</span>` : ''}
            </div>
            <div class="font-display font-bold text-lg ${t.status === 'done' ? 'line-through text-ink/40' : ''}">${escapeHtml(t.title)}</div>
            ${t.description ? `<div class="text-sm text-ink/70 mt-2 line-clamp-2">${escapeHtml(t.description)}</div>` : ''}
            <div class="flex flex-wrap gap-1.5 mt-3">
              ${t.deadline ? `<span class="pill ${overdue ? 'pill-coral' : ''}">${iconCalendar} ${humanDeadline(t.deadline, t.status)}</span>` : ''}
              ${t.tags.map(tag => `<span class="pill pill-lilac">#${escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>
          <div class="flex flex-col gap-2 shrink-0">
            <button onclick="cycleStatus(${t.id}, '${t.status}')" title="Cycle status"
                    class="btn-brutal bg-paper p-2 rounded-lg shadow-hard-sm">${iconCycle}</button>
            <button onclick="deleteTask(${t.id})" title="Delete"
                    class="btn-brutal bg-coral text-paper p-2 rounded-lg shadow-hard-sm">${iconTrash}</button>
          </div>
        </div>
      </li>`;
    }).join('');
}

// ---------- Kanban view ----------
function renderKanban(tasks) {
    const counts = { todo: 0, inProgress: 0, done: 0 };
    document.querySelectorAll('.kanban-drop').forEach(d => d.innerHTML = '');
    const today = todayStr();

    for (const t of tasks) {
        const col = document.querySelector(`.kanban-col[data-status="${t.status}"] .kanban-drop`);
        if (!col) continue;
        counts[t.status]++;
        const overdue = t.deadline && t.deadline < today && t.status !== 'done';
        const card = document.createElement('div');
        card.className = `card-brutal rounded-lg p-3 cursor-move bg-paper hover:bg-cream transition-colors`;
        card.draggable = true;
        card.innerHTML = `
      <div class="flex items-center gap-1.5 mb-2">
        <span class="pill ${PRIO_PILL[t.priority]}" style="padding:1px 6px; font-size:10px;">${t.priority}</span>
        <span class="font-mono text-[10px] text-ink/40">#${t.id}</span>
        ${overdue ? `<span class="overdue-marker ml-auto">OVERDUE</span>` : ''}
      </div>
      <div class="font-display font-bold text-sm ${t.status === 'done' ? 'line-through text-ink/40' : ''}">${escapeHtml(t.title)}</div>
      ${t.deadline ? `<div class="text-[11px] font-mono text-ink/60 mt-2 flex items-center gap-1 ${overdue ? 'text-coral' : ''}">${iconCalendar} ${humanDeadline(t.deadline, t.status)}</div>` : ''}
      ${t.tags.length ? `<div class="flex flex-wrap gap-1 mt-2">${t.tags.map(tag => `<span class="pill pill-lilac" style="padding:1px 6px; font-size:10px;">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}`;
        card.ondblclick = () => editTask(t.id);
        card.ondragstart = e => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', t.id); };
        card.ondragend = () => card.classList.remove('dragging');
        col.appendChild(card);
    }

    $('countTodo').textContent = counts.todo ? counts.todo : '0';
    $('countInProgress').textContent = counts.inProgress ? counts.inProgress : '0';
    $('countDone').textContent = counts.done ? counts.done : '0';
    document.querySelectorAll('.kanban-drop').forEach(d => {
        if (!d.children.length)
            d.innerHTML = `<div class="text-center text-xs font-mono text-ink/30 py-10 border-2 border-dashed border-ink/20 rounded-lg">drop tasks here</div>`;
    });
}

document.querySelectorAll('.kanban-drop').forEach(drop => {
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag-over'); };
    drop.ondragleave = () => drop.classList.remove('drag-over');
    drop.ondrop = async e => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const newStatus = drop.closest('.kanban-col').dataset.status;
        const res = await fetch(`${API}/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) { toast(`Moved to ${STATUS_LABEL[newStatus]}`, 'info'); await load(); }
        else toast('Failed to move task', 'error');
    };
});

// ---------- Actions ----------
window.editTask = async id => {
    const res = await fetch(`${API}/${id}`);
    if (!res.ok) return;
    openModal(await res.json());
};

window.deleteTask = async id => {
    const ok = await askConfirm('Delete this task? This cannot be undone.');
    if (!ok) return;
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (res.ok) { toast('Task deleted'); await load(); }
    else toast('Failed to delete task', 'error');
};

window.cycleStatus = async (id, current) => {
    const order = ['todo', 'inProgress', 'done'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    await fetch(`${API}/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
    });
    await load();
};

window.resetFilters = () => {
    ['fStatus', 'fPriority', 'fTag', 'fView'].forEach(id => { $(id).value = ''; });
    $('fQuery').value = '';
    filters = { status: '', priority: '', tag: '', query: '', view: '' };
    load();
};

// ---------- Filters ----------
function readFilters() {
    filters.status = $('fStatus').value;
    filters.priority = $('fPriority').value;
    filters.tag = $('fTag').value;
    filters.query = $('fQuery').value.trim();
    filters.view = $('fView').value;
}
$('applyFilters').onclick = () => { readFilters(); load(); };
$('resetFilters').onclick = () => window.resetFilters();
$('fQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { readFilters(); load(); } });

// ---------- Mode toggle ----------
function setMode(mode) {
    viewMode = mode;
    $('listView').classList.toggle('hidden', mode !== 'list');
    $('kanbanView').classList.toggle('hidden', mode !== 'kanban');

    $('modeList').className = `btn-brutal px-4 py-2 rounded-lg font-medium shadow-hard-sm ${mode === 'list' ? 'bg-ink text-paper' : 'bg-paper'}`;
    $('modeKanban').className = `btn-brutal px-4 py-2 rounded-lg font-medium shadow-hard-sm ${mode === 'kanban' ? 'bg-ink text-paper' : 'bg-paper'}`;
    load();
}
$('modeList').onclick = () => setMode('list');
$('modeKanban').onclick = () => setMode('kanban');

// ---------- Hotkeys ----------
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeConfirm(false); return; }
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing || !modal.classList.contains('hidden') || !$('confirmModal').classList.contains('hidden')) return;

    if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') { e.preventDefault(); openModal(); }
    else if (e.key === '/') { e.preventDefault(); $('fQuery').focus(); }
    else if (e.key === '1') setMode('list');
    else if (e.key === '2') setMode('kanban');
});

// ---------- Boot ----------
setMode('list');
load();