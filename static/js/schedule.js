document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login.html'; return; }
    
    // Определяем роль и права
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userRole = payload.role;
    const currentUserId = payload.user_id; 
    const canEdit = ['agent', 'director', 'admin'].includes(userRole);

    const tablesContainer = document.getElementById('tablesContainer');
    const modal = document.getElementById('bookingModal');
    const viewModal = document.getElementById('viewModal'); 
    const vesselList = document.getElementById('vesselList');
    const vesselSelect = document.getElementById('m_vesselSelect');

    // ===== НАСТРОЙКИ СЛОТОВ =====
    const TIME_SLOTS = [
        { display: "02:00", hour: 2 },
        { display: "05:00", hour: 5 },
        { display: "11:00", hour: 11 },
        { display: "14:00", hour: 14 },
        { display: "17:00", hour: 17 },
        { display: "20:00", hour: 20 },
        { display: "23:00", hour: 23 }
    ];

    // ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СИНХРОНИЗАЦИИ =====
    let currentServerDate = null;
    let dates = [];
    let isTodayPartiallyLocked = false;
    let currentViewEntryId = null; 

    // Генерация 4 дней от базовой даты
    function generateDates(baseDateStr) {
        const res = [];
        const base = new Date(baseDateStr);
        for (let i = 0; i < 4; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            res.push(d.toISOString().split('T')[0]);
        }
        return res;
    }

    // ===== СИНХРОНИЗАЦИЯ С СЕРВЕРОМ (время + дата) =====
    async function syncServerTime() {
        try {
            const res = await fetch(`/api/server-time?t=${Date.now()}`);
            const data = await res.json();
            
            const serverDate = data.date;
            const serverHour = data.hour;

            if (currentServerDate !== serverDate) {
                console.log(`📅 Дата сменилась: ${currentServerDate || 'null'} → ${serverDate}`);
                currentServerDate = serverDate;
                dates = generateDates(serverDate);
                renderAllTables();
                loadVessels();
                return;
            }

            const wasLocked = isTodayPartiallyLocked;
            isTodayPartiallyLocked = serverHour >= 15;
            
            if (wasLocked !== isTodayPartiallyLocked) {
                console.log(`🔒 Время изменилось: ${wasLocked ? '>=15' : '<15'} → ${isTodayPartiallyLocked ? '>=15' : '<15'}`);
                renderAllTables();
            }
        } catch (e) {
            console.error('⚠️ Ошибка синхронизации:', e);
            const now = new Date();
            const localDate = now.toISOString().split('T')[0];
            if (currentServerDate !== localDate) {
                currentServerDate = localDate;
                dates = generateDates(localDate);
                renderAllTables();
            }
        }
    }

    // ===== WEBSOCKET ПОДКЛЮЧЕНИЕ =====
    let ws;
    function connectWS() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/schedule`);
        
        ws.onopen = () => console.log('📡 WS Connected');
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'schedule_updated') {
                console.log('🔄 Получено обновление для даты:', msg.date);
                loadScheduleData(msg.date);
            }
        };
        
        ws.onclose = () => setTimeout(connectWS, 3000);
    }
    
    connectWS();

    // ===== ФУНКЦИЯ ОТРИСОВКИ ВСЕХ ТАБЛИЦ =====
function renderAllTables() {
    tablesContainer.innerHTML = '';
    
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
            <thead>
                <tr>
                    <th>⏰ Время</th>
                    <th>🚢 Причал №1</th>
                    <th>🚢 Причал №2</th>
                    <th>🚢 Причал №3</th>
                    <th>🚢 Причал №4</th>
                    <th>🚢 Причал №5</th>
                </tr>
            </thead>
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
                
                // 🔥 Разделяем блокировку по времени и права
                const isTimeLocked = isToday && isTodayPartiallyLocked && slot.hour < 17;
                const hasNoRights = !canEdit;
                
                // Класс locked только для временной блокировки
                if (isTimeLocked) {
                    td.className = 'berth-cell locked';
                    td.dataset.timeLock = 'true';
                } else {
                    td.className = 'berth-cell';
                }
                
                td.dataset.date = dateStr;
                td.dataset.hour = slot.hour;
                td.dataset.berth = `Причал №${b}`;
                
                if (!hasNoRights && !isTimeLocked) {
                    td.onclick = () => openModal(dateStr, slot.hour, `Причал №${b}`);
                }
                
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });

        grid.appendChild(table);
        tablesContainer.appendChild(grid);
        loadScheduleData(dateStr);
    });
}

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    await syncServerTime();
    setInterval(syncServerTime, 10000);

    // ===== ЗАГРУЗКА СУДОВ =====
    loadVessels();
    const addForm = document.getElementById('addVesselForm');
    if (addForm && !canEdit) {
        addForm.style.display = 'none';
    }

    // ===== ОБРАБОТЧИКИ МОДАЛЬНОГО ОКНА БРОНИРОВАНИЯ =====
    document.getElementById('closeModal')?.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { 
        if (e.target === modal) modal.classList.add('hidden');
        if (e.target === viewModal) viewModal.classList.add('hidden'); // ✅ Закрытие окна просмотра
    });

    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const vesselIdRaw = document.getElementById('m_vesselSelect').value;
        const vesselId = parseInt(vesselIdRaw);
        
        const data = {
            date: document.getElementById('m_date').value,
            hour: parseInt(document.getElementById('m_timeSelect').value),
            berth: document.getElementById('m_berthSelect').value,
            vessel_id: vesselId,
            status: document.getElementById('m_status').value
        };
        
        console.log('📤 Отправка данных:', data);
        
        if (!data.date) { alert('Не выбрана дата'); return; }
        if (![2, 5, 11, 14, 17, 20, 23].includes(data.hour)) { 
            alert('Выберите корректное время'); 
            return; 
        }
        if (isNaN(vesselId) || vesselId <= 0) { 
            alert('Выберите судно из списка!'); 
            return; 
        }

        try {
            const res = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            
            if (res.ok) {
                modal.classList.add('hidden');
                loadScheduleData(data.date);
            } else {
                const err = await res.json();
                const msg = err.detail?.[0]?.msg || err.detail || 'Ошибка сохранения';
                alert(msg);
                console.error('❌ Ошибка бэкенда:', err);
            }
        } catch (err) {
            alert('Ошибка сети');
            console.error('❌ Network error:', err);
        }
    });

    // ===== ДОБАВЛЕНИЕ СУДНА =====
    document.getElementById('addVesselForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('vesselName').value;
        const number = document.getElementById('vesselNumber').value;

        try {
            const res = await fetch('/api/vessels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ vessel_name: name, vessel_number: number })
            });
            if (res.ok) {
                e.target.reset();
                loadVessels();
            } else {
                const err = await res.json();
                alert(err.detail || 'Не удалось добавить судно');
            }
        } catch (err) {
            alert('Ошибка сети');
        }
    });

    // ===== УДАЛЕНИЕ СУДНА (делегирование) =====
    vesselList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-del');
        if (!btn) return;

        const id = btn.dataset.id;
        const name = btn.dataset.name;

        if (!confirm(`Удалить судно "${name}"?`)) return;

        try {
            const res = await fetch(`/api/vessels/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                loadVessels(); 
            } else {
                const err = await res.json();
                alert(err.detail || 'Не удалось удалить судно');
            }
        } catch (err) {
            alert('Ошибка сети');
            console.error('❌ Network error:', err);
        }
    });

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

    function openModal(date, hour, berth) {
        document.getElementById('m_date').value = date;
        document.getElementById('m_berth').value = berth;
        document.getElementById('m_berthSelect').value = berth;
        document.getElementById('m_timeSelect').value = hour;
        modal.classList.remove('hidden');
    }

    // Открытие модального окна просмотра
    async function openViewModal(entryId) {
    try {
        const res = await fetch(`/api/schedule/${entryId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
            alert('Не удалось загрузить информацию');
            return;
        }
        
        const entry = await res.json();
        currentViewEntryId = entryId;
        
        // Заполняем данные
        document.getElementById('view_vessel_name').textContent = entry.vessel_name;
        document.getElementById('view_vessel_number').textContent = entry.vessel_number || 'Не указан';
        document.getElementById('view_date').textContent = entry.date;
        document.getElementById('view_time').textContent = `${entry.hour}:00`;
        document.getElementById('view_berth').textContent = entry.berth;
        document.getElementById('view_status').textContent = entry.status;
        
        document.getElementById('view_owner').textContent = 'ID: ' + entry.owner_id;
        document.getElementById('view_company').textContent = '-';
        
        // Кнопки только для владельца
        const isOwner = entry.owner_id === currentUserId;
        document.getElementById('btn_delete_entry').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('btn_edit_entry').style.display = isOwner ? 'inline-block' : 'none';
        document.getElementById('btn_delete_entry').dataset.id = entryId;
        document.getElementById('btn_edit_entry').dataset.id = entryId;
        
        viewModal.classList.remove('hidden');
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        alert('Ошибка сети');
    }}

    // ОБРАБОТЧИКИ МОДАЛЬНОГО ОКНА ПРОСМОТРА
    document.getElementById('closeViewModal')?.addEventListener('click', () => {
        viewModal?.classList.add('hidden');
    });

    document.getElementById('btn_delete_entry')?.addEventListener('click', async (e) => {
        if (!confirm('Удалить это бронирование?')) return;
        
        const id = e.target.dataset.id;
        try {
            const res = await fetch(`/api/schedule/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                viewModal?.classList.add('hidden');
                const firstCell = document.querySelector('.berth-cell');
                if (firstCell) {
                    loadScheduleData(firstCell.dataset.date);
                }
            } else {
                const err = await res.json();
                alert(err.detail || 'Не удалось удалить');
            }
        } catch (err) {
            alert('Ошибка сети');
        }
    });

    document.getElementById('btn_edit_entry')?.addEventListener('click', (e) => {
        // Пока просто закрываем просмотр и открываем бронирование
        // В будущем можно заполнить форму данными записи
        viewModal?.classList.add('hidden');
        alert('Редактирование будет доступно в следующей версии');
    });

    async function loadVessels() {
        try {
            const res = await fetch('/api/vessels', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            const vessels = await res.json();
            
            vesselList.innerHTML = vessels.length ? '' : '<li class="empty-msg">Нет судов</li>';
            vesselSelect.innerHTML = '';
            
            vessels.forEach(v => {
                const li = document.createElement('li');
                li.className = 'vessel-item';
                li.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:8px;";
                
                li.innerHTML = `
                    <span>${v.vessel_name} (${v.vessel_number})</span>
                    <button class="btn-del" data-id="${v.id}" data-name="${v.vessel_name}" 
                            style="background:none; border:none; cursor:pointer; font-size:16px; opacity:0.5; transition:0.2s;"
                            onmouseover="this.style.opacity='1'" 
                            onmouseout="this.style.opacity='0.5'">
                        🗑️
                    </button>
                `;
                
                vesselList.appendChild(li);
                vesselSelect.innerHTML += `<option value="${v.id}">${v.vessel_name}</option>`;
            });
        } catch (e) { 
            console.error('Ошибка загрузки судов:', e); 
        }
    }

    async function loadScheduleData(dateStr) {
    try {
        if (!dateStr) {
            const firstCell = document.querySelector('.berth-cell');
            if (firstCell) {
                dateStr = firstCell.dataset.date;
            } else {
                console.error('Не удалось определить дату');
                return;
            }
        }
        
        const bookedCellsForDate = document.querySelectorAll(`td[data-date="${dateStr}"].booked`);
        bookedCellsForDate.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('booked');
            cell.removeAttribute('data-status');
            cell.removeAttribute('data-entryid');
            cell.onclick = null;
            cell.style.cursor = '';
        });

        const url = `/api/schedule?date=${dateStr}`;
        console.log('📥 Загрузка расписания:', url);
        
        const res = await fetch(url, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (!res.ok) {
            const err = await res.json();
            console.error('❌ Ошибка сервера:', err);
            return;
        }
        
        const entries = await res.json();
        console.log('📋 Получено записей:', entries.length);
        
        entries.forEach(entry => {
            const entryDate = String(entry.date).split('T')[0];
            
            const cell = document.querySelector(
                `td[data-date="${entryDate}"][data-hour="${entry.hour}"][data-berth="${entry.berth}"]`
            );
            
            if (!cell) {
                console.warn('⚠️ Ячейка не найдена:', {
                    date: entryDate,
                    hour: entry.hour,
                    berth: entry.berth,
                    expectedSelector: `td[data-date="${entryDate}"][data-hour="${entry.hour}"][data-berth="${entry.berth}"]`
                });
                return;
            }
            
            cell.textContent = entry.vessel_name || 'Занято';
            cell.classList.add('booked');
            cell.dataset.status = entry.status;
            cell.dataset.entryId = entry.id;
            
            // Перезаписываем onclick для просмотра
            cell.onclick = (e) => {
                e.stopPropagation();
                openViewModal(entry.id);
            };
            
            cell.style.cursor = 'pointer';
        });
        
        const allCellsForDate = document.querySelectorAll(`td[data-date="${dateStr}"]`);
        allCellsForDate.forEach(cell => {
            if (!cell.classList.contains('booked')) {
                const hour = parseInt(cell.dataset.hour);
                const berth = cell.dataset.berth;
                
                const isToday = dateStr === dates[0];
                const isTimeLocked = isToday && isTodayPartiallyLocked && hour < 17;
                const hasNoRights = !canEdit;
                
                if (!hasNoRights && !isTimeLocked) {
                    cell.onclick = () => openModal(dateStr, hour, berth);
                    cell.style.cursor = 'pointer';
                } else {
                    cell.onclick = null;
                    cell.style.cursor = 'not-allowed';
                }
            }
        });
    } catch (err) {
        console.error('Ошибка загрузки расписания:', err);
    }
}

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    }
});