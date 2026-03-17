class CollaborativeShoppingList {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.isTelegram = !!this.tg;
        this.items = [];
        this.listId = null;
        this.userId = null;
        this.userName = null;
        this.lastUpdate = 0;
        this.lastSavedAt = 0;
        this.firebaseUrl = 'https://database-7a0a8-default-rtdb.europe-west1.firebasedatabase.app/';
        this.connectedUsers = new Map();
        this.myPresenceInterval = null;
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        console.log('Инициализация...');
        
        if (!this.isTelegram) {
            console.log('Демо-режим');
            this.initDemoMode();
            return;
        }

        this.tg.ready();
        this.tg.expand();
        
        this.initUserData();
        console.log('Пользователь:', this.userName, this.userId);
        
        this.checkInvitation();
        this.initTheme();
        this.setupEventListeners();
        
        await this.loadOrCreateList();
        this.showShareInfo();
        await this.registerUser();
        
        this.startRealtimeSync();
        this.startPresenceUpdates();
        
        this.render();
        this.updateConnectionStatus();
        
        this.isInitialized = true;
        console.log('Инициализация завершена');
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
            console.log('Приглашение получено:', initData.start_param);
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
        try {
            const saved = await this.cloudStorageGet('current_list');
            if (saved) {
                const data = JSON.parse(saved);
                this.listId = data.listId;
                console.log('Загружен сохранённый список:', this.listId);
            }
        } catch (e) {
            console.log('Нет сохранённого списка');
        }

        if (!this.listId) {
            this.createNewList();
        } else {
            await this.loadFromFirebase();
        }
    }

    createNewList() {
        this.listId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.items = [];
        this.lastUpdate = Date.now();
        this.saveListId();
        console.log('Создан новый список:', this.listId);
    }

    async joinList(listId) {
        console.log('Присоединение к списку:', listId);
        this.listId = listId;
        this.pendingListId = null;
        this.saveListId();
        
        await this.loadFromFirebase();
        await this.registerUser();
        
        this.showShareInfo();
        this.showNotification('👥 Вы присоединились к списку!');
        this.render();
        this.updateConnectionStatus();
    }

    async registerUser() {
        if (!this.listId || !this.userId) {
            console.error('Невозможно зарегистрировать: нет listId или userId');
            return;
        }
        
        const userData = {
            name: this.userName,
            joinedAt: Date.now(),
            lastActive: Date.now()
        };
        
        try {
            const url = `${this.firebaseUrl}/lists/${this.listId}/users/${this.userId}.json`;
            console.log('Регистрация пользователя:', url, userData);
            
            const response = await fetch(url, {
                method: 'PUT',
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                console.log('Пользователь зарегистрирован:', this.userName);
            } else {
                console.error('Ошибка регистрации:', response.status);
            }
        } catch (e) {
            console.error('Ошибка регистрации пользователя:', e);
        }
    }

    startPresenceUpdates() {
        this.myPresenceInterval = setInterval(async () => {
            if (!this.listId || !this.userId) return;
            
            try {
                await fetch(`${this.firebaseUrl}/lists/${this.listId}/users/${this.userId}/lastActive.json`, {
                    method: 'PUT',
                    body: JSON.stringify(Date.now())
                });
            } catch (e) {}
        }, 10000);
    }

    async loadFromFirebase() {
        if (!this.listId) return;
        
        try {
            const url = `${this.firebaseUrl}/lists/${this.listId}.json`;
            console.log('Загрузка из Firebase:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('Данные из Firebase:', data);
            
            if (data && data.items) {
                this.items = data.items;
                this.lastUpdate = data.updatedAt || Date.now();
                this.lastSavedAt = data.updatedAt || 0;
            } else {
                this.items = [];
                this.lastUpdate = Date.now();
            }
            
            if (data && data.users) {
                console.log('Загружены пользователи:', Object.keys(data.users));
                this.connectedUsers = new Map(Object.entries(data.users));
                this.updateUsersList();
            } else {
                console.log('Пользователей нет');
                this.connectedUsers.clear();
                this.updateUsersList();
            }
        } catch (e) {
            console.error('Ошибка загрузки из Firebase:', e);
        }
    }

    async saveToFirebase() {
        if (!this.listId) return;
        
        const now = Date.now();
        this.lastSavedAt = now;
        
        const updates = {
            items: this.items,
            updatedAt: now,
            updatedBy: this.userId,
            updatedByName: this.userName
        };
        
        try {
            const url = `${this.firebaseUrl}/lists/${this.listId}.json`;
            await fetch(url, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            console.log('Сохранено в Firebase');
        } catch (e) {
            console.error('Ошибка сохранения:', e);
        }
    }

    startRealtimeSync() {
        setInterval(async () => {
            if (!this.listId) return;
            
            try {
                const response = await fetch(`${this.firebaseUrl}/lists/${this.listId}.json`);
                const data = await response.json();
                
                if (!data) return;
                
                if (data.users) {
                    const now = Date.now();
                    const activeUsers = new Map();
                    
                    for (let [id, user] of Object.entries(data.users)) {
                        if (user.lastActive && (now - user.lastActive) < 120000) {
                            activeUsers.set(id, user);
                        }
                    }
                    
                    if (this.hasUsersChanged(activeUsers)) {
                        console.log('Обновление пользователей:', Array.from(activeUsers.keys()));
                        this.connectedUsers = activeUsers;
                        this.updateUsersList();
                    }
                }
                
                if (!data.items) return;
                
                const serverTime = data.updatedAt || 0;
                
                if (serverTime <= this.lastSavedAt) {
                    return;
                }
                
                const newItemsJson = JSON.stringify(data.items);
                const currentItemsJson = JSON.stringify(this.items);
                
                if (newItemsJson !== currentItemsJson) {
                    this.items = data.items;
                    this.lastUpdate = serverTime;
                    this.render();
                    this.showNotification('Список обновлён!', 1000);
                }
            } catch (e) {}
        }, 2000);
    }

    hasUsersChanged(newUsers) {
        if (this.connectedUsers.size !== newUsers.size) return true;
        for (let [id, user] of newUsers) {
            if (!this.connectedUsers.has(id)) return true;
            const oldUser = this.connectedUsers.get(id);
            if (oldUser.name !== user.name || oldUser.lastActive !== user.lastActive) return true;
        }
        return false;
    }

    showShareInfo() {
        const shareInfo = document.getElementById('share-info');
        if (shareInfo && this.listId) {
            console.log('Показываем share-info');
            shareInfo.style.display = 'flex';
            shareInfo.classList.add('visible');
            this.updateUsersList();
        }
    }

    updateUsersList() {
        const usersListEl = document.getElementById('users-list');
        if (!usersListEl) return;
        
        const otherUsers = [];
        for (let [id, user] of this.connectedUsers) {
            if (id !== this.userId && user.name) {
                otherUsers.push(user.name);
            }
        }
        
        console.log('Обновление списка пользователей:', otherUsers);
        
        if (otherUsers.length > 0) {
            usersListEl.textContent = otherUsers.join(', ');
        } else {
            usersListEl.textContent = 'ожидание других...';
        }
    }

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
        await this.saveToFirebase();
        input.value = '';
        
        this.haptic('light');
        this.render();
        this.updateCancelButton();
    }

    cancelInput() {
        const input = document.getElementById('item-input');
        input.value = '';
        input.blur();
        this.updateCancelButton();
        this.haptic('light');
    }

    hideKeyboard() {
        const input = document.getElementById('item-input');
        if (input) {
            input.blur();
        }
    }

    updateCancelButton() {
        const input = document.getElementById('item-input');
        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            if (input.value.length > 0) {
                cancelBtn.classList.add('visible');
            } else {
                cancelBtn.classList.remove('visible');
            }
        }
    }

    async toggleItem(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.purchased = !item.purchased;
            item.purchasedBy = item.purchased ? this.userId : null;
            item.purchasedByName = item.purchased ? this.userName : null;
            
            await this.saveToFirebase();
            this.haptic(item.purchased ? 'medium' : 'light');
            this.render();
        }
    }

    async deleteItem(id, event) {
        event.stopPropagation();
        this.items = this.items.filter(i => i.id !== id);
        await this.saveToFirebase();
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
                await this.saveToFirebase();
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
        
        const modal = document.getElementById('share-modal');
        const linkText = document.getElementById('share-link-text');
        const copyBtn = document.getElementById('modal-copy-btn');
        
        if (modal && linkText) {
            linkText.textContent = inviteLink;
            modal.classList.remove('hidden');
            
            const copyHandler = async () => {
                await this.copyToClipboard(inviteLink);
                copyBtn.innerHTML = '✅ Скопировано!';
                setTimeout(() => {
                    copyBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Копировать`;
                }, 2000);
            };
            
            copyBtn.onclick = copyHandler;
            
            document.getElementById('share-modal-cancel').onclick = () => {
                modal.classList.add('hidden');
            };
            
            document.getElementById('share-modal-confirm').onclick = async () => {
                modal.classList.add('hidden');
                
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: '🛒 Список покупок',
                            text: 'Присоединяйся к совместному списку покупок!',
                            url: inviteLink
                        });
                        this.haptic('success');
                        return;
                    } catch (e) {
                        if (e.name !== 'AbortError') {
                            await this.copyToClipboard(inviteLink);
                        }
                    }
                }
                
                await this.copyToClipboard(inviteLink);
                this.showNotification('📋 Ссылка скопирована — вставьте в чат!');
            };
            
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            };
        }
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
                    <svg class="checkbox-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
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

        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelInput());
        }

        const input = document.getElementById('item-input');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addItem();
            });
            input.addEventListener('input', () => this.updateCancelButton());
        }

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.addEventListener('click', (e) => {
                if (e.target !== input && !e.target.closest('.add-form')) {
                    this.hideKeyboard();
                }
            });
        }

        const header = document.querySelector('.header');
        if (header) {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('.theme-toggle') && !e.target.closest('.sync-status')) {
                    this.hideKeyboard();
                }
            });
        }

        const bottomActions = document.querySelector('.bottom-actions');
        if (bottomActions) {
            bottomActions.addEventListener('click', () => {
                this.hideKeyboard();
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
        this.lastUpdate = Date.now();
        this.lastSavedAt = 0;
        this.showShareInfo();
        this.render();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new CollaborativeShoppingList();
});
