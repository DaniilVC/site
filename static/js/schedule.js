document.addEventListener('DOMContentLoaded', async () => {
    // ===== 1. ИНИЦИАЛИЗАЦИЯ И ПРОВЕРКА ДОСТУПА =====
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    let payload;
    try {
        payload = JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error('Невалидный токен');
        localStorage.removeItem('access_token');
        window.location.href = '/login.html';
        return;
    }

    const currentUserId = payload.user_id;
    const canEdit = ['agent', 'director', 'admin'].includes(payload.role);

    // ===== 2. КОНФИГУРАЦИЯ =====
    // ВАЖНО: Порядок в массиве строго соответствует порядку колонок в HTML-таблице
    const BERTH_NAMES = ['ТНГ', 'ТТНГ', 'ЗТКТ', 'МТТ', 'РЕЙД'];
    
    // Маппинг для отображения: "Причал №1" -> "ТНГ"
    const BERTH_DISPLAY_MAP = Object.fromEntries(
        BERTH_NAMES.map((name, idx) => [`Причал №${idx + 1}`, name])
    );

    const TIME_SLOTS = [
        { display: "02:00", hour: 2 },
        { display: "05:00", hour: 5 },
        { display: "11:00", hour: 11 },
        { display: "14:00", hour: 14 },
        { display: "17:00", hour: 17 },
        { display: "20:00", hour: 20 },
        { display: "23:00", hour: 23 }
    ];

    // ===== 3. СОСТОЯНИЕ =====
    let currentServerDate = null;
    let dates = [];
    let isTodayPartiallyLocked = false;
    let editingEntryId = null;

    // DOM элементы
    const els = {
        tablesContainer: document.getElementById('tablesContainer'),
        modal: document.getElementById('bookingModal'),
        viewModal: document.getElementById('viewModal'),
        vesselList: document.getElementById('vesselList'),
        vesselSelect: document.getElementById('m_vesselSelect'),
        addVesselForm: document.getElementById('addVesselForm')
    };

    // ===== 4. УТИЛИТЫ =====
    const getDisplayName = (internal) => BERTH_DISPLAY_MAP[internal] || internal;
    
    const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    const generateDates = (baseDateStr) => {
        const res = [];
        const base = new Date(baseDateStr);
        for (let i = 0; i < 4; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            res.push(d.toISOString().split('T')[0]);
        }
        return res;
    };

    // ===== 5. СИНХРОНИЗАЦИЯ ВРЕМЕНИ =====
    async function syncServerTime() {
        try {
            const res = await fetch(`/api/server-time?t=${Date.now()}`);
            const data = await res.json();
            
            const dateChanged = currentServerDate !== data.date;
            const lockChanged = isTodayPartiallyLocked !== (data.hour >= 15);

            currentServerDate = data.date;
            isTodayPartiallyLocked = data.hour >= 15;

            if (dateChanged) {
                dates = generateDates(data.date);
                renderAllTables();
                loadVessels();
            } else if (lockChanged) {
                renderAllTables();
            }
        } catch (e) {
            console.error('⚠️ Ошибка синхронизации:', e);
            const localDate = new Date().toISOString().split('T')[0];
            if (currentServerDate !== localDate) {
                currentServerDate = localDate;
                dates = generateDates(localDate);
                renderAllTables();
            }
        }
    }

    // ===== 6. WEBSOCKET =====
    function connectWS() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/schedule`);

        ws.onopen = () => console.log('📡 WS Connected');
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'schedule_updated') loadScheduleData(msg.date);
        };
        ws.onclose = () => setTimeout(connectWS, 3000);
    }

    // ===== 7. ОТРИСОВКА ТАБЛИЦ =====
    function renderAllTables() {
        els.tablesContainer.innerHTML = '';

        dates.forEach((dateStr, index) => {
            const isToday = index === 0;
            const grid = document.createElement('div');
            grid.className = 'schedule-grid';

            let headerText = formatDate(dateStr);
            if (isToday) {
                headerText = isTodayPartiallyLocked
                    ? 'Сегодня ⚠️ Только слоты с 17:00'
                    : 'Сегодня ✅ Открыто до 15:00';
            }
            grid.innerHTML = `<h2>📅 ${headerText}</h2>`;

            const table = document.createElement('table');
            table.className = 's-table';
            table.innerHTML = `
                <thead><tr>
                    <th>⏰ Время</th>
                    ${BERTH_NAMES.map(n => `<th>🚢 ${n}</th>`).join('')}
                </tr></thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector('tbody');

            TIME_SLOTS.forEach(slot => {
                const tr = document.createElement('tr');
                const th = document.createElement('td');
                th.className = 'hour-cell';
                th.textContent = slot.display;
                tr.appendChild(th);

                for (let b = 1; b <= 5; b++) {
                    const td = document.createElement('td');
                    const internalBerth = `Причал №${b}`;
                    const isTimeLocked = isToday && isTodayPartiallyLocked && slot.hour < 17;

                    td.className = isTimeLocked ? 'berth-cell locked' : 'berth-cell';
                    td.dataset.date = dateStr;
                    td.dataset.hour = slot.hour;
                    td.dataset.berth = internalBerth; // В DOM всегда внутреннее имя!

                    if (canEdit && !isTimeLocked) {
                        td.onclick = () => openModal(dateStr, slot.hour, internalBerth);
                    }
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            });

            grid.appendChild(table);
            els.tablesContainer.appendChild(grid);
            loadScheduleData(dateStr);
        });
    }

    // ===== 8. ЗАГРУЗКА РАСПИСАНИЯ =====
    async function loadScheduleData(dateStr) {
        if (!dateStr) return;

        // Очищаем только занятые ячейки для этой даты
        document.querySelectorAll(`td[data-date="${dateStr}"].booked`).forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('booked');
            delete cell.dataset.status;
            delete cell.dataset.entryId;
            cell.onclick = null;
            cell.style.cursor = '';
        });

        try {
            const res = await fetch(`/api/schedule?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) return;

            const entries = await res.json();

            entries.forEach(entry => {
                const entryDate = String(entry.date).split('T')[0];
                const cell = document.querySelector(
                    `td[data-date="${entryDate}"][data-hour="${entry.hour}"][data-berth="${entry.berth}"]`
                );
                if (!cell) return;

                cell.innerHTML = `
                    <span class="vessel-name">${entry.vessel_name || 'Неизвестно'}</span>
                    <span class="company-name">${entry.owner_company || '—'}</span>
                `;
                cell.classList.add('booked');
                cell.dataset.status = entry.status;
                cell.dataset.entryId = entry.id;
                cell.style.cursor = 'pointer';
                cell.onclick = (e) => {
                    e.stopPropagation();
                    openViewModal(entry.id);
                };
            });

            // Восстанавливаем клики для свободных ячеек
            document.querySelectorAll(`td[data-date="${dateStr}"]:not(.booked)`).forEach(cell => {
                const hour = parseInt(cell.dataset.hour);
                const isToday = dateStr === dates[0];
                const isTimeLocked = isToday && isTodayPartiallyLocked && hour < 17;

                if (canEdit && !isTimeLocked) {
                    cell.style.cursor = 'pointer';
                    cell.onclick = () => openModal(dateStr, hour, cell.dataset.berth);
                } else {
                    cell.style.cursor = 'not-allowed';
                    cell.onclick = null;
                }
            });
        } catch (err) {
            console.error('Ошибка загрузки расписания:', err);
        }
    }

    // ===== 9. МОДАЛЬНЫЕ ОКНА =====
    function openModal(date, hour, berth) {
        document.getElementById('m_date').value = date;
        document.getElementById('m_timeSelect').value = hour;
        document.getElementById('m_berthSelect').value = berth;
        document.getElementById('m_berth').value = berth;
        editingEntryId = null;
        els.modal.classList.remove('hidden');
    }

    async function openEditModal(entryId) {
        try {
            const res = await fetch(`/api/schedule/${entryId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) return alert('Не удалось загрузить данные');

            const entry = await res.json();
            document.getElementById('m_date').value = entry.date;
            document.getElementById('m_timeSelect').value = entry.hour;
            document.getElementById('m_berthSelect').value = entry.berth;
            document.getElementById('m_berth').value = entry.berth;
            document.getElementById('m_vesselSelect').value = entry.vessel_id;
            document.getElementById('m_status').value = entry.status;

            editingEntryId = entryId;
            els.modal.classList.remove('hidden');
            els.viewModal.classList.add('hidden');
        } catch (err) {
            console.error('Ошибка открытия редактирования:', err);
        }
    }

    async function openViewModal(entryId) {
        try {
            const res = await fetch(`/api/schedule/${entryId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) return;

            const entry = await res.json();
            document.getElementById('view_vessel_name').textContent = entry.vessel_name;
            document.getElementById('view_vessel_number').textContent = entry.vessel_number || '—';
            document.getElementById('view_date').textContent = entry.date;
            document.getElementById('view_time').textContent = `${entry.hour}:00`;
            document.getElementById('view_berth').textContent = getDisplayName(entry.berth);
            document.getElementById('view_status').textContent = entry.status;
            document.getElementById('view_owner').textContent = entry.owner_username || '—';
            document.getElementById('view_company').textContent = entry.owner_company || '—';

            const isOwner = entry.owner_id === currentUserId;
            document.getElementById('btn_edit_entry').style.display = isOwner ? 'inline-block' : 'none';
            document.getElementById('btn_delete_entry').style.display = isOwner ? 'inline-block' : 'none';
            document.getElementById('btn_edit_entry').dataset.id = entryId;
            document.getElementById('btn_delete_entry').dataset.id = entryId;

            els.viewModal.classList.remove('hidden');
        } catch (err) {
            console.error('Ошибка просмотра:', err);
        }
    }

    // ===== 10. ОБРАБОТЧИКИ ФОРМЫ (АТОМАРНОЕ РЕДАКТИРОВАНИЕ) =====
    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const vesselId = parseInt(document.getElementById('m_vesselSelect').value);
        const date = document.getElementById('m_date').value;
        const hour = parseInt(document.getElementById('m_timeSelect').value);
        const berth = document.getElementById('m_berthSelect').value;

        if (!date || ![2, 5, 11, 14, 17, 20, 23].includes(hour) || isNaN(vesselId)) {
            return alert('Заполните все поля корректно');
        }

        const data = { date, hour, berth, vessel_id: vesselId, status: document.getElementById('m_status').value };

        try {
            const isEditing = !!editingEntryId;
            const url = isEditing ? `/api/schedule/${editingEntryId}` : '/api/schedule';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const err = await res.json();
                return alert(err.detail || 'Ошибка сохранения');
            }

            els.modal.classList.add('hidden');
            editingEntryId = null;
            loadScheduleData(date);
        } catch (err) {
            alert('Ошибка сети');
            console.error(err);
        }
    });

    // ===== 11. ПРОЧИЕ ОБРАБОТЧИКИ =====
    document.getElementById('closeModal')?.addEventListener('click', () => els.modal.classList.add('hidden'));
    document.getElementById('closeViewModal')?.addEventListener('click', () => els.viewModal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === els.modal) els.modal.classList.add('hidden');
        if (e.target === els.viewModal) els.viewModal.classList.add('hidden');
    });

    document.getElementById('btn_edit_entry')?.addEventListener('click', (e) => openEditModal(e.target.dataset.id));
    document.getElementById('btn_delete_entry')?.addEventListener('click', async (e) => {
        if (!confirm('Удалить это бронирование?')) return;
        try {
            const res = await fetch(`/api/schedule/${e.target.dataset.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) {
                els.viewModal.classList.add('hidden');
                loadScheduleData(dates[0]);
            } else {
                const err = await res.json();
                alert(err.detail || 'Не удалось удалить');
            }
        } catch (err) { alert('Ошибка сети'); }
    });

    // ===== 12. СУДА =====
    async function loadVessels() {
        try {
            const res = await fetch('/api/vessels', { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
            const vessels = await res.json();

            els.vesselList.innerHTML = vessels.length ? '' : '<li class="empty-msg">Нет судов</li>';
            els.vesselSelect.innerHTML = '';

            vessels.forEach(v => {
                const li = document.createElement('li');
                li.className = 'vessel-item';
                li.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:8px;";
                li.innerHTML = `
                    <span>${v.vessel_name} (${v.vessel_number})</span>
                    <button class="btn-del" data-id="${v.id}" data-name="${v.vessel_name}" 
                            style="background:none; border:none; cursor:pointer; font-size:16px; opacity:0.5;">🗑️</button>
                `;
                els.vesselList.appendChild(li);
                els.vesselSelect.innerHTML += `<option value="${v.id}">${v.vessel_name}</option>`;
            });
        } catch (e) { console.error('Ошибка загрузки судов:', e); }
    }

    els.addVesselForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/vessels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
                body: JSON.stringify({
                    vessel_name: document.getElementById('vesselName').value,
                    vessel_number: document.getElementById('vesselNumber').value
                })
            });
            if (res.ok) { e.target.reset(); loadVessels(); }
            else alert((await res.json()).detail || 'Ошибка добавления');
        } catch (err) { alert('Ошибка сети'); }
    });

    els.vesselList?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-del');
        if (!btn || !confirm(`Удалить судно "${btn.dataset.name}"?`)) return;
        try {
            const res = await fetch(`/api/vessels/${btn.dataset.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) loadVessels();
            else alert((await res.json()).detail || 'Ошибка удаления');
        } catch (err) { alert('Ошибка сети'); }
    });

    if (!canEdit && els.addVesselForm) els.addVesselForm.style.display = 'none';

    // ===== 13. ЗАПУСК =====
    connectWS();
    await syncServerTime();
    setInterval(syncServerTime, 10000);
    loadVessels();
});