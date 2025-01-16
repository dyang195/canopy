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
        const { tabTree, storedExpandedStates } = await chrome.storage.local.get([
            'tabTree',
            'storedExpandedStates'
        ]);
        this.tabTree = tabTree || [];
        this.expandedStates = storedExpandedStates || {};
    }

    async createHeader() {
        const header = document.createElement('div');
        header.className = 'tree-header';
        
        const title = document.createElement('h1');
        title.className = 'header-title';
        title.textContent = 'Canopy - A tab tree visualizer';
        
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

        // Get current windowId
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            this.windowId = tab.windowId;
        }

        if (this.mode === 'popup') {
            const viewToggle = document.createElement('button');
            viewToggle.className = 'button';
            
            // Create a container for the text to allow different styles
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
     * Recursively creates DOM elements for the node and its displayed children.
     * Returns a DOM element (or null if it doesn’t pass the search).
     */
    createNodeElement(node) {
        // Does the node’s own title match the search?
        const nodeTitle = (node.title || '').toLowerCase();
        const nodeMatches = nodeTitle.includes(this.searchTerm);

        // If the node doesn't match, but has children that do, we still show it
        // We'll figure that out after we recursively call children
        let passesSearch = nodeMatches;

        // Build a container for this node, always create it for now
        const div = document.createElement('div');
        div.className = 'tree-node';

        // The row that displays tab info
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';

        // Expander or spacer
        const isExpanded = (this.expandedStates[node.id] !== undefined)
            ? this.expandedStates[node.id]
            : true;

        if (node.children && node.children.length > 0) {
            const expander = document.createElement('button');
            expander.className = 'expander-button';
            expander.innerHTML = isExpanded ? '&#9660;' : '&#9658;'; // ▼ or ▶
            expander.onclick = async (e) => {
                e.stopPropagation();
                this.expandedStates[node.id] = !isExpanded;
                await chrome.storage.local.set({ storedExpandedStates: this.expandedStates });
                this.render();
            };
            tabItem.appendChild(expander);
        } else {
            // Add spacer for nodes without children
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
        
        // Title
        const title = document.createElement('div');
        title.className = 'tab-title';
        title.textContent = node.title || new URL(node.url).hostname || 'New Tab';
        title.title = node.title;
        
        // Actions: focus/close
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

        // Now handle children (if expanded)
        const displayedChildren = [];
        if (node.children && node.children.length > 0 && isExpanded) {
            for (const child of node.children) {
                // Recursively build the child's element
                const childEl = this.createNodeElement(child);
                // If childEl is not null, that means the child or its descendants passed
                if (childEl) {
                    displayedChildren.push(childEl);
                }
            }
        }

        // If at least one child matched the search, we also display this node
        if (displayedChildren.length > 0) {
            passesSearch = true;
        }

        // If this node doesn't pass and neither do its children, skip it
        if (!passesSearch) {
            return null;
        }

        // Mark the last displayed child for L-shaped line
        if (displayedChildren.length > 0) {
            // The final displayed child gets the .tree-node-last
            const lastChild = displayedChildren[displayedChildren.length - 1];
            lastChild.classList.add('tree-node-last');
        }

        // Append the children in order
        for (const childEl of displayedChildren) {
            div.appendChild(childEl);
        }

        return div;
    }

    render() {
        const container = document.createElement('div');
        container.className = 'tree-content';
        
        // Build each root node
        const displayedRootNodes = [];
        for (const rootNode of this.tabTree) {
            const el = this.createNodeElement(rootNode);
            if (el) {
                displayedRootNodes.push(el);
            }
        }

        // Mark the last of the displayed root nodes
        if (displayedRootNodes.length > 0) {
            const lastRoot = displayedRootNodes[ displayedRootNodes.length - 1 ];
            lastRoot.classList.add('tree-node-last');
        }

        // Append them
        for (const el of displayedRootNodes) {
            container.appendChild(el);
        }

        // Clear old content and attach new
        const existingContent = this.container.querySelector('.tree-content');
        if (existingContent) {
            existingContent.remove();
        }
        this.container.appendChild(container);
    }

    setupEventListeners() {
        // Re-render if tabTree or storedExpandedStates changes in local storage
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.tabTree || changes.storedExpandedStates) {
                this.loadTree().then(() => this.render());
            }
        });
    }
}
