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
async function initializeTabs() {
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ 
        tabTree: rootTabs,
        expandedStates: expandedStates 
    });
}
initializeTabs();

// Listen for tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ 
        tabTree: rootTabs,
        expandedStates: expandedStates 
    });
});

// Listen for tab closing
chrome.tabs.onRemoved.addListener(async (tab) => {
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ 
        tabTree: rootTabs,
        expandedStates: expandedStates 
    });
});

chrome.tabs.on
// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
        const tabs = await chrome.tabs.query({});
        const rootTabs = buildTreeStructure(tabs);
        await chrome.storage.local.set({ 
            tabTree: rootTabs,
            expandedStates: expandedStates 
        });
    }
});
