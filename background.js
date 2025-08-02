// CogniMark 后台服务脚本 (Service Worker)

// --- INSTALL & SETUP ---
chrome.runtime.onInstalled.addListener((details) => {
    // 仅在插件首次安装时执行
    if (details.reason === 'install') {
        initializeSettings();
        createAlarms();
    }
});

// 初始化插件所需的默认存储值
function initializeSettings() {
    chrome.storage.local.set({
        bookmarks: [], // 存储所有书签数据
        stats: { total: 0, healthy: 0, broken: 0, redirect: 0 }, // 书签健康度统计
        frequentBookmarks: {}, // 常用书签点击计数
        searchHistory: [], // 搜索历史记录
        settings: {
            autoSync: true, // 是否自动同步
            healthCheckInterval: 1440 // 健康检查周期（分钟），默认24小时
        }
    });
    console.log('CogniMark 已初始化。');
}

// 创建定时任务
function createAlarms() {
    // 创建一个名为 'healthCheck' 的定时任务
    chrome.alarms.create('healthCheck', {
        delayInMinutes: 5, // 首次执行延迟5分钟
        periodInMinutes: 1440 // 每24小时执行一次
    });
    console.log('健康检查定时任务已创建。');
}

// --- 事件监听器 ---

// 监听书签的创建、删除、修改、移动事件，并使用防抖函数来触发同步，避免短时间内频繁操作
const debouncedSync = debounce(syncAllBookmarks, 5000); // 5秒防抖
chrome.bookmarks.onCreated.addListener(debouncedSync);
chrome.bookmarks.onRemoved.addListener(debouncedSync);
chrome.bookmarks.onChanged.addListener(debouncedSync);
chrome.bookmarks.onMoved.addListener(debouncedSync);

// 监听定时任务触发
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'healthCheck') {
        performHealthCheck();
    }
});

// 监听来自 popup 的消息请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'triggerSync':
            syncAllBookmarks().then(() => sendResponse({ success: true }));
            return true; // 异步操作需要返回 true
        case 'triggerHealthCheck':
            performHealthCheck().then(() => sendResponse({ success: true }));
            return true; // 异步操作需要返回 true
        case 'getFullText':
            getFullTextFromPage(request.tabId)
                .then(text => sendResponse({ success: true, text }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // 异步操作需要返回 true
    }
});

// --- 核心功能函数 ---

// 同步所有书签
async function syncAllBookmarks() {
    console.log('正在同步所有书签...');
    // 先获取旧的书签数据，以便保留快照和健康状态
    const { bookmarks: oldBookmarks } = await chrome.storage.local.get('bookmarks');
    const oldBookmarksMap = new Map((oldBookmarks || []).map(b => [b.id, b]));

    // 从Chrome API获取最新的书签树
    const bookmarkTree = await chrome.bookmarks.getTree();
    // 将书签树扁平化，并与旧数据合并
    const newBookmarks = flattenBookmarks(bookmarkTree, oldBookmarksMap);
    
    // 将更新后的书签列表存入本地存储
    await chrome.storage.local.set({ bookmarks: newBookmarks });
    console.log(`同步完成。共找到 ${newBookmarks.length} 个书签。`);
}

// 扁平化书签树，将树状结构转换为列表结构
function flattenBookmarks(nodes, oldMap, path = '') {
    let bookmarks = [];
    for (const node of nodes) {
        if (node.children) {
            // 如果是文件夹，则递归处理
            const currentPath = path ? `${path}/${node.title}` : node.title;
            bookmarks = bookmarks.concat(flattenBookmarks(node.children, oldMap, currentPath));
        } else if (node.url) {
            // 如果是书签，则处理数据
            const oldData = oldMap.get(node.id) || {}; // 获取旧数据
            bookmarks.push({
                id: node.id,
                title: node.title,
                url: node.url,
                folder: path || '书签栏',
                dateAdded: node.dateAdded,
                healthStatus: oldData.healthStatus || 'unknown', // 保留旧的健康状态
                snapshot: oldData.snapshot || '' // 保留旧的快照
            });
        }
    }
    return bookmarks;
}

// 执行健康度检查
async function performHealthCheck() {
    console.log('正在执行健康度检查...');
    const { bookmarks } = await chrome.storage.local.get('bookmarks');
    if (!bookmarks || bookmarks.length === 0) return;

    let stats = { total: bookmarks.length, healthy: 0, broken: 0, redirect: 0, unknown: 0 };
    
    // 遍历所有书签
    for (let i = 0; i < bookmarks.length; i++) {
        const bookmark = bookmarks[i];
        try {
            // 使用 HEAD 请求检查链接有效性，比 GET 更快
            const response = await fetch(bookmark.url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
            if (response.status >= 200 && response.status < 300) {
                bookmark.healthStatus = 'healthy';
            } else if (response.status >= 400) {
                bookmark.healthStatus = 'broken';
            } else if (response.status >= 300) {
                bookmark.healthStatus = 'redirect';
            }
        } catch (error) {
            // 网络错误等也视为链接失效
            bookmark.healthStatus = 'broken';
        }

        stats[bookmark.healthStatus]++;

        // 每检查20个或到最后一个时，更新一次存储，防止单次写入数据过大
        if (i % 20 === 0 || i === bookmarks.length - 1) {
            await chrome.storage.local.set({ bookmarks, stats });
        }
    }
    console.log('健康度检查完成。', stats);
}

// 从指定标签页获取全文内容
async function getFullTextFromPage(tabId) {
    // 使用 Scripting API 注入一个函数到页面中
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        function: () => document.body.innerText,
    });
    if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
    }
    return results[0].result;
}

// --- 工具函数 ---

// 防抖函数：在事件触发后的一段时间内，如果事件再次触发，则重新计时
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
