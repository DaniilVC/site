// ===== ГЛАВНАЯ ФУНКЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Админ-панель загружена');
    
    // 1. Проверяем токен
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        console.log('❌ Нет токена → на login');
        window.location.href = '/login.html';
        return;
    }
    
    // 2. Проверяем, админ ли
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            if (user.role !== 'admin') {
                console.log('❌ Не админ → на dashboard');
                alert('Доступ запрещён! Требуются права администратора.');
                window.location.href = '/dashboard.html';
                return;
            }
            console.log('✅ Пользователь админ:', user.username);
        }
    } catch (error) {
        console.error('❌ Ошибка проверки:', error);
    }
    
    // 3. Загружаем статистику
    await loadStats(token);
    
    // 4. Загружаем пользователей
    await loadUsers(token);
});

// ===== ЗАГРУЗКА СТАТИСТИКИ =====
async function loadStats(token) {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error('Статус: ' + response.status);
        }
        
        const stats = await response.json();
        console.log('✅ Статистика:', stats);
        
        // Отображаем
        document.getElementById('totalUsers').textContent = stats.total;
        document.getElementById('adminCount').textContent = stats.by_role.admin;
        document.getElementById('agentCount').textContent = stats.by_role.agent;
        document.getElementById('viewerCount').textContent = stats.by_role.viewer;
        document.getElementById('directorCount').textContent = stats.by_role.director;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

// ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ =====
async function loadUsers(token) {
    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error('Статус: ' + response.status);
        }
        
        const data = await response.json();
        console.log('✅ Пользователи:', data);
        
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        
        if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">Нет пользователей</td></tr>';
            return;
        }
        
        data.users.forEach(user => {
            const tr = document.createElement('tr');
            
            // Определяем класс для роли
            const roleClass = 'role-' + user.role;
            
            tr.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.telephone_number || '-'}</td>
                <td>${user.company?.name || '-'}</td>
                <td>
                    <span class="role-badge ${roleClass}">${user.role}</span>
                    <select onchange="changeRole(${user.id}, this.value)" 
                            style="margin-left: 10px;">
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                        <option value="agent" ${user.role === 'agent' ? 'selected' : ''}>Agent</option>
                        <option value="director" ${user.role === 'director' ? 'selected' : ''}>Director</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>                        
                    </select>
                </td>
                <td>
                    <button class="btn btn-danger" onclick="deleteUser(${user.id}, '${user.username}')">
                        🗑️ Удалить
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });
        
    } catch (error) {
        console.error('❌ Ошибка загрузки пользователей:', error);
        document.getElementById('usersTableBody').innerHTML = 
            '<tr><td colspan="7">Ошибка загрузки</td></tr>';
    }
}

// ===== СМЕНА РОЛИ =====
async function changeRole(userId, newRole) {
    const token = localStorage.getItem('access_token');
    
    if (!confirm('Изменить роль пользователя на ' + newRole + '?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/users/' + userId + '/role', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: newRole })
        });
        
        if (response.ok) {
            console.log('✅ Роль изменена');
            alert('Роль успешно изменена!');
            location.reload();
        } else {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка');
        }
        
    } catch (error) {
        console.error('❌ Ошибка смены роли:', error);
        alert('Ошибка: ' + error.message);
    }
}

// ===== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ =====
async function deleteUser(userId, username) {
    const token = localStorage.getItem('access_token');
    
    if (!confirm('Удалить пользователя "' + username + '"?\nЭто действие необратимо!')) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/users/' + userId, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.ok) {
            console.log('✅ Пользователь удалён');
            alert('Пользователь удалён!');
            // Перезагружаем страницу
            location.reload();
        } else {
            const error = await response.json();
            throw new Error(error.detail || 'Ошибка');
        }
        
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        alert('Ошибка: ' + error.message);
    }
}