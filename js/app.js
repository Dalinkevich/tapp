class CollaborativeShoppingList {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.isTelegram = !!this.tg;
        
        // Данные
        this.items = [];
        this.listId = null; // ID совместного списка
        this.userId = null;
        this.userName = null;
        this.lastSync = 0;
        this.syncInterval = null;
        
        this.init();
    }

    async init() {
        if (!this.isTelegram) {
            this.initDemoMode();
            return;
        }

        this.tg.ready();
        this.tg.expand();
        
        // Получаем данные пользователя
        this.initUserData();
        
        // Проверяем start_param (приглашение в список)
        this.checkInvitation();
        
        // Инициализация
        this.initTheme();
        this.setupEventListeners();
        
        // Загружаем или создаём список
        await this.loadOrCreateList();
        
        // Запускаем синхронизацию
        this.startSync();
        
        // Обновляем UI
        this.render();
        this.updateConnectionStatus();
    }

    initUserData() {
        const user = this.tg.initDataUnsafe?.user;
        if (user) {
            this.userId = user.id.toString();
            this.userName = user.first_name || 'Пользователь';
        } else {
            this.userId = 'demo_' + Date.now();
            this.userName = 'Гость';
        }
    }

    // Проверяем, пригласили ли нас в список
    checkInvitation() {
        const initData = this.tg.initDataUnsafe;
        
        // Проверяем start_param (когда открываем через t.me/bot?startapp=LIST_ID)
        if (initData?.start_param) {
            this.pendingListId = initData.start_param;
            this.showJoinModal();
        }
        
        // Проверяем реферальный параметр в URL (для веб-версии)
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref && !this.listId) {
            this.pendingListId = ref;
            this.showJoinModal();
        }
    }

    showJoinModal() {
        const modal = document.getElementById('join-modal');
        modal.classList.remove('hidden');
        
        document.getElementById('modal-confirm').onclick = () => {
            this.joinList(this.pendingListId);
            modal.classList.add('hidden');
        };
        
        document.getElementById('modal-cancel').onclick = () => {
            modal.classList.add('hidden');
            this.pendingListId = null;
        };
    }

    async loadOrCreateList() {
        // Пробуем загрузить существующий список из CloudStorage
        try {
            const saved = await this.cloudStorageGet('current_list');
            if (saved) {
                const data = JSON.parse(saved);
                this.listId = data.listId;
                this.items = data.items || [];
                console.log('✅ Загружен список:', this.listId);
            }
        } catch (e) {
            console.log('Нет сохранённого списка');
        }

        // Если нет списка — создаём новый
        if (!this.listId) {
            this.createNewList();
        }
    }

    createNewList() {
        this.listId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.items = [];
        this.saveList();
        console.log('🆕 Создан новый список:', this.listId);
    }

    async joinList(listId) {
        this.listId = listId;
        this.pendingListId = null;
        
        // Загружаем данные списка из облака
        await this.syncFromCloud();
        
        // Сохраняем у себя
        this.saveList();
        
        // Показываем уведомление
        this.showNotification('👥 Вы присоединились к списку!');
        
        this.render();
        this.updateShareInfo();
    }

    // CloudStorage операции
    cloudStorageGet(key) {
        return new Promise((resolve) => {
            if (!this.tg?.CloudStorage) {
                // Fallback на localStorage
                resolve(localStorage.getItem(key));
                return;
            }
            this.tg.CloudStorage.getItem(key, (err, value) => {
                resolve(err ? null : value);
            });
        });
    }

    cloudStorageSet(key, value) {
        return new Promise((resolve) => {
            if (!this.tg?.CloudStorage) {
                localStorage.setItem(key, value);
                resolve();
                return;
            }
            this.tg.CloudStorage.setItem(key, value, (err) => {
                resolve(!err);
            });
        });
    }

    // Синхронизация с облаком
    async syncToCloud() {
        if (!this.listId) return;
        
        const data = {
            items: this.items,
            updatedAt: Date.now(),
            updatedBy: this.userId,
            updatedByName: this.userName
        };
        
        try {
            await this.cloudStorageSet(`shared_list_${this.listId}`, JSON.stringify(data));
            this.lastSync = Date.now();
            console.log('☁️ Синхронизировано в облако');
        } catch (e) {
            console.error('Ошибка синхронизации:', e);
        }
    }

    async syncFromCloud() {
        if (!this.listId) return;
        
        try {
            const data = await this.cloudStorageGet(`shared_list_${this.listId}`);
            if (data) {
                const parsed = JSON.parse(data);
                
                // Объединяем изменения (простая стратегия: более новые данные побеждают)
                if (parsed.updatedAt > this.lastSync) {
                    this.items = parsed.items || [];
                    this.lastSync = parsed.updatedAt;
                    console.log('📥 Загружено из облака, обновлено:', new Date(parsed.updatedAt));
                    return true;
                }
            }
        } catch (e) {
            console.error('Ошибка загрузки:', e);
        }
        return false;
    }

    startSync() {
        // Синхронизация каждые 3 секунды
        this.syncInterval = setInterval(async () => {
            const updated = await this.syncFromCloud();
            if (updated) {
                this.render();
                this.showNotification('🔄 Список обновлён!', 1000);
            }
        }, 3000);

        // Синхронизация при возвращении в приложение
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.syncFromCloud().then(updated => {
                    if (updated) this.render();
                });
            }
        });
    }

    // Действия с товарами
    async addItem() {
        const input = document.getElementById('item-input');
        const text = input.value.trim();
        
        if (!text) return;
        
        const item = {
            id: Date.now().toString(),
            text: text,
            purchased: false,
            addedBy: this.userId,
            addedByName: this.userName,
            addedAt: Date.now()
        };
        
        this.items.unshift(item);
        await this.saveAndSync();
        input.value = '';
        
        this.haptic('light');
        this.render();
    }

    async toggleItem(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.purchased = !item.purchased;
            item.purchasedBy = item.purchased ? this.userId : null;
            item.purchasedByName = item.purchased ? this.userName : null;
            item.purchasedAt = item.purchased ? Date.now() : null;
            
            await this.saveAndSync();
            this.haptic(item.purchased ? 'medium' : 'light');
            this.render();
        }
    }

    async deleteItem(id, event) {
        event.stopPropagation();
        this.items = this.items.filter(i => i.id !== id);
        await this.saveAndSync();
        this.haptic('rigid');
        this.render();
    }

    async clearAll() {
        if (this.items.length === 0) return;
        
        this.tg.showPopup({
            title: 'Очистить список?',
            message: 'Все товары будут удалены для всех участников.',
            buttons: [
                { id: 'cancel', type: 'cancel', text: 'Отмена' },
                { id: 'clear', type: 'destructive', text: 'Очистить' }
            ]
        }, async (buttonId) => {
            if (buttonId === 'clear') {
                this.items = [];
                await this.saveAndSync();
                this.haptic('success');
                this.render();
            }
        });
    }

    async saveAndSync() {
        this.saveList();
        await this.syncToCloud();
    }

    saveList() {
        const data = {
            listId: this.listId,
            items: this.items,
            savedAt: Date.now()
        };
        this.cloudStorageSet('current_list', JSON.stringify(data));
    }

    // Поделиться списком
    shareList() {
        if (!this.listId) return;
        
        // Создаём ссылку для приглашения
        const shareText = `🛒 Присоединяйся к списку покупок!\n\n` +
                         `Я создал список в Telegram Mini App.\n` +
                         `Нажми кнопку, чтобы открыть и редактировать вместе со мной.`;
        
        // Используем switchInlineQuery для шеринга через бота
        if (this.tg.switchInlineQuery) {
            this.tg.switchInlineQuery(this.listId, ['users', 'groups']);
        } else {
            // Fallback: копируем ссылку
            const url = `https://t.me/ВАШ_БОТ?startapp=${this.listId}`;
            navigator.clipboard.writeText(`${shareText}\n\n${url}`).then(() => {
                this.showNotification('📋 Ссылка скопирована! Отправьте другу.');
            });
        }
        
        this.updateShareInfo();
    }

    // UI обновления
    updateShareInfo() {
        const shareInfo = document.getElementById('share-info');
        if (this.listId) {
            shareInfo.style.display = 'flex';
        }
    }

    updateConnectionStatus() {
        const status = document.getElementById('sync-status');
        if (this.listId) {
            status.textContent = '👥';
            status.title = 'Совместный список активен';
        }
    }

    // Рендеринг
    render() {
        const listContainer = document.getElementById('shopping-list');
        const emptyState = document.getElementById('empty-state');
        
        if (this.items.length === 0) {
            listContainer.classList.add('hidden');
            emptyState.classList.remove('hidden');
            this.updateProgress();
            return;
        }
        
        listContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        // Сортируем
        const sortedItems = [...this.items].sort((a, b) => {
            if (a.purchased !== b.purchased) return a.purchased ? 1 : -1;
            return b.addedAt - a.addedAt;
        });
        
        listContainer.innerHTML = sortedItems.map(item => this.renderItem(item)).join('');
        this.updateProgress();
    }

    renderItem(item) {
        const whoAdded = item.addedByName && item.addedBy !== this.userId 
            ? `<span class="item-meta">добавил ${item.addedByName}</span>` 
            : '';
        const whoPurchased = item.purchased && item.purchasedByName && item.purchasedBy !== this.userId
            ? `<span class="item-meta purchased-by">взял ${item.purchasedByName}</span>`
            : '';
        
        return `
            <div class="item ${item.purchased ? 'purchased' : ''}" onclick="app.toggleItem('${item.id}')">
                <div class="checkbox">
                    <span class="checkbox-check">✓</span>
                </div>
                <div class="item-content">
                    <span class="item-text">${this.escapeHtml(item.text)}</span>
                    ${whoAdded}
                    ${whoPurchased}
                </div>
                <button class="delete-btn" onclick="app.deleteItem('${item.id}', event)">×</button>
            </div>
        `;
    }

    updateProgress() {
        const total = this.items.length;
        const purchased = this.items.filter(i => i.purchased).length;
        const percent = total > 0 ? (purchased / total) * 100 : 0;
        
        document.getElementById('progress-text').textContent = 
            `${purchased} из ${total} куплено`;
        document.getElementById('progress-bar').style.width = `${percent}%`;
    }

    // Вспомогательные методы
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    haptic(type) {
        if (!this.tg?.HapticFeedback) return;
        try {
            if (type === 'success') {
                this.tg.HapticFeedback.notificationOccurred('success');
            } else {
                this.tg.HapticFeedback.impactOccurred(type);
            }
        } catch (e) {}
    }

    showNotification(message, duration = 2000) {
        const notif = document.createElement('div');
        notif.className = 'notification';
        notif.textContent = message;
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 300);
        }, duration);
    }

    initTheme() {
        if (!this.tg) return;
        this.tg.setHeaderColor(this.tg.colorScheme === 'dark' ? '#1c1c1e' : '#ffffff');
        
        const theme = this.tg.themeParams || {};
        const root = document.documentElement;
        
        if (theme.bg_color) root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
        if (theme.text_color) root.style.setProperty('--tg-theme-text-color', theme.text_color);
        if (theme.hint_color) root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
        if (theme.button_color) root.style.setProperty('--tg-theme-button-color', theme.button_color);
        if (theme.button_text_color) root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
        if (theme.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
        
        document.body.setAttribute('data-theme', this.tg.colorScheme || 'light');
    }

    setupEventListeners() {
        document.getElementById('add-btn').addEventListener('click', () => this.addItem());
        document.getElementById('item-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme');
            document.body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
            this.haptic('selection');
        });
        document.getElementById('clear-btn').addEventListener('click', () => this.clearAll());
        document.getElementById('share-btn').addEventListener('click', () => this.shareList());
    }

    initDemoMode() {
        console.log('Demo mode');
        this.listId = 'demo_' + Date.now();
        this.items = [];
        this.render();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new CollaborativeShoppingList();
});
