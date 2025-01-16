class TabTreeView {
    constructor(containerId, mode = 'popup') {
        this.container = document.getElementById(containerId);
        this.mode = mode;
        this.windowId = '';
        this.searchTerm = '';
        this.init();
    }

    async init() {
        // Find the current window
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            this.windowId = tab.windowId;
        } else {
            this.windowId = 0; // fallback
        }

        await this.loadTree();
        await this.createHeader();
        this.render();
        this.setupEventListeners();
    }

    async loadTree() {
        const { windowTrees } = await chrome.storage.local.get(['windowTrees']);
        if (!windowTrees) {
            this.windowTrees = {};
        } else {
            this.windowTrees = windowTrees;
        }

        // Ensure data for our window exists
        if (!this.windowTrees[this.windowId]) {
            this.windowTrees[this.windowId] = {
                parentMap: {},
                expandedStates: {},
                tabTree: []
            };
        }

        const { tabTree, expandedStates } = this.windowTrees[this.windowId];
        this.tabTree = tabTree || [];
        this.expandedStates = expandedStates || {};
    }

    async createHeader() {
        const header = document.createElement('div');
        header.className = 'tree-header';
        
        const title = document.createElement('h1');
        title.className = 'header-title';
        title.textContent = 'Canopy - A Browser Tab Visualizer';
        
        const controls = document.createElement('div');
        controls.className = 'header-controls';
        
        // Search input
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Search tabs...';
        search.className = 'search-input';
        search.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.render();
        });

        // If in popup mode, show "Open in Side Panel" button
        if (this.mode === 'popup') {
            const viewToggle = document.createElement('button');
            viewToggle.className = 'button';
            
            const textContainer = document.createElement('span');
            textContainer.innerHTML = '<strong>Open in Side Panel</strong> <span style="font-size: 11px; opacity: 0.8">(recommended)</span>';
            
            viewToggle.appendChild(textContainer);
            viewToggle.onclick = async () => {
                try {
                    await chrome.sidePanel.setOptions({
                        enabled: true,
                        path: 'sidebar.html'
                    });
                    await chrome.sidePanel.open({ windowId: this.windowId });
                    window.close();
                } catch (error) {
                    console.error('Error opening side panel:', error);
                }
            };
            controls.appendChild(viewToggle);
        }
        
        controls.appendChild(search);
        header.appendChild(title);
        header.appendChild(controls);
        this.container.appendChild(header);
    }

    /**
     * Recursively creates DOM for the node + its displayed children.
     * Returns null if node & children don't match the search.
     */
    createNodeElement(node) {
        const nodeTitle = (node.title || '').toLowerCase();
        const nodeMatches = nodeTitle.includes(this.searchTerm);
        let passesSearch = nodeMatches;

        const div = document.createElement('div');
        div.className = 'tree-node';

        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';

        const isExpanded = this.expandedStates[node.id] !== undefined
            ? this.expandedStates[node.id]
            : true;

        if (node.children && node.children.length > 0) {
            const expander = document.createElement('button');
            expander.className = 'expander-button';
            expander.innerHTML = isExpanded ? '&#9660;' : '&#9658;'; // ▼ or ▶
            expander.onclick = async (e) => {
                e.stopPropagation();
                this.expandedStates[node.id] = !isExpanded;

                // Persist expansions
                if (this.windowTrees[this.windowId]) {
                    this.windowTrees[this.windowId].expandedStates = this.expandedStates;
                    await chrome.storage.local.set({ windowTrees: this.windowTrees });
                }

                this.render();
            };
            tabItem.appendChild(expander);
        } else {
            // Spacer for leaf nodes
            const spacer = document.createElement('div');
            spacer.style.width = '20px';
            tabItem.appendChild(spacer);
        }

        // Favicon
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src = node.favIconUrl ||
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
        favicon.onerror = () => {
            favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
        };
        
        const title = document.createElement('div');
        title.className = 'tab-title';
        title.textContent = node.title || new URL(node.url).hostname || 'New Tab';
        title.title = node.title;
        
        // Actions
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

        // Children
        const displayedChildren = [];
        if (node.children && node.children.length > 0 && isExpanded) {
            for (const child of node.children) {
                const childEl = this.createNodeElement(child);
                if (childEl) {
                    displayedChildren.push(childEl);
                }
            }
        }
        if (displayedChildren.length > 0) {
            passesSearch = true;
        }
        if (!passesSearch) {
            return null; 
        }

        // Mark the last displayed child with .tree-node-last
        if (displayedChildren.length > 0) {
            const lastChild = displayedChildren[displayedChildren.length - 1];
            lastChild.classList.add('tree-node-last');
        }
        for (const childEl of displayedChildren) {
            div.appendChild(childEl);
        }

        return div;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'tree-content';

        const displayedRootNodes = [];
        for (const rootNode of this.tabTree) {
            const el = this.createNodeElement(rootNode);
            if (el) {
                displayedRootNodes.push(el);
            }
        }

        // Mark the last displayed root node
        if (displayedRootNodes.length > 0) {
            const lastRoot = displayedRootNodes[displayedRootNodes.length - 1];
            lastRoot.classList.add('tree-node-last');
        }
        for (const el of displayedRootNodes) {
            container.appendChild(el);
        }

        const existingContent = this.container.querySelector('.tree-content');
        if (existingContent) {
            existingContent.remove();
        }
        this.container.appendChild(container);
    }

    setupEventListeners() {
        // Listen for changes to windowTrees in local storage
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.windowTrees) {
                this.loadTree().then(() => this.render());
            }
        });
    }
}
