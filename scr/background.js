// CogniMark 后台服务脚本 - 优化版

class CogniMarkBackground {
    constructor() {
        this.isProcessing = false;
        this.healthCheckQueue = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.schedulePeriodicSync();
        // 启动时执行一次同步
        this.syncBookmarks();
    }

    bindEvents() {
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // 保持消息通道开放以支持异步响应
        });

        // 监听书签变化事件
        chrome.bookmarks.onCreated.addListener(() => this.debouncedSync());
        chrome.bookmarks.onRemoved.addListener(() => this.debouncedSync());
        chrome.bookmarks.onChanged.addListener(() => this.debouncedSync());
        chrome.bookmarks.onMoved.addListener(() => this.debouncedSync());
        
        // 监听扩展安装事件
        chrome.runtime.onInstalled.addListener(() => {
            this.syncBookmarks();
        });
    }

    // 防抖同步，避免频繁触发
    debouncedSync() {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        this.syncTimeout = setTimeout(() => {
            this.syncBookmarks();
        }, 1000);
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'triggerSync':
                    await this.syncBookmarks();
                    sendResponse({ success: true });
                    break;
                case 'triggerHealthCheck':
                    this.performHealthCheck();
                    sendResponse({ success: true, message: '健康检查已开始' });
                    break;
                case 'getFullText':
                    const result = await this.getPageFullText(message.tabId);
                    sendResponse(result);
                    break;
                case 'getStats':
                    const stats = await this.getStats();
                    sendResponse({ success: true, stats });
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // 同步书签到本地存储
    async syncBookmarks() {
        if (this.isProcessing) {
            console.log('同步正在进行中，跳过此次请求');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            console.log('开始同步书签...');
            const bookmarkTree = await chrome.bookmarks.getTree();
            const flatBookmarks = this.flattenBookmarks(bookmarkTree);
            
            // 获取现有的健康状态数据
            const existingData = await chrome.storage.local.get(['bookmarks', 'frequentBookmarks']);
            const existingBookmarks = existingData.bookmarks || [];
            const frequentBookmarks = existingData.frequentBookmarks || {};
            
            // 合并新书签和现有的健康状态
            const mergedBookmarks = flatBookmarks.map(newBookmark => {
                const existing = existingBookmarks.find(b => b.id === newBookmark.id);
                return {
                    ...newBookmark,
                    healthStatus: existing?.healthStatus || 'unknown',
                    snapshot: existing?.snapshot || '',
                    lastChecked: existing?.lastChecked || null,
                    clickCount: frequentBookmarks[newBookmark.id] || 0
                };
            });

            const stats = this.calculateStats(mergedBookmarks);
            
            await chrome.storage.local.set({ 
                bookmarks: mergedBookmarks,
                stats: stats,
                lastSyncTime: Date.now()
            });
            
            console.log(`同步完成: ${mergedBookmarks.length} 个书签`);
        } catch (error) {
            console.error('同步书签失败:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // 将书签树扁平化
    flattenBookmarks(nodes, folder = '') {
        let result = [];
        for (const node of nodes) {
            if (node.children) {
                // 这是一个文件夹，递归处理其子项
                const folderName = node.title || '未命名文件夹';
                result = result.concat(this.flattenBookmarks(node.children, folderName));
            } else if (node.url) {
                // 这是一个书签
                result.push({
                    id: node.id,
                    title: node.title || '未命名书签',
                    url: node.url,
                    folder: folder,
                    dateAdded: node.dateAdded || Date.now()
                });
            }
        }
        return result;
    }

    // 执行健康检查
    async performHealthCheck() {
        if (this.healthCheckInProgress) {
            console.log('健康检查正在进行中');
            return;
        }
        
        this.healthCheckInProgress = true;
        
        try {
            const data = await chrome.storage.local.get(['bookmarks']);
            const bookmarks = data.bookmarks || [];
            
            console.log(`开始健康检查: ${bookmarks.length} 个书签`);
            
            // 分批处理以避免过载
            const batchSize = 5;
            let checkedCount = 0;
            
            for (let i = 0; i < bookmarks.length; i += batchSize) {
                const batch = bookmarks.slice(i, i + batchSize);
                
                await Promise.allSettled(
                    batch.map(bookmark => this.checkBookmarkHealth(bookmark))
                );
                
                checkedCount += batch.length;
                
                // 每批处理后更新存储
                const stats = this.calculateStats(bookmarks);
                await chrome.storage.local.set({ 
                    bookmarks: bookmarks,
                    stats: stats,
                    healthCheckProgress: Math.round((checkedCount / bookmarks.length) * 100)
                });
                
                console.log(`健康检查进度: ${checkedCount}/${bookmarks.length}`);
                
                // 延迟以避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            await chrome.storage.local.set({ healthCheckProgress: 100 });
            console.log('健康检查完成');
            
        } catch (error) {
            console.error('健康检查失败:', error);
        } finally {
            this.healthCheckInProgress = false;
        }
    }

    // 检查单个书签的健康状态
    async checkBookmarkHealth(bookmark) {
        try {
            // 使用AbortController设置超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(bookmark.url, { 
                method: 'HEAD',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'CogniMark/1.0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                bookmark.healthStatus = 'healthy';
            } else if (response.status >= 300 && response.status < 400) {
                bookmark.healthStatus = 'redirect';
            } else if (response.status >= 400) {
                bookmark.healthStatus = 'broken';
            } else {
                bookmark.healthStatus = 'unknown';
            }
            
            bookmark.lastChecked = Date.now();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                bookmark.healthStatus = 'timeout';
            } else {
                bookmark.healthStatus = 'error';
            }
            bookmark.lastChecked = Date.now();
            console.warn(`检查书签失败 ${bookmark.url}:`, error.message);
        }
    }

    // 获取页面全文
    async getPageFullText(tabId) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => {
                    // 移除脚本和样式标签
                    const scripts = document.querySelectorAll('script, style, noscript, nav, footer, aside');
                    scripts.forEach(el => el.remove());
                    
                    // 获取主要内容
                    const mainContent = document.querySelector('main, article, .content, #content, .post, .article');
                    const content = mainContent || document.body;
                    
                    // 清理文本
                    let text = content.innerText || content.textContent || '';
                    text = text.replace(/\s+/g, ' ').trim();
                    
                    // 限制长度
                    return text.substring(0, 5000);
                }
            });
            
            return { success: true, text: results[0].result };
        } catch (error) {
            console.error('获取页面内容失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 计算统计信息
    calculateStats(bookmarks) {
        const stats = {
            total: bookmarks.length,
            healthy: 0,
            broken: 0,
            redirect: 0,
            unknown: 0,
            error: 0,
            timeout: 0
        };
        
        bookmarks.forEach(bookmark => {
            const status = bookmark.healthStatus || 'unknown';
            stats[status] = (stats[status] || 0) + 1;
        });
        
        return stats;
    }

    // 获取统计信息
    async getStats() {
        const data = await chrome.storage.local.get(['stats', 'lastSyncTime']);
        return {
            ...data.stats,
            lastSyncTime: data.lastSyncTime
        };
    }

    // 设置定期同步
    schedulePeriodicSync() {
        // 每2小时同步一次
        chrome.alarms.create('periodicSync', { periodInMinutes: 120 });
        
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'periodicSync') {
                console.log('执行定期同步');
                this.syncBookmarks();
            }
        });
    }
}

// 初始化后台服务
new CogniMarkBackground();
