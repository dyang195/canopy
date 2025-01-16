let expandedStates = {};
let parentMap = {}; // childTabId => parentTabId

async function loadStorage() {
    const { storedParentMap, storedExpandedStates } = await chrome.storage.local.get([
        'storedParentMap',
        'storedExpandedStates'
    ]);
    parentMap = storedParentMap || {};
    expandedStates = storedExpandedStates || {};
}

// Save both parentMap and expandedStates to local storage
async function saveStorage() {
    await chrome.storage.local.set({
        storedParentMap: parentMap,
        storedExpandedStates: expandedStates
    });
}

/**
 * Builds a hierarchical tree of tabs from parentMap rather than tab.openerTabId
 */
function buildTreeStructure(tabs) {
    // Convert tabs array to a dictionary for quick lookups
    const tabDict = {};
    tabs.forEach(tab => {
        tabDict[tab.id] = {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            children: [],
            expanded: expandedStates[tab.id] !== undefined ? expandedStates[tab.id] : true
        };
    });

    // Build the hierarchy using parentMap
    const rootTabs = [];

    tabs.forEach(tab => {
        const parentId = parentMap[tab.id];
        if (parentId && tabDict[parentId]) {
            // If we have a parent, attach this tab as a child
            tabDict[parentId].children.push(tabDict[tab.id]);
        } else {
            // No known parent => root
            rootTabs.push(tabDict[tab.id]);
        }
    });

    return rootTabs;
}

// Move all children of `deletedTabId` to become children of `deletedTabId`’s parent
// That means they "move up" one level instead of going all the way to the root.
function reassignChildren(deletedTabId) {
    // The parent of the one being deleted
    const grandParent = parentMap[deletedTabId];
    // Loop all child->parent relationships
    for (const childId in parentMap) {
        if (parentMap[childId] === deletedTabId) {
            if (grandParent) {
                // Child becomes child of the parent's parent
                parentMap[childId] = grandParent;
            } else {
                // No grandparent => child becomes root
                delete parentMap[childId];
            }
        }
    }
    // Finally remove the parent itself
    delete parentMap[deletedTabId];
}

// Initialize extension with current tabs
async function initializeTabs() {
    await loadStorage();
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ tabTree: rootTabs });
}
initializeTabs();

// Listen for tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
    await loadStorage();

    // If the created tab has an openerTabId, store that in parentMap
    if (tab.openerTabId) {
        parentMap[tab.id] = tab.openerTabId;
    }

    // Save, then rebuild & store
    await saveStorage();
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ tabTree: rootTabs });
});

// Listen for tab closing
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await loadStorage();

    // Reassign children to parent's parent
    reassignChildren(tabId);

    // Also remove it from expandedStates if present
    if (expandedStates[tabId] !== undefined) {
        delete expandedStates[tabId];
    }

    // Save, then rebuild & store
    await saveStorage();
    const tabs = await chrome.tabs.query({});
    const rootTabs = buildTreeStructure(tabs);
    await chrome.storage.local.set({ tabTree: rootTabs });
});

// Listen for tab updates (title, url, favicon, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
        await loadStorage();

        // Rebuild & store updated tree
        const tabs = await chrome.tabs.query({});
        const rootTabs = buildTreeStructure(tabs);
        await chrome.storage.local.set({ tabTree: rootTabs });

        await saveStorage();
    }
});
