// CogniMark 内容脚本
// 负责在网页中注入功能，分析页面内容，提供智能书签建议

class CogniMarkContent {
    constructor() {
        this.pageAnalysis = null;
        this.isBookmarked = false;
        this.floatingButton = null;
        this.init();
    }

    // 初始化内容脚本
    init() {
        this.analyzePage();
        this.setupMessageListener();
        this.createFloatingButton();
        this.checkBookmarkStatus();
    }

    // 分析当前页面
    analyzePage() {
        const title = document.title;
        const url = window.location.href;
        const description = this.getPageDescription();
        const keywords = this.extractKeywords();
        const category = this.categorizeContent();
        const readingTime = this.estimateReadingTime();
        const images = this.extractImages();
        const links = this.extractLinks();
        
        this.pageAnalysis = {
            title,
            url,
            description,
            keywords,
            category,
            readingTime,
            images,
            links,
            wordCount: this.getWordCount(),
            language: this.detectLanguage(),
            timestamp: Date.now()
        };
        
        // 发送页面分析结果到后台
        chrome.runtime.sendMessage({
            action: 'pageAnalyzed',
            data: this.pageAnalysis
        });
    }

    // 获取页面描述
    getPageDescription() {
        // 优先级：meta description > og:description > twitter:description > 首段内容
        const selectors = [
            'meta[name="description"]',
            'meta[property="og:description"]',
            'meta[name="twitter:description"]'
        ];
        
        for (let selector of selectors) {
            const meta = document.querySelector(selector);
            if (meta && meta.content && meta.content.trim()) {
                return meta.content.trim();
            }
        }
        
        // 如果没有meta描述，智能提取页面内容
        const contentSelectors = [
            'article p',
            '.content p',
            '.post-content p',
            'main p',
            'p'
        ];
        
        for (let selector of contentSelectors) {
            const paragraphs = document.querySelectorAll(selector);
            for (let p of paragraphs) {
                const text = p.textContent.trim();
                if (text.length > 50 && !text.match(/^(点击|查看|更多|阅读)/)) {
                    return text.length > 200 ? text.substring(0, 200) + '...' : text;
                }
            }
        }
        
        return '';
    }

    // 提取关键词
    extractKeywords() {
        // 首先尝试获取meta keywords
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords && metaKeywords.content) {
            return metaKeywords.content.split(',').map(k => k.trim()).filter(k => k.length > 0);
        }
        
