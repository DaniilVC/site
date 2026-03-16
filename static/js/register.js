document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            username: document.getElementById('username').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            telephone_number: document.getElementById('telephone_number').value.trim() || "Отсутствует",
            company: document.getElementById('company').value.trim() || "Без компании"
        };
        
        await registerUser(formData);
    });
});

async function registerUser(data) {
    const messageDiv = document.getElementById('message');
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('✅ Регистрация успешна! Перенаправление...', 'success');
            
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } else {
            showMessage(`❌ ${result.detail || 'Ошибка регистрации'}`, 'error');
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        showMessage('❌ Ошибка соединения с сервером', 'error');
    }
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}