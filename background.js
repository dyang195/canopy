let tabTree = {};
let expandedStates = {};

function buildTreeStructure(tabs) {
    const tree = {};
    const rootTabs = [];
    
    // First pass: Create all tab nodes
    tabs.forEach(tab => {
        tree[tab.id] = {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            children: [],
            openerTabId: tab.openerTabId,
            expanded: expandedStates[tab.id] !== undefined ? expandedStates[tab.id] : true
        };
    });
    
    // Second pass: Build tree relationships
    tabs.forEach(tab => {
        if (tab.openerTabId && tree[tab.openerTabId]) {
            tree[tab.openerTabId].children.push(tree[tab.id]);
        } else {
            rootTabs.push(tree[tab.id]);
        }
    });
    
    return rootTabs;
}

// Initialize tree with existing tabs
chrome.tabs.query({}, (tabs) => {
    const rootTabs = buildTreeStructure(tabs);
    chrome.storage.local.set({ 
        tabTree: rootTabs,
        expandedStates: expandedStates 
    });
});

// Listen for tab creation
chrome.tabs.onCreated.addListener((tab) => {
    chrome.tabs.query({}, (tabs) => {
        const rootTabs = buildTreeStructure(tabs);
        chrome.storage.local.set({ 
            tabTree: rootTabs,
            expandedStates: expandedStates 
        });
    });
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
        chrome.tabs.query({}, (tabs) => {
            const rootTabs = buildTreeStructure(tabs);
            chrome.storage.local.set({ 
                tabTree: rootTabs,
                expandedStates: expandedStates 
            });
        });
    }
});

chrome.action.onClicked.addListener((tab) => {
    // First try to get the current state
    chrome.sidePanel.getOptions({}, (options) => {
        const isOpen = options?.enabled ?? false;
        chrome.sidePanel.setOptions({ enabled: !isOpen });
    });
});