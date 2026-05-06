const TOKEN = localStorage.getItem('access_token');
const TABLE_BODY = document.getElementById('emp-table-body');

document.addEventListener('DOMContentLoaded', async () => {
    await loadStats();
    await loadEmployees();
});

// Загрузка статистики
async function loadStats() {
    try {
        const res = await fetch('/api/directory/stats', {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        if (!res.ok) return; // Статистика опциональна
        
        const stats = await res.json();
        document.getElementById('totalEmployees').textContent = stats.total;
        document.getElementById('agentCount').textContent = stats.by_role?.agent || 0;
        document.getElementById('viewerCount').textContent = stats.by_role?.viewer || 0;
    } catch (e) {
        console.log('Статистика не загрузилась (не критично)');
    }
}

// Загрузка сотрудников
async function loadEmployees() {
    try {
        const res = await fetch('/api/directory/employees', {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        if (!res.ok) {
            if (res.status === 403) {
                TABLE_BODY.innerHTML = '<tr><td colspan="4">❌ Нет доступа</td></tr>';
                return;
            }
            throw new Error(`Ошибка ${res.status}`);
        }
        const employees = await res.json();
        renderTable(Array.isArray(employees) ? employees : []);
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        TABLE_BODY.innerHTML = '<tr><td colspan="4">⚠️ Ошибка загрузки данных</td></tr>';
    }
}

function renderTable(employees) {
    TABLE_BODY.innerHTML = '';
    if (!employees.length) {
        TABLE_BODY.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-secondary);">Список пуст</td></tr>';
        return;
    }

    employees.forEach(emp => {
        const tr = document.createElement('tr');
        
        const badgeClass = `role-badge role-${emp.role}`;

        tr.innerHTML = `
            <td><strong>${emp.username}</strong></td>
            <td>${emp.email || '-'}</td>
            <td>
                <span class="${badgeClass}">${emp.role}</span>
                <select onchange="changeRole(${emp.id}, this.value)">
                    <option value="viewer" ${emp.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    <option value="agent" ${emp.role === 'agent' ? 'selected' : ''}>Agent</option>
                </select>
            </td>
            <td>
                <button class="btn btn-danger" onclick="deleteEmp(${emp.id}, '${emp.username}')">🗑️ Удалить</button>
            </td>
        `;
        TABLE_BODY.appendChild(tr);
    });
}

// Смена роли
async function changeRole(id, newRole) {
    const select = event.target;
    const original = select.dataset.orig;
    
    if (!confirm(`Изменить роль на "${newRole}"?`)) {
        select.value = original; // откат
        return;
    }
    
    try {
        const res = await fetch(`/api/directory/employees/${id}/role`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: newRole })
        });
        
        if (res.ok) {
            select.dataset.orig = newRole;
            alert('✅ Роль изменена');
            loadEmployees();
            loadStats();
        } else {
            const err = await res.json();
            select.value = original; // откат UI
            alert('❌ ' + (err.detail || 'Ошибка сервера'));
        }
    } catch (e) {
        select.value = original;
        alert('❌ Ошибка сети');
    }
}

// Удаление
async function deleteEmp(id, username) {
    if (!confirm(`Удалить "${username}"?\nЭто действие необратимо.`)) return;
    
    try {
        const res = await fetch(`/api/directory/employees/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        
        if (res.ok) {
            alert('✅ Сотрудник удалён');
            loadEmployees(); // перезагружаем таблицу
        } else {
            const err = await res.json();
            alert('❌ ' + (err.detail || 'Ошибка'));
        }
    } catch (e) {
        alert('❌ Ошибка сети');
    }
}

// Защита от XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}