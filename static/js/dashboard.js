// ===== ГЛАВНАЯ ФУНКЦИЯ ПРИ ЗАГРУЗКЕ =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Dashboard загружен');
    
    // 1. Проверяем токен
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        console.log('❌ Нет токена → на login');
        window.location.href = '/login.html';
        return;
    }
    
    console.log('✅ Токен есть:', token.substring(0, 20) + '...');
    
    // 2. Загружаем данные
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (response.status === 401) {
            console.log('❌ Токен невалиден');
            localStorage.removeItem('access_token');
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Статус: ' + response.status);
        }
        
        const user = await response.json();
        console.log('✅ Данные получены:', user);
        
        // 3. Отображаем данные
        document.getElementById('username').textContent = user.username;
        document.getElementById('email').textContent = user.email;
        document.getElementById('role').textContent = user.role;
        document.getElementById('telephone_number').textContent = user.telephone_number || 'Не указан';
        document.getElementById('company').textContent = user.company || 'Не указана';
        
        // 4. Скрываем "Загрузка..."
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) {
            loadingMsg.style.display = 'none';
        }
        
        console.log('✅ Данные отображены');
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('Ошибка загрузки данных: ' + error.message);
    }
});

// ===== КНОПКА ВЫХОДА =====
function logout() {
    if (!confirm('Выйти из системы?')) {
        return;
    }
    
    console.log('🚪 Выход из системы');
    
    // Очищаем всё
    localStorage.removeItem('access_token');
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    localStorage.removeItem('role');
    
    // Отправляем запрос на logout (не обязательно, но хорошо)
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    
    // Перенаправляем на вход
    window.location.href = '/login.html';
}

// ===== Вешаем обработчик на кнопку =====
window.addEventListener('load', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = logout;
        console.log('✅ Кнопка выхода подключена');
    }
});