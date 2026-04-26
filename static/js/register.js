document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const companySelect = document.getElementById('company');
    const companyCustomInput = document.getElementById('companyCustom');
    const toggleLink = document.getElementById('toggleCompany');
    
    // Загружаем список компаний при старте
    loadCompanies();
    
    // Переключение между списком и ручным вводом
    if (toggleLink) {
        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCompanyInput();
        });
    }
    
    // Обработка формы регистрации
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Определяем, какое поле компании использовать
            const companyValue = getCompanyValue();
            
            const formData = {
                username: document.getElementById('username').value.trim(),
                email: document.getElementById('email').value.trim(),
                password: document.getElementById('password').value,
                telephone_number: document.getElementById('telephone_number').value.trim() || "Отсутствует",
                company: companyValue
            };
            
            // Валидация
            if (!formData.username) {
                showMessage('❌ Введите имя пользователя', 'error');
                return;
            }
            if (!formData.email || !isValidEmail(formData.email)) {
                showMessage('❌ Введите корректный email', 'error');
                return;
            }
            if (!formData.password || formData.password.length < 6) {
                showMessage('❌ Пароль должен быть не менее 6 символов', 'error');
                return;
            }
            
            // ⚠️ ПРОВЕРКА: выбрана ли компания
            if (!companyValue || companyValue === "" || companyValue === "Без компании") {
                const confirmed = confirm(
                    '⚠️ Внимание!\n\n' +
                    'Вы не выбрали компанию.\n\n' +
                    '• Если вы зарегистрируетесь без компании, вы не сможете присоединиться к существующей организации.\n' +
                    'Продолжить регистрацию без компании?'
                );
                
                if (!confirmed) {
                    // Пользователь отменил — возвращаемся к выбору
                    showMessage('👉 Пожалуйста, выберите или введите название компании', 'error');
                    companySelect.focus();
                    return;
                }
            }
            
            await registerUser(formData);
        });
    }
});

// ===== ЗАГРУЗКА СПИСКА КОМПАНИЙ =====
async function loadCompanies() {
    const select = document.getElementById('company');
    if (!select) return;
    
    try {
        const response = await fetch('/api/companies');
        
        if (response.ok) {
            const companies = await response.json();
            
            // Очищаем список
            select.innerHTML = '<option value="">-- Выберите компанию --</option>';
            
            // Флаг, есть ли уже "Без компании" в списке
            let hasNoCompany = false;
            
            companies.forEach(company => {
                const option = document.createElement('option');
                option.value = company.name;
                option.textContent = company.name;
                select.appendChild(option);
                
                if (company.name === "Без компании") {
                    hasNoCompany = true;
                }
            });
            
            // Добавляем "Без компании" только если её нет в базе
            if (!hasNoCompany) {
                const noCompany = document.createElement('option');
                noCompany.value = "Без компании";
                noCompany.textContent = "Без компании";
                select.appendChild(noCompany);
            }
        } else {
            console.warn('Не удалось загрузить список компаний');
        }
    } catch (error) {
        console.error('Ошибка загрузки компаний:', error);
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ ВВОДА КОМПАНИИ =====
function toggleCompanyInput() {
    const select = document.getElementById('company');
    const customInput = document.getElementById('companyCustom');
    const toggleLink = document.getElementById('toggleCompany');
    
    if (!select || !customInput || !toggleLink) return;
    
    const isCustomVisible = customInput.style.display === 'block';
    
    if (isCustomVisible) {
        // Переключаемся на список
        select.style.display = 'block';
        select.required = true;
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
        toggleLink.textContent = 'Нет вашей компании? Добавить';
    } else {
        // Переключаемся на ручной ввод
        select.style.display = 'none';
        select.required = false;
        customInput.style.display = 'block';
        customInput.required = true;
        customInput.placeholder = 'Введите название компании';
        toggleLink.textContent = 'Выбрать из списка';
    }
}

// ===== ПОЛУЧЕНИЕ ЗНАЧЕНИЯ КОМПАНИИ =====
function getCompanyValue() {
    const customInput = document.getElementById('companyCustom');
    const select = document.getElementById('company');
    
    if (customInput && customInput.style.display === 'block') {
        return customInput.value.trim() || "";
    }
    
    if (select) {
        return select.value.trim() || "";
    }
    
    return "";
}

// ===== РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ =====
async function registerUser(data) {
    const messageDiv = document.getElementById('message');
    const submitBtn = document.querySelector('.register-btn');
    
    // Блокируем кнопку
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Регистрация...';
    }
    
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
            showMessage('✅ ' + (result.message || 'Регистрация успешна!'), 'success');
            
            // Перенаправление через 2 секунды
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            // Ошибка от сервера
            const errorMsg = result.detail || 'Ошибка регистрации';
            showMessage('❌ ' + errorMsg, 'error');
            
            // Разблокируем кнопку
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Зарегистрироваться';
            }
        }
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showMessage('❌ Ошибка соединения с сервером. Проверьте подключение.', 'error');
        
        // Разблокируем кнопку
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Зарегистрироваться';
        }
    }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) {
        alert(text);
        return;
    }
    
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Автозакрытие через 5 секунд для ошибок, через 2 для успеха
    const timeout = type === 'success' ? 2000 : 5000;
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, timeout);
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}