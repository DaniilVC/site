document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login.html'; return; }
        // Определяем роль и права
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userRole = payload.role; // "viewer", "agent", "director" или "admin"
    const canEdit = ['agent', 'director', 'admin'].includes(userRole);

    const tablesContainer = document.getElementById('tablesContainer');
    const modal = document.getElementById('bookingModal');
    const vesselList = document.getElementById('vesselList');
    const vesselSelect = document.getElementById('m_vesselSelect');
        // === WEBSOCKET ПОДКЛЮЧЕНИЕ ===
    let ws;
    function connectWS() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/schedule`);
        
        ws.onopen = () => console.log('📡 WS Connected');
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'schedule_updated') {
                console.log('🔄 Получено обновление для даты:', msg.date);
                // Перезагружаем таблицу для этой даты
                loadScheduleData(msg.date);
            }
        };
        
        ws.onclose = () => setTimeout(connectWS, 3000); // Реконнект
    }
    
    connectWS(); // Запуск

    // ===== ГЕНЕРАЦИЯ ДАТ =====
    const dates = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    // ===== ОТРИСОВКА ТАБЛИЦ =====
    dates.forEach((dateStr, index) => {
        const isToday = index === 0;
        const isReadOnly = isToday || !canEdit;

        const grid = document.createElement('div');
        grid.className = 'schedule-grid';
        grid.innerHTML = `<h2>📅 ${isToday ? 'Сегодня (Только просмотр)' : formatDate(dateStr)}</h2>`;

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
        for (let h = 0; h <= 23; h++) {
            const tr = document.createElement('tr');
            const th = document.createElement('td');
            th.className = 'hour-cell';
            th.textContent = `${h.toString().padStart(2, '0')}:00`;
            tr.appendChild(th);

            for (let b = 1; b <= 5; b++) {
                const td = document.createElement('td');
                td.className = `berth-cell ${isReadOnly ? 'locked' : ''}`;
                td.dataset.date = dateStr;
                td.dataset.hour = h;
                td.dataset.berth = `Причал №${b}`;
                if (!isReadOnly) {
                    td.addEventListener('click', () => openModal(dateStr, h, `Причал №${b}`));
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        grid.appendChild(table);
        tablesContainer.appendChild(grid);
        loadScheduleData(dateStr);
    });

    // ===== ЗАГРУЗКА СУДОВ =====
    loadVessels();
    const addForm = document.getElementById('addVesselForm');
    if (addForm && !canEdit) {
        addForm.style.display = 'none';
    }

    // ===== ОБРАБОТЧИКИ =====
    document.getElementById('closeModal').addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Собираем данные
        const vesselIdRaw = document.getElementById('m_vesselSelect').value;
        const vesselId = parseInt(vesselIdRaw);
        
        const data = {
            date: document.getElementById('m_date').value,  // ✅ Просто date
            hour: parseInt(document.getElementById('m_timeInput').value),
            berth: document.getElementById('m_berthSelect').value,
            vessel_id: parseInt(document.getElementById('m_vesselSelect').value),
            status: document.getElementById('m_status').value
        };
        
        // 🔍 Отладка: смотри в консоль, что отправляем
        console.log('📤 Отправка данных:', data);
        
        // Валидация перед отправкой
        if (!data.date) { alert('Не выбрана дата'); return; }
        if (isNaN(data.hour) || data.hour < 0 || data.hour > 23) { alert('Неверный час'); return; }
        if (isNaN(vesselId) || vesselId <= 0) { 
            alert('Выберите судно из списка!'); 
            console.error('❌ vessel_id невалиден:', vesselIdRaw);
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
                loadScheduleData(data.target_date);
            } else {
                const err = await res.json();
                // Правильный вывод ошибки от FastAPI
                const msg = err.detail?.[0]?.msg || err.detail || 'Ошибка сохранения';
                alert(msg);
                console.error('❌ Ошибка бэкенда:', err);
            }
        } catch (err) {
            alert('Ошибка сети');
            console.error('❌ Network error:', err);
        }
    });

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

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (теперь ВНУТРИ, видят все переменные) =====

    function openModal(date, hour, berth) {
        document.getElementById('m_date').value = date;
        document.getElementById('m_hour').value = hour;
        document.getElementById('m_berth').value = berth;
        document.getElementById('m_timeInput').value = hour;
        document.getElementById('m_berthSelect').value = berth;
        modal.classList.remove('hidden');
    }

    async function loadVessels() {
        try {
            const res = await fetch('/api/vessels', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            const vessels = await res.json();
            
            vesselList.innerHTML = vessels.length ? '' : '<li class="empty-msg">Нет судов</li>';
            vesselSelect.innerHTML = '';
            
            vessels.forEach(v => {
                vesselList.innerHTML += `<li>${v.vessel_name} (${v.vessel_number})</li>`;
                vesselSelect.innerHTML += `<option value="${v.id}">${v.vessel_name}</option>`;
            });
        } catch (e) { 
            console.error('Ошибка загрузки судов:', e); 
        }
    }

    async function loadScheduleData(dateStr) {
        try {
            // Если дата не передана, берём из текущей таблицы
            if (!dateStr) {
                const firstCell = document.querySelector('.berth-cell');
                if (firstCell) {
                    dateStr = firstCell.dataset.date;
                } else {
                    console.error('Не удалось определить дату');
                    return;
                }
            }
            
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
                const entryDate = entry.date;  // ✅ Теперь поле называется "date"
                const cell = document.querySelector(`td[data-date="${entryDate}"][data-hour="${entry.hour}"][data-berth="${entry.berth}"]`);
                if (cell) {
                    cell.textContent = entry.vessel_name || 'Занято';
                    cell.classList.add('booked');
                }
            });
        } catch (e) { 
            console.error('Ошибка загрузки расписания:', e); 
        }
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    }
});