        // 智能关键词提取
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'
        ]);
        
        // 获取页面主要内容
        const contentSelectors = ['article', '.content', '.post-content', 'main', 'body'];
        let content = '';
        
        for (let selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                content = element.textContent;
                break;
            }
        }
        
        // 提取中英文词汇
        const words = content.toLowerCase()
            .match(/[\u4e00-\u9fa5]+|[a-zA-Z]{3,}/g) || [];
        
        const frequency = {};
        words.forEach(word => {
            if (!stopWords.has(word) && word.length >= 2) {
                frequency[word] = (frequency[word] || 0) + 1;
            }
        });
        
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([word]) => word);
    }

    // 内容分类
    categorizeContent() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const content = document.body.textContent.toLowerCase();
        
        // 网站域名分类
        const domainCategories = {
            'github.com': '开发',
            'gitlab.com': '开发',
            'stackoverflow.com': '技术',
            'csdn.net': '技术',
            'juejin.cn': '技术',
            'zhihu.com': '知识',
            'youtube.com': '视频',
            'bilibili.com': '视频',
            'netflix.com': '娱乐',
            'amazon.com': '购物',
            'taobao.com': '购物',
            'jd.com': '购物',
            'wikipedia.org': '百科',
            'baidu.com': '搜索',
            'google.com': '搜索',
            'news.': '新闻',
            'blog.': '博客'
        };
        
        for (let [domain, category] of Object.entries(domainCategories)) {
            if (url.includes(domain)) return category;
        }
        
        // 内容关键词分类
        const contentCategories = {
            '技术': ['编程', 'code', 'api', '算法', '开发', 'javascript', 'python', 'java', 'css', 'html'],
            '新闻': ['新闻', 'news', '时事', '报道', '最新'],
            '博客': ['博客', 'blog', '文章', '随笔', '心得'],
            '购物': ['购买', '价格', '商品', '优惠', '折扣', '商城', '店铺'],
            '教育': ['教程', '学习', '课程', '培训', '教育', '知识'],
            '娱乐': ['游戏', '电影', '音乐', '娱乐', '综艺'],
            '工具': ['工具', 'tool', '在线', '生成器', '转换'],
            '文档': ['文档', 'documentation', '手册', '指南', 'api']
        };
        
        for (let [category, keywords] of Object.entries(contentCategories)) {
            for (let keyword of keywords) {
                if (title.includes(keyword) || content.includes(keyword)) {
                    return category;
                }
            }
        }
        
        return '其他';
    }

    // 估算阅读时间
    estimateReadingTime() {
        const text = document.body.textContent;
        const wordCount = text.trim().split(/\s+/).length;
        const readingSpeed = 200; // 每分钟阅读词数
        return Math.ceil(wordCount / readingSpeed);
    }

    // 提取图片
    extractImages() {
        const images = [];
        const imgElements = document.querySelectorAll('img');
        
        imgElements.forEach(img => {
            if (img.src && img.width > 100 && img.height > 100) {
                images.push({
                    src: img.src,
                    alt: img.alt || '',
                    width: img.width,
                    height: img.height
                });
            }
        });
        
        return images.slice(0, 5); // 最多返回5张图片
    }

    // 提取链接
    extractLinks() {
        const links = [];
        const linkElements = document.querySelectorAll('a[href]');
        
        linkElements.forEach(link => {
            const href = link.href;
            const text = link.textContent.trim();
            
            if (href && text && href.startsWith('http') && text.length > 3) {
                links.push({
                    url: href,
                    text: text.substring(0, 100),
                    title: link.title || ''
                });
            }
        });
        
        return links.slice(0, 10); // 最多返回10个链接
    }

    // 获取字数
    getWordCount() {
        const text = document.body.textContent.trim();
        return text.split(/\s+/).length;
    }

    // 检测语言
    detectLanguage() {
        const text = document.body.textContent;
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
        const englishChars = text.match(/[a-zA-Z]/g);
        
        if (chineseChars && chineseChars.length > (englishChars?.length || 0)) {
            return 'zh';
        } else if (englishChars && englishChars.length > 100) {
            return 'en';
        }
        
        return 'unknown';
    }

    // 检查书签状态
    async checkBookmarkStatus() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'checkBookmark',
                url: window.location.href
            });
            
            this.isBookmarked = response.isBookmarked;
            this.updateFloatingButton();
        } catch (error) {
            console.log('检查书签状态失败:', error);
        }
    }

    // 创建浮动按钮
    createFloatingButton() {
        // 避免重复创建
        if (document.getElementById('cognimark-floating-btn')) return;
        
        this.floatingButton = document.createElement('div');
        this.floatingButton.id = 'cognimark-floating-btn';
        this.floatingButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        
        // 添加样式
        this.floatingButton.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: #007bff;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
            z-index: 10000;
            transition: all 0.3s ease;
            opacity: 0.8;
        `;
        
        // 添加悬停效果
        this.floatingButton.addEventListener('mouseenter', () => {
            this.floatingButton.style.transform = 'scale(1.1)';
            this.floatingButton.style.opacity = '1';
        });
        
        this.floatingButton.addEventListener('mouseleave', () => {
            this.floatingButton.style.transform = 'scale(1)';
            this.floatingButton.style.opacity = '0.8';
        });
        
        // 添加点击事件
        this.floatingButton.addEventListener('click', () => {
            this.toggleBookmark();
        });
        
        document.body.appendChild(this.floatingButton);
    }

    // 更新浮动按钮状态
    updateFloatingButton() {
        if (!this.floatingButton) return;
        
        if (this.isBookmarked) {
            this.floatingButton.style.background = '#28a745';
            this.floatingButton.title = '已收藏 - 点击取消收藏';
        } else {
            this.floatingButton.style.background = '#007bff';
            this.floatingButton.title = '点击收藏此页面';
        }
    }

    // 切换书签状态
    async toggleBookmark() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'toggleBookmark',
                bookmark: {
                    title: document.title,
                    url: window.location.href,
                    ...this.pageAnalysis
                }
            });
            
            if (response.success) {
                this.isBookmarked = !this.isBookmarked;
                this.updateFloatingButton();
                this.showToast(this.isBookmarked ? '已添加到书签' : '已从书签中移除');
            }
        } catch (error) {
            console.log('切换书签状态失败:', error);
            this.showToast('操作失败，请重试');
        }
    }

    // 显示提示信息
    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #333;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 10001;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // 显示动画
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 100);
        
        // 自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 2000);
    }

    // 设置消息监听器
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'getPageAnalysis':
                    sendResponse(this.pageAnalysis);
                    break;
                case 'refreshBookmarkStatus':
                    this.checkBookmarkStatus();
                    break;
                default:
                    break;
            }
        });
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new CogniMarkContent();
    });
} else {
    new CogniMarkContent();
}