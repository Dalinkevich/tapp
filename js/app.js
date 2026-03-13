class CollaborativeShoppingList {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.isTelegram = !!this.tg;
        this.items = [];
        this.listId = null;
        this.userId = null;
        this.userName = null;
        
        this.firebaseUrl = 'https://database-7a0a8-default-rtdb.europe-west1.firebasedatabase.app/';
        
        this.init();
    }

    async init() {
        if (!this.isTelegram) {
            this.initDemoMode();
            return;
        }

        this.tg.ready();
        this.tg.expand();
        
        this.initUserData();
        this.checkInvitation();
        this.initTheme();
        this.setupEventListeners();
        
        // Загружаем или создаём список
        await this.loadOrCreateList();
        
        // Запускаем реальное время Firebase
        this.startRealtimeSync();
        
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

    checkInvitation() {
        const initData = this.tg.initDataUnsafe;
        
        if (initData?.start_param) {
            this.pendingListId = initData.start_param;
            this.showJoinModal();
        }
    }

    showJoinModal() {
        const modal = document.getElementById('join-modal');
        if (!modal) return;
        
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
        // Пробуем загрузить сохранённый listId
        try {
            const saved = await this.cloudStorageGet('current_list');
            if (saved) {
                const data = JSON.parse(saved);
                this.listId = data.listId;
            }
        } catch (e) {
            console.log('Нет сохранённого списка');
        }

        if (!this.listId) {
            this.createNewList();
        }
    }

    createNewList() {
        this.listId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.items = [];
        this.saveListId();
        console.log('🆕 Создан новый список:', this.listId);
    }

    async joinList(listId) {
        this.listId = listId;
        this.pendingListId = null;
        this.saveListId();
        
        // Загружаем текущие данные из Firebase
        await this.loadFromFirebase();
        
        this.showNotification('👥 Вы присоединились к списку!');
        this.render();
        this.updateShareInfo();
    }

    // Загрузка из Firebase
    async loadFromFirebase() {
        if (!this.listId) return;
        
        try {
            const response = await fetch(`${this.firebaseUrl}/lists/${this.listId}.json`);
            const data = await response.json();
            
            if (data && data.items) {
                this.items = data.items;
                console.log('📥 Загружено из Firebase:', this.items.length, 'товаров');
            } else {
                this.items = [];
            }
        } catch (e) {
            console.error('Ошибка загрузки из Firebase:', e);
        }
    }

    // Сохранение в Firebase
    async saveToFirebase() {
        if (!this.listId) return;
        
        const data = {
            items: this.items,
            updatedAt: Date.now(),
            updatedBy: this.userId,
            updatedByName: this.userName
        };
        
        try {
            await fetch(`${this.firebaseUrl}/lists/${this.listId}.json`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            console.log('☁️ Сохранено в Firebase');
        } catch (e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    // Реальное время через polling
    startRealtimeSync() {
        // Проверяем обновления каждые 2 секунды
        setInterval(async () => {
            if (!this.listId) return;
            
            try {
                const response = await fetch(`${this.firebaseUrl}/lists/${this.listId}.json`);
                const data = await response.json();
                
                if (data && data.items && data.updatedAt > this.lastUpdate) {
                    // Проверяем, изменились ли данные
                    const newItemsJson = JSON.stringify(data.items);
                    const currentItemsJson = JSON.stringify(this.items);
                    
                    if (newItemsJson !== currentItemsJson) {
                        this.items = data.items;
                        this.lastUpdate = data.updatedAt;
                        this.render();
                        this.showNotification('🔄 Список обновлён!', 1000);
                    }
                }
            } catch (e) {
                // Игнорируем ошибки сети
            }
        }, 2000);
    }

    // Локальное сохранение только listId
    cloudStorageGet(key) {
        return new Promise((resolve) => {
            if (!this.tg?.CloudStorage) {
                resolve(localStorage.getItem(key));
                return;
            }
            this.tg.CloudStorage.getItem(key, (err, value) => {
                resolve(err ? null : value);
            });
        });
    }

    saveListId() {
        const data = { listId: this.listId };
        if (this.tg?.CloudStorage) {
            this.tg.CloudStorage.setItem('current_list', JSON.stringify(data));
        } else {
            localStorage.setItem('current_list', JSON.stringify(data));
        }
    }

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
        await this.saveToFirebase(); // Сохраняем в Firebase
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
            
            await this.saveToFirebase(); // Сохраняем в Firebase
            this.haptic(item.purchased ? 'medium' : 'light');
            this.render();
        }
    }

    async deleteItem(id, event) {
        event.stopPropagation();
        this.items = this.items.filter(i => i.id !== id);
        await this.saveToFirebase(); // Сохраняем в Firebase
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
                await this.saveToFirebase(); // Сохраняем в Firebase
                this.haptic('success');
                this.render();
            }
        });
    }

    shareList() {
        if (!this.listId) {
            this.showNotification('❌ Сначала добавьте товар');
            return;
        }

        const botUsername = 'perdakluv_bot';
        const inviteLink = `https://t.me/${botUsername}?startapp=${this.listId}`;

        this.tg.showPopup({
            title: '📤 Поделиться списком',
            message: `Отправьте эту ссылку другу:\n\n${inviteLink}`,
            buttons: [
                { id: 'copy', type: 'default', text: '📋 Копировать' },
                { id: 'close', type: 'cancel', text: 'Закрыть' }
            ]
        }, (buttonId) => {
            if (buttonId === 'copy') {
                this.copyToClipboard(inviteLink);
            }
        });
    }

    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                this.showNotification('📋 Ссылка скопирована!');
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.showNotification('📋 Ссылка скопирована!');
            }
        } catch (err) {
            this.showNotification('❌ Ошибка копирования');
        }
    }

    updateShareInfo() {
        const shareInfo = document.getElementById('share-info');
        if (shareInfo && this.listId) {
            shareInfo.style.display = 'flex';
        }
    }

    updateConnectionStatus() {
        const status = document.getElementById('sync-status');
        if (status && this.listId) {
            status.textContent = '👥';
            status.title = 'Совместный список активен';
        }
    }

    render() {
        const listContainer = document.getElementById('shopping-list');
        const emptyState = document.getElementById('empty-state');
        
        if (!listContainer || !emptyState) return;
        
        if (this.items.length === 0) {
            listContainer.classList.add('hidden');
            emptyState.classList.remove('hidden');
            this.updateProgress();
            return;
        }
        
        listContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
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
        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar');
        
        if (!progressText || !progressBar) return;
        
        const total = this.items.length;
        const purchased = this.items.filter(i => i.purchased).length;
        const percent = total > 0 ? (purchased / total) * 100 : 0;
        
        progressText.textContent = `${purchased} из ${total} куплено`;
        progressBar.style.width = `${percent}%`;
    }

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
        const addBtn = document.getElementById('add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addItem());
        }

        const input = document.getElementById('item-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addItem();
            });
        }

        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const current = document.body.getAttribute('data-theme');
                document.body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
                this.haptic('selection');
            });
        }

        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) {
            const newShareBtn = shareBtn.cloneNode(true);
            shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);
            
            newShareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.shareList();
            });
        }
    }

    initDemoMode() {
        this.listId = 'demo_' + Date.now();
        this.items = [];
        this.render();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new CollaborativeShoppingList();
});
