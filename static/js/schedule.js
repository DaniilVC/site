document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login.html'; return; }

    const tablesContainer = document.getElementById('tablesContainer');
    const modal = document.getElementById('bookingModal');
    const vesselList = document.getElementById('vesselList');
    const vesselSelect = document.getElementById('m_vesselSelect');

    // Генерация дат: сегодня, завтра, +2, +3
    const dates = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    // 1. Отрисовка таблиц
    dates.forEach((dateStr, index) => {
        const isToday = index === 0;
        const isReadOnly = isToday; // Сегодня только смотрим

        const grid = document.createElement('div');
        grid.className = 'schedule-grid';
        grid.innerHTML = `<h2>📅 ${isToday ? 'Сегодня (Только просмотр)' : formatDate(dateStr)}</h2>`;

        const table = document.createElement('table');
        table.className = 's-table';
        
        // Заголовки
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
            
            // Ячейка часа
            const th = document.createElement('td');
            th.className = 'hour-cell';
            th.textContent = `${h.toString().padStart(2, '0')}:00`;
            tr.appendChild(th);

            // Ячейки причалов
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

        // Загружаем данные для этой даты
        loadScheduleData(dateStr);
    });

    // 2. Загрузка списка судов
    loadVessels();

    // 3. Обработчики модального окна
    document.getElementById('closeModal').addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    document.getElementById('bookingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            date: document.getElementById('m_date').value,
            hour: parseInt(document.getElementById('m_timeInput').value),
            berth: document.getElementById('m_berthSelect').value,
            vessel_id: parseInt(document.getElementById('m_vesselSelect').value),
            status: document.getElementById('m_status').value
        };

        try {
            const res = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                modal.classList.add('hidden');
                loadScheduleData(data.date); // Обновляем только нужную таблицу
            } else {
                const err = await res.json();
                alert(err.detail || 'Ошибка сохранения');
            }
        } catch (err) {
            alert('Ошибка сети');
        }
    });

    // 4. Добавление судна
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
                alert('Не удалось добавить судно');
            }
        } catch (err) {
            alert('Ошибка');
        }
    });
});

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function openModal(date, hour, berth) {
    document.getElementById('m_date').value = date;
    document.getElementById('m_hour').value = hour;
    document.getElementById('m_berth').value = berth;
    document.getElementById('m_timeInput').value = hour;
    document.getElementById('m_berthSelect').value = berth;
    document.getElementById('bookingModal').classList.remove('hidden');
}

async function loadVessels() {
    try {
        const res = await fetch('/api/vessels', { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
        const vessels = await res.json();
        
        vesselList.innerHTML = vessels.length ? '' : '<li class="empty-msg">Нет судов</li>';
        vesselSelect.innerHTML = '';
        
        vessels.forEach(v => {
            vesselList.innerHTML += `<li>${v.vessel_name} (${v.vessel_number})</li>`;
            vesselSelect.innerHTML += `<option value="${v.id}">${v.vessel_name}</option>`;
        });
    } catch (e) { console.error(e); }
}

async function loadScheduleData(date) {
    try {
        const res = await fetch(`/api/schedule?date=${date}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
        const entries = await res.json();
        
        entries.forEach(entry => {
            const cell = document.querySelector(`td[data-date="${entry.date}"][data-hour="${entry.hour}"][data-berth="${entry.berth}"]`);
            if (cell) {
                cell.textContent = entry.vessel_name || 'Занято';
                cell.classList.add('booked');
            }
        });
    } catch (e) { console.error(e); }
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}