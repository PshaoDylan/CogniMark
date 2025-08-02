// CogniMark 设置页面脚本

class CogniMarkOptions {
    constructor() {
        this.settings = {};
        this.defaultSettings = {
            // 常规设置
            maxBookmarks: 1000,
            autoCleanup: false,
            duplicateDetection: true,
            pageAnalysis: true,
            autoCategory: true,
            
            // 同步设置
            syncInterval: 5,
            syncOnStartup: true,
            syncConflictResolution: 'newer',
            healthCheckInterval: 24,
            healthCheckTimeout: 10,
            
            // 外观设置
            theme: 'light',
            accentColor: '#007bff',
            compactMode: false,
            showFloatingButton: true,
            animationEnabled: true,
            
            // 高级设置
            cacheSize: 50,
            backgroundSync: true,
            debugMode: false
        };
        
        this.init();
    }
    
    // 初始化
    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.setupTabs();
        this.populateForm();
        this.updateColorLabel();
    }
    
    // 加载设置
    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get('settings');
            this.settings = { ...this.defaultSettings, ...result.settings };
        } catch (error) {
            console.error('加载设置失败:', error);
            this.settings = { ...this.defaultSettings };
        }
    }
    
    // 保存设置
    async saveSettings() {
        try {
            await chrome.storage.sync.set({ settings: this.settings });
            this.showStatus('设置已保存', 'success');
            
            // 通知后台脚本设置已更新
            chrome.runtime.sendMessage({
                action: 'settingsUpdated',
                settings: this.settings
            });
        } catch (error) {
            console.error('保存设置失败:', error);
            this.showStatus('保存设置失败', 'error');
        }
    }
    
    // 重置设置
    async resetSettings() {
        if (confirm('确定要重置所有设置为默认值吗？此操作不可撤销。')) {
            this.settings = { ...this.defaultSettings };
            this.populateForm();
            await this.saveSettings();
            this.showStatus('设置已重置为默认值', 'success');
        }
    }
    
    // 设置事件监听器
    setupEventListeners() {
        // 保存按钮
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.collectFormData();
            this.saveSettings();
        });
        
        // 重置按钮
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetSettings();
        });
        
        // 颜色选择器
        document.getElementById('accentColor').addEventListener('input', (e) => {
            this.updateColorLabel(e.target.value);
        });
        
        // 数据管理按钮
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('importData').addEventListener('click', () => {
            this.importData();
        });
        
        document.getElementById('clearData').addEventListener('click', () => {
            this.clearAllData();
        });
        
        // 表单变化监听
        document.addEventListener('change', (e) => {
            if (e.target.matches('input, select')) {
                this.markAsChanged();
            }
        });
    }
    
    // 设置标签页
    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // 移除所有活动状态
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // 激活当前标签
                btn.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }
    
    // 填充表单
    populateForm() {
        Object.keys(this.settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.settings[key];
                } else {
                    element.value = this.settings[key];
                }
            }
        });
    }
    
    // 收集表单数据
    collectFormData() {
        Object.keys(this.defaultSettings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    this.settings[key] = element.checked;
                } else if (element.type === 'number') {
                    this.settings[key] = parseInt(element.value) || this.defaultSettings[key];
                } else {
                    this.settings[key] = element.value;
                }
            }
        });
    }
    
    // 更新颜色标签
    updateColorLabel(color) {
        const colorLabel = document.querySelector('.color-label');
        if (colorLabel) {
            colorLabel.textContent = color || document.getElementById('accentColor').value;
        }
    }
    
    // 标记为已更改
    markAsChanged() {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn && !saveBtn.classList.contains('changed')) {
            saveBtn.classList.add('changed');
            saveBtn.textContent = '保存更改';
        }
    }
    
    // 显示状态消息
    showStatus(message, type = 'success') {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
        
        // 重置保存按钮状态
        if (type === 'success') {
            const saveBtn = document.getElementById('saveBtn');
            saveBtn.classList.remove('changed');
            saveBtn.textContent = '保存设置';
        }
    }
    
    // 导出数据
    async exportData() {
        try {
            const data = await chrome.storage.local.get(null);
            const syncData = await chrome.storage.sync.get(null);
            
            const exportData = {
                local: data,
                sync: syncData,
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cognimark-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showStatus('数据导出成功', 'success');
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showStatus('导出数据失败', 'error');
        }
    }
    
    // 导入数据
    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (!data.local || !data.sync) {
                    throw new Error('无效的备份文件格式');
                }
                
                if (confirm('确定要导入数据吗？这将覆盖当前所有数据。')) {
                    await chrome.storage.local.clear();
                    await chrome.storage.sync.clear();
                    
                    await chrome.storage.local.set(data.local);
                    await chrome.storage.sync.set(data.sync);
                    
                    // 重新加载设置
                    await this.loadSettings();
                    this.populateForm();
                    
                    this.showStatus('数据导入成功', 'success');
                }
            } catch (error) {
                console.error('导入数据失败:', error);
                this.showStatus('导入数据失败：' + error.message, 'error');
            }
        });
        
        input.click();
    }
    
    // 清除所有数据
    async clearAllData() {
        const confirmText = '清除所有数据';
        const userInput = prompt(
            `此操作将永久删除所有书签和设置数据，且无法恢复。\n\n如果确定要继续，请输入：${confirmText}`
        );
        
        if (userInput === confirmText) {
            try {
                await chrome.storage.local.clear();
                await chrome.storage.sync.clear();
                
                // 重置为默认设置
                this.settings = { ...this.defaultSettings };
                this.populateForm();
                await this.saveSettings();
                
                this.showStatus('所有数据已清除', 'success');
            } catch (error) {
                console.error('清除数据失败:', error);
                this.showStatus('清除数据失败', 'error');
            }
        } else if (userInput !== null) {
            this.showStatus('输入不匹配，操作已取消', 'warning');
        }
    }
    
    // 获取存储使用情况
    async getStorageUsage() {
        try {
            const localUsage = await chrome.storage.local.getBytesInUse();
            const syncUsage = await chrome.storage.sync.getBytesInUse();
            
            return {
                local: this.formatBytes(localUsage),
                sync: this.formatBytes(syncUsage),
                localRaw: localUsage,
                syncRaw: syncUsage
            };
        } catch (error) {
            console.error('获取存储使用情况失败:', error);
            return null;
        }
    }
    
    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 应用主题
    applyTheme(theme) {
        const body = document.body;
        body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        
        if (theme === 'auto') {
            // 跟随系统主题
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
        } else {
            body.classList.add(`theme-${theme}`);
        }
    }
    
    // 应用主题色
    applyAccentColor(color) {
        document.documentElement.style.setProperty('--accent-color', color);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new CogniMarkOptions();
});

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const themeSelect = document.getElementById('theme');
    if (themeSelect && themeSelect.value === 'auto') {
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(e.matches ? 'theme-dark' : 'theme-light');
    }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S 保存设置
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('saveBtn').click();
    }
    
    // Ctrl/Cmd + R 重置设置
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        document.getElementById('resetBtn').click();
    }
});

// 添加页面离开前的提醒
window.addEventListener('beforeunload', (e) => {
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn && saveBtn.classList.contains('changed')) {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
        return e.returnValue;
    }
});