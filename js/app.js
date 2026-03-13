class ShoppingListApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.items = [];
        this.init();
    }

    init() {
        this.tg.ready();
        this.tg.expand();
        
        this.initTheme();
        this.loadItems();
        this.setupEventListeners();
        this.render();
        
        setTimeout(() => {
            document.getElementById('item-input').focus();
        }, 100);
    }

    initTheme() {
        this.tg.setHeaderColor(this.tg.colorScheme === 'dark' ? '#1c1c1e' : '#ffffff');
        this.applyThemeColors();
        
        this.tg.onEvent('themeChanged', () => {
            this.applyThemeColors();
        });
    }

    applyThemeColors() {
        const root = document.documentElement;
        const theme = this.tg.themeParams;
        
        if (theme.bg_color) root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
        if (theme.text_color) root.style.setProperty('--tg-theme-text-color', theme.text_color);
        if (theme.hint_color) root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
        if (theme.button_color) root.style.setProperty('--tg-theme-button-color', theme.button_color);
        if (theme.button_text_color) root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
        if (theme.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
        
        document.body.setAttribute('data-theme', this.tg.colorScheme);
    }

    setupEventListeners() {
        document.getElementById('add-btn').addEventListener('click', () => this.addItem());
        document.getElementById('item-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addItem();
        });

        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearAll();
        });

        document.getElementById('share-btn').addEventListener('click', () => {
            this.shareList();
        });
    }

    addItem() {
        const input = document.getElementById('item-input');
        const text = input.value.trim();
        
        if (!text) return;
        
        const item = {
            id: Date.now(),
            text: text,
            purchased: false
        };
        
        this.items.unshift(item);
        this.saveItems();
        this.render();
        input.value = '';
        
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('light');
        }
    }

    toggleItem(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            item.purchased = !item.purchased;
            this.saveItems();
            this.render();
            
            if (this.tg.HapticFeedback) {
                this.tg.HapticFeedback.impactOccurred(item.purchased ? 'medium' : 'light');
            }
        }
    }

    deleteItem(id, event) {
        event.stopPropagation();
        this.items = this.items.filter(i => i.id !== id);
        this.saveItems();
        this.render();
        
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.impactOccurred('rigid');
        }
    }

    clearAll() {
        if (this.items.length === 0) return;
        
        this.tg.showPopup({
            title: 'Очистить список?',
            message: 'Все товары будут удалены безвозвратно.',
            buttons: [
                { id: 'cancel', type: 'cancel', text: 'Отмена' },
                { id: 'clear', type: 'destructive', text: 'Очистить' }
            ]
        }, (buttonId) => {
            if (buttonId === 'clear') {
                this.items = [];
                this.saveItems();
                this.render();
                
                if (this.tg.HapticFeedback) {
                    this.tg.HapticFeedback.notificationOccurred('success');
                }
            }
        });
    }

    shareList() {
        if (this.items.length === 0) {
            this.tg.showAlert('Список пуст!');
            return;
        }

        const purchased = this.items.filter(i => i.purchased).length;
        const total = this.items.length;
        
        let text = `🛒 Список покупок (${purchased}/${total}):\n\n`;
        
        const sortedItems = [...this.items].sort((a, b) => a.purchased - b.purchased);
        sortedItems.forEach(item => {
            text += item.purchased ? `✅ ${item.text}\n` : `⬜ ${item.text}\n`;
        });
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.showNotification('Список скопирован!');
            });
        } else {
            this.tg.showPopup({
                title: 'Скопируйте список',
                message: text,
                buttons: [{ type: 'default', text: 'OK' }]
            });
        }
    }

    toggleTheme() {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        
        if (this.tg.HapticFeedback) {
            this.tg.HapticFeedback.selectionChanged();
        }
    }

    updateProgress() {
        const total = this.items.length;
        const purchased = this.items.filter(i => i.purchased).length;
        const percent = total > 0 ? (purchased / total) * 100 : 0;
        
        document.getElementById('progress-text').textContent = 
            `${purchased} из ${total} куплено`;
        document.getElementById('progress-bar').style.width = `${percent}%`;
    }

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
        
        const sortedItems = [...this.items].sort((a, b) => {
            if (a.purchased === b.purchased) return b.id - a.id;
            return a.purchased ? 1 : -1;
        });
        
        listContainer.innerHTML = sortedItems.map(item => `
            <div class="item ${item.purchased ? 'purchased' : ''}" onclick="app.toggleItem(${item.id})">
                <div class="checkbox">
                    <span class="checkbox-check">✓</span>
                </div>
                <span class="item-text">${this.escapeHtml(item.text)}</span>
                <button class="delete-btn" onclick="app.deleteItem(${item.id}, event)">×</button>
            </div>
        `).join('');
        
        this.updateProgress();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveItems() {
        localStorage.setItem('shoppingList', JSON.stringify(this.items));
    }

    loadItems() {
        const saved = localStorage.getItem('shoppingList');
        if (saved) {
            this.items = JSON.parse(saved);
        }
    }

    showNotification(message) {
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
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 300);
        }, 2000);
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ShoppingListApp();
});
