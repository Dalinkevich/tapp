/**
 * Telegram Mini App - Основной скрипт
 * Интеграция с Telegram WebApp SDK
 */

class TelegramMiniApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.user = null;
        this.counter = 0;
        
        this.init();
    }

    /**
     * Инициализация приложения
     */
    init() {
        // Сообщаем Telegram, что приложение готово
        this.tg.ready();
        
        // Расширяем приложение на полный экран (опционально)
        this.tg.expand();
        
        // Инициализация данных пользователя
        this.initUserData();
        
        // Настройка темы
        this.initTheme();
        
        // Настройка обработчиков событий
        this.setupEventListeners();
        
        // Настройка нативных кнопок Telegram
        this.setupMainButton();
        
        // Отображение информации о теме
        this.displayThemeColors();
        
        console.log('✅ Mini App инициализирован');
        console.log('📱 Платформа:', this.tg.platform);
        console.log('🎨 Версия:', this.tg.version);
    }

    /**
     * Инициализация данных пользователя
     */
    initUserData() {
        // Получаем данные пользователя из initDataUnsafe
        const initData = this.tg.initDataUnsafe;
        
        if (initData && initData.user) {
            this.user = initData.user;
            
            // Обновляем UI с данными пользователя
            document.getElementById('user-name').textContent = 
                `${this.user.first_name} ${this.user.last_name || ''}`;
            document.getElementById('user-id').textContent = `ID: ${this.user.id}`;
            
            // Если есть фото, можно отобразить его
            if (this.user.photo_url) {
                document.getElementById('user-avatar').innerHTML = 
                    `<img src="${this.user.photo_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }
        } else {
            // Демо-режим (если открыто не через Telegram)
            document.getElementById('user-name').textContent = 'Гость';
            document.getElementById('user-id').textContent = 'Демо-режим';
        }
    }

    /**
     * Инициализация темы
     */
    initTheme() {
        // Устанавливаем цвет шапки Telegram
        this.tg.setHeaderColor(this.tg.colorScheme === 'dark' ? '#1c1c1e' : '#ffffff');
        
        // Применяем CSS-переменные из Telegram
        this.applyThemeColors();
        
        // Слушаем изменения темы
        this.tg.onEvent('themeChanged', () => {
            this.applyThemeColors();
            this.displayThemeColors();
        });
    }

    /**
     * Применение цветов темы из Telegram
     */
    applyThemeColors() {
        const root = document.documentElement;
        const theme = this.tg.themeParams;
        
        // Применяем все цвета из Telegram
        if (theme.bg_color) root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
        if (theme.text_color) root.style.setProperty('--tg-theme-text-color', theme.text_color);
        if (theme.hint_color) root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
        if (theme.link_color) root.style.setProperty('--tg-theme-link-color', theme.link_color);
        if (theme.button_color) root.style.setProperty('--tg-theme-button-color', theme.button_color);
        if (theme.button_text_color) root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
        if (theme.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
        
        // Устанавливаем атрибут data-theme для CSS
        document.body.setAttribute('data-theme', this.tg.colorScheme);
    }

    /**
     * Отображение текущих цветов темы
     */
    displayThemeColors() {
        const container = document.getElementById('theme-colors');
        const theme = this.tg.themeParams;
        
        const colors = [
            { name: 'bg', color: theme.bg_color || '#fff' },
            { name: 'text', color: theme.text_color || '#000' },
            { name: 'hint', color: theme.hint_color || '#999' },
            { name: 'button', color: theme.button_color || '#2481cc' },
            { name: 'secondary', color: theme.secondary_bg_color || '#f5f5f5' }
        ];
        
        container.innerHTML = colors.map(c => `
            <div class="color-chip">
                <div class="color-dot" style="background: ${c.color}"></div>
                <span>${c.name}</span>
            </div>
        `).join('');
    }

    /**
     * Настройка MainButton (нижняя кнопка в Telegram)
     */
    setupMainButton() {
        const mainBtn = this.tg.MainButton;
        
        mainBtn.setText('🚀 Закрыть приложение');
        mainBtn.setParams({
            color: '#2481cc',
            text_color: '#ffffff',
            is_active: true,
            is_visible: true
        });
        
        mainBtn.onClick(() => {
            this.tg.close();
        });
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Кнопка вибрации
        document.getElementById('btn-haptic').addEventListener('click', () => {
            this.sendHapticFeedback('impact', 'medium');
            this.showNotification('Вибрация отправлена!');
        });

        // Кнопка popup
        document.getElementById('btn-popup').addEventListener('click', () => {
            this.showPopup();
        });

        // Кнопка данных
        document.getElementById('btn-data').addEventListener('click', () => {
            this.showUserData();
        });

        // Кнопка поделиться
        document.getElementById('btn-share').addEventListener('click', () => {
            this.shareApp();
        });

        // Переключатель темы
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Счетчик
        document.getElementById('btn-plus').addEventListener('click', () => {
            this.updateCounter(1);
        });

        document.getElementById('btn-minus').addEventListener('click', () => {
            this.updateCounter(-1);
        });

        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.currentTarget);
            });
        });
    }

    /**
     * Отправка тактильной обратной связи
     */
    sendHapticFeedback(type, style) {
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred(style);
        }
    }

    /**
     * Показать нативный popup Telegram
     */
    showPopup() {
        this.tg.showPopup({
            title: 'Привет из Mini App! 👋',
            message: 'Это нативный popup Telegram. Он автоматически стилизуется под тему приложения.',
            buttons: [
                { id: 'ok', type: 'default', text: 'Отлично!' },
                { id: 'cancel', type: 'destructive', text: 'Закрыть' }
            ]
        }, (buttonId) => {
            if (buttonId === 'ok') {
                this.sendHapticFeedback('notification', 'success');
            }
        });
    }

    /**
     * Показать данные пользователя
     */
    showUserData() {
        if (!this.user) {
            this.tg.showAlert('Данные пользователя недоступны в демо-режиме');
            return;
        }

        const info = `
👤 <b>Пользователь:</b> ${this.user.first_name} ${this.user.last_name || ''}
🆔 <b>ID:</b> ${this.user.id}
👤 <b>Username:</b> ${this.user.username ? '@' + this.user.username : 'не указан'}
🌐 <b>Язык:</b> ${this.user.language_code || 'не указан'}
        `;

        this.tg.showPopup({
            title: 'Данные пользователя',
            message: info,
            buttons: [{ type: 'default', text: 'OK' }]
        });
    }

    /**
     * Поделиться приложением
     */
    shareApp() {
        const text = 'Посмотри это крутое Mini App в Telegram! 🚀';
        
        // Используем switchInlineQuery для шеринга через бота
        if (this.tg.switchInlineQuery) {
            this.tg.switchInlineQuery(text, ['users', 'groups', 'channels']);
        } else {
            // Fallback - копируем в буфер обмена
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('Ссылка скопирована!');
            });
        }
    }

    /**
     * Обновление счетчика
     */
    updateCounter(delta) {
        this.counter += delta;
        const display = document.getElementById('counter');
        
        // Анимация изменения
        display.classList.add('pulse');
        setTimeout(() => display.classList.remove('pulse'), 300);
        
        // Обновление значения
        display.textContent = this.counter;
        
        // Вибрация
        this.sendHapticFeedback('impact', delta > 0 ? 'light' : 'rigid');
        
        // Обновляем текст MainButton
        this.tg.MainButton.setText(`Счетчик: ${this.counter}`);
    }

    /**
     * Переключение темы (для демо)
     */
    toggleTheme() {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        
        // Инвертируем цвета для демонстрации
        this.sendHapticFeedback('selection');
    }

    /**
     * Переключение вкладок навигации
     */
    switchTab(button) {
        // Убираем активный класс у всех кнопок
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Добавляем активный класс нажатой кнопке
        button.classList.add('active');
        
        // Вибрация
        this.sendHapticFeedback('selection');
        
        // Получаем страницу
        const page = button.getAttribute('data-page');
        this.handlePageChange(page);
    }

    /**
     * Обработка смены страницы
     */
    handlePageChange(page) {
        // Здесь можно добавить роутинг
        console.log('Переход на страницу:', page);
        
        // Пример: показываем уведомление
        const messages = {
            home: 'Вы на главной странице',
            profile: 'Раздел профиля в разработке',
            settings: 'Настройки в разработке'
        };
        
        if (page !== 'home') {
            this.tg.showAlert(messages[page]);
        }
    }

    /**
     * Показать уведомление (всплывающее)
     */
    showNotification(message) {
        // Создаем кастомное уведомление
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--tg-theme-button-color);
            color: var(--tg-theme-button-text-color);
            padding: 12px 24px;
            border-radius: 24px;
            font-weight: 500;
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notif.textContent = message;
        
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.style.animation = 'fadeIn 0.3s ease-out reverse';
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }
}

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.miniApp = new TelegramMiniApp();
});
