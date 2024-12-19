class TabTreeView {
    constructor(containerId, mode = 'popup') {
        this.container = document.getElementById(containerId);
        this.mode = mode;
        this.windowId = '';
        this.searchTerm = '';
        this.init();
    }

    async init() {
        await this.loadTree();
        await this.createHeader();
        this.render();
        this.setupEventListeners();
    }

    async loadTree() {
        const { tabTree, expandedStates } = await chrome.storage.local.get(['tabTree', 'expandedStates']);
        this.tabTree = tabTree || [];
        this.expandedStates = expandedStates || {};
    }

    async createHeader() {
        const header = document.createElement('div');
        header.className = 'tree-header';
        
        const title = document.createElement('h1');
        title.className = 'header-title';
        title.textContent = 'Tab Tree Visualizer';
        
        const controls = document.createElement('div');
        controls.className = 'header-controls';
        
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Search tabs...';
        search.className = 'search-input';
        search.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.render();
        });
        
        const [tab] = await chrome.tabs.query({});
        this.windowId = tab.windowId

        if (this.mode === 'popup') {
            const viewToggle = document.createElement('button');
            viewToggle.className = 'button';
            viewToggle.textContent = 'Open in Side Panel';
            // viewToggle.onclick.addListener((tab) => {
            //     chrome.sidePanel.open({ windowId: tab.windowId });
            //     window.close();
            // });
            viewToggle.onclick = async() => {
                await chrome.sidePanel.open({ windowId: this.windowId });
                await window.close();
            }
            controls.appendChild(viewToggle);
        }
        
        controls.appendChild(search);
        header.appendChild(title);
        header.appendChild(controls);
        this.container.appendChild(header);
    }

    createNodeElement(node, level = 0) {
        if (this.searchTerm && !node.title.toLowerCase().includes(this.searchTerm)) {
            if (!this.hasMatchingChild(node)) {
                return null;
            }
        }

        const div = document.createElement('div');
        div.className = 'tree-node';
        
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        
        if (node.children && node.children.length > 0) {
            const expander = document.createElement('button');
            expander.className = 'expander-button';
            // Use Unicode triangles for better compatibility
            expander.textContent = this.expandedStates[node.id] ? '▾' : '▸';
            expander.onclick = (e) => {
                e.stopPropagation();
                this.expandedStates[node.id] = !this.expandedStates[node.id];
                chrome.storage.local.set({ expandedStates: this.expandedStates });
                this.render();
            };
            tabItem.appendChild(expander);
        }
        
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src = node.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
        favicon.onerror = () => {
            favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
        };
        
        const title = document.createElement('div');
        title.className = 'tab-title';
        title.textContent = node.title || new URL(node.url).hostname || 'New Tab';
        title.title = node.title;
        
        const actions = document.createElement('div');
        actions.className = 'tab-actions';
        
        const focusButton = document.createElement('button');
        focusButton.className = 'button';
        focusButton.textContent = 'Focus';
        focusButton.onclick = (e) => {
            e.stopPropagation();
            chrome.tabs.update(node.id, { active: true });
        };
        
        const closeButton = document.createElement('button');
        closeButton.className = 'button';
        closeButton.textContent = 'Close';
        closeButton.onclick = (e) => {
            e.stopPropagation();
            chrome.tabs.remove(node.id);
        };
        
        actions.appendChild(focusButton);
        actions.appendChild(closeButton);
        
        tabItem.appendChild(favicon);
        tabItem.appendChild(title);
        tabItem.appendChild(actions);
        div.appendChild(tabItem);
        
        if (node.children && node.children.length > 0 && this.expandedStates[node.id]) {
            node.children.forEach(child => {
                const childElement = this.createNodeElement(child, level + 1);
                if (childElement) {
                    div.appendChild(childElement);
                }
            });
        }
        
        return div;
    }

    hasMatchingChild(node) {
        if (!node.children) return false;
        return node.children.some(child => 
            child.title.toLowerCase().includes(this.searchTerm) || 
            this.hasMatchingChild(child)
        );
    }

    render() {
        const container = document.createElement('div');
        container.className = 'tree-content';
        this.tabTree.forEach(node => {
            const nodeElement = this.createNodeElement(node);
            if (nodeElement) {
                container.appendChild(nodeElement);
            }
        });
        
        // Clear only the content area, not the header
        const existingContent = this.container.querySelector('.tree-content');
        if (existingContent) {
            existingContent.remove();
        }
        this.container.appendChild(container);
    }

    setupEventListeners() {
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.tabTree || changes.expandedStates) {
                this.loadTree().then(() => this.render());
            }
        });
    }
}
