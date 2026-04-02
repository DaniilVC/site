// ===== Обработка формы =====
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Предотвращаем перезагрузку страницы
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Отправляем данные на сервер
        await loginUser(email, password);
    });
});

// ===== Функция входа =====
async function loginUser(email, password) {
    const messageDiv = document.getElementById('message');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Успешный вход
            showMessage('✅ Вход выполнен! Перенаправление...', 'success');
            
            // Сохраняем токен (если есть)
            if (data.access_token) {
                localStorage.setItem('access_token', data.access_token);
            }
            
            // Перенаправляем на главную страницу (через 1 секунду)
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 1000);
        } else {
            // Ошибка
            showMessage(`❌ ${data.detail || 'Ошибка входа'}`, 'error');
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        showMessage('❌ Ошибка соединения с сервером', 'error');
    }
}

// ===== Показ сообщения =====
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Автоматически скрыть через 3 секунды
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}
