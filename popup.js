// CogniMark 插件弹出界面脚本

class CogniMarkPro {
    constructor() {
        // --- 初始化状态属性 ---
        this.allBookmarks = [];      // 存储从本地读取的所有书签
        this.filteredBookmarks = []; // 存储当前搜索过滤后的书签
        this.frequentBookmarks = {}; // 存储常用书签及其点击次数
        this.searchHistory = [];     // 存储搜索历史
        this.stats = {};             // 存储健康度统计信息
        this.init();                 // 启动应用
    }

    // --- 初始化流程 ---
    async init() {
        this.bindEvents(); // 绑定所有UI元素的事件监听器
        await this.loadDataFromStorage(); // 从Chrome本地存储加载数据
        this.renderAll(); // 渲染整个UI界面
    }

    // --- 事件绑定 ---
    bindEvents() {
        document.getElementById('syncBtn').addEventListener('click', () => this.syncBookmarks());
        document.getElementById('healthCheckBtn').addEventListener('click', () => this.triggerHealthCheck());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToCSV());
        
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => this.onSearchInput(e.target.value));
        
        // 搜索选项变化时，重新执行搜索
        document.getElementById('regexMode').addEventListener('change', () => this.onSearchInput(searchInput.value));
        document.getElementById('fullTextMode').addEventListener('change', () => this.onSearchInput(searchInput.value));
    }

    // --- 数据处理 ---
    async loadDataFromStorage() {
        const data = await chrome.storage.local.get(['bookmarks', 'stats', 'frequentBookmarks', 'searchHistory']);
        this.allBookmarks = data.bookmarks || [];
        this.filteredBookmarks = [...this.allBookmarks]; // 默认显示所有书签
        this.stats = data.stats || { total: 0, healthy: 0, broken: 0, redirect: 0 };
        this.frequentBookmarks = data.frequentBookmarks || {};
        this.searchHistory = data.searchHistory || [];
    }

    // --- 核心交互函数 ---

    // 手动同步
    async syncBookmarks() {
        alert('正在开始手动同步，界面稍后将刷新。');
        await chrome.runtime.sendMessage({ action: 'triggerSync' });
        // 延迟一段时间后刷新UI，等待后台同步完成
        setTimeout(async () => {
            await this.loadDataFromStorage();
            this.renderAll();
            alert('同步完成！');
        }, 2000);
    }

    // 手动触发健康检查
    async triggerHealthCheck() {
        alert('已开始在后台进行健康检查，这可能需要一些时间。界面将会逐步更新结果。');
        await chrome.runtime.sendMessage({ action: 'triggerHealthCheck' });
    }

    // 处理搜索输入
    onSearchInput(query) {
       const isRegex = document.getElementById('regexMode').checked;
       const isFullText = document.getElementById('fullTextMode').checked;

       if (!query.trim()) {
           this.filteredBookmarks = [...this.allBookmarks];
       } else {
           if (isRegex) {
               try {
                   const regex = new RegExp(query, 'i');
                   this.filteredBookmarks = this.allBookmarks.filter(b => 
                       regex.test(b.title) || regex.test(b.url) || (isFullText && regex.test(b.snapshot))
                   );
               } catch (e) {
                   this.filteredBookmarks = []; // 无效的正则表达式
               }
           } else {
               const terms = query.toLowerCase().split(' ').filter(t => t);
               this.filteredBookmarks = this.allBookmarks.filter(b => {
                   const searchableText = `${b.title} ${b.url} ${b.folder} ${isFullText ? b.snapshot : ''}`.toLowerCase();
                   return terms.every(term => searchableText.includes(term));
               });
           }
       }
       this.renderBookmarks(query);
    }

    // 处理快照按钮点击
    async handleSnapshot(bookmarkId) {
        const bookmark = this.allBookmarks.find(b => b.id === bookmarkId);
        if (bookmark.snapshot) {
            alert(`快照已存在：\n\n${bookmark.snapshot.substring(0, 300)}...`);
            return;
        }
        alert('正在创建快照，请稍候...');
        try {
            // 在一个非激活的标签页中打开链接以抓取内容
            const tab = await chrome.tabs.create({ url: bookmark.url, active: false });
            // 等待页面加载。注意：这是一个简化的实现，更可靠的方法是监听tab的加载完成事件。
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            // 向 background.js 发送消息，请求获取页面全文
            const response = await chrome.runtime.sendMessage({ action: 'getFullText', tabId: tab.id });
            
            if (response.success) {
                const bookmarkIndex = this.allBookmarks.findIndex(b => b.id === bookmarkId);
                // 压缩并截断文本，存入快照
                this.allBookmarks[bookmarkIndex].snapshot = response.text.trim().replace(/\s+/g, ' ');
                await chrome.storage.local.set({ bookmarks: this.allBookmarks });
                alert('快照创建成功！');
            } else { throw new Error(response.error); }
            // 关闭临时标签页
            await chrome.tabs.remove(tab.id);
        } catch (error) {
            alert(`创建快照失败: ${error.message}`);
        }
    }

    // 打开书签
    openBookmark(bookmark) {
        chrome.tabs.create({ url: bookmark.url });
        // 在这里可以添加逻辑来更新常用书签的点击计数
    }
    
    // 导出为CSV文件
    exportToCSV() {
        if (this.filteredBookmarks.length === 0) {
            alert('没有可导出的书签。');
            return;
        }
        const headers = ['标题', '网址', '文件夹', '添加日期', '健康状态'];
        const rows = this.filteredBookmarks.map(b => [
            `"${b.title.replace(/"/g, '""')}"`, `"${b.url}"`, `"${b.folder}"`, `"${new Date(b.dateAdded).toISOString()}"`, `"${b.healthStatus}"`
        ].join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `CogniMark_导出_${new Date().toISOString().slice(0,10)}.csv`);
        link.click();
        URL.revokeObjectURL(url);
    }

    // --- 渲染函数 ---

    // 渲染所有UI组件
    renderAll() {
        this.renderStats();
        this.renderFrequentBookmarks();
        this.renderBookmarks(document.getElementById('searchInput').value);
    }
    
    // 渲染书签列表
    renderBookmarks(query) {
        const container = document.getElementById('bookmarksList');
        const noResultsEl = document.getElementById('noResults');
        container.innerHTML = '';

        if (this.filteredBookmarks.length === 0) {
            noResultsEl.style.display = 'block';
            return;
        }
        noResultsEl.style.display = 'none';

        // 限制最多渲染100条结果以保证性能
        this.filteredBookmarks.slice(0, 100).forEach(bookmark => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.dataset.id = bookmark.id;
            
            const healthIcon = this.getHealthIcon(bookmark.healthStatus);

            item.innerHTML = `
                <div class="bookmark-main">
                    <img class="bookmark-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}" onerror="this.src='icons/icon16.png'">
                    <div class="bookmark-content">
                        <div class="bookmark-title">${healthIcon} ${this.highlightText(bookmark.title, query)}</div>
                        <div class="bookmark-url">${this.highlightText(bookmark.url, query)}</div>
                    </div>
                </div>
                <div class="bookmark-actions">
                    <button class="action-btn snapshot-btn" title="创建/查看页面快照">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-zap"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    </button>
                </div>
            `;

            container.appendChild(item);
            
            // 为每个书签项上的按钮绑定事件
            item.querySelector('.snapshot-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发父元素的点击事件
                this.handleSnapshot(bookmark.id);
            });
            item.addEventListener('click', () => this.openBookmark(bookmark));
        });
    }

    // 渲染统计信息
    renderStats() {
        const el = document.getElementById('stats');
        el.textContent = `总数: ${this.stats.total} | ❤️ ${this.stats.healthy} | ❌ ${this.stats.broken} | ➡️ ${this.stats.redirect}`;
    }

    // 渲染常用书签 (此处为框架，待实现具体逻辑)
    renderFrequentBookmarks() {
        // 实现渲染常用书签的逻辑
    }

    // --- 工具函数 ---

    // 根据健康状态返回对应的图标
    getHealthIcon(status) {
        switch (status) {
            case 'healthy': return '❤️';
            case 'broken': return '❌';
            case 'redirect': return '➡️';
            default: return '❔';
        }
    }

    // 高亮搜索关键词
    highlightText(text, query) {
        if (!query || !text) return text;
        const isRegex = document.getElementById('regexMode').checked;
        if (isRegex) {
            try {
                return text.replace(new RegExp(`(${query})`, 'gi'), '<span class="highlight">$1</span>');
            } catch (e) { return text; }
        }
        const terms = query.split(' ').filter(t => t);
        let highlightedText = text;
        terms.forEach(term => {
            highlightedText = highlightedText.replace(new RegExp(this.escapeRegExp(term), 'gi'), '<span class="highlight">$&</span>');
        });
        return highlightedText;
    }

    // 转义正则表达式特殊字符
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// 当DOM加载完成后，初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new CogniMarkPro();
});
