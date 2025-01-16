/**
 * Loads the windowTrees object from local storage.
 * 
 * windowTrees = {
 *   [windowId]: {
 *     parentMap: { [tabId]: parentTabId },
 *     expandedStates: { [tabId]: boolean },
 *     tabTree: [ ...root nodes... ]
 *   },
 *   ...
 * }
 */
async function loadWindowTrees() {
    const { windowTrees } = await chrome.storage.local.get(['windowTrees']);
    return windowTrees || {};
}

/**
 * Saves the windowTrees object back to local storage.
 */
async function saveWindowTrees(windowTrees) {
    await chrome.storage.local.set({ windowTrees });
}

/**
 * Cleans out parentMap and expandedStates for tabs that no longer exist in the given window.
 */
function cleanupDeadTabs(tabs, parentMap, expandedStates) {
    const validTabIds = new Set(tabs.map(t => t.id));

    // Remove parentMap entries if the child or the parent doesn't exist
    for (const childId in parentMap) {
        const childIdNum = parseInt(childId, 10);
        const parentIdNum = parseInt(parentMap[childId], 10);
        if (!validTabIds.has(childIdNum) || !validTabIds.has(parentIdNum)) {
            delete parentMap[childId];
        }
    }

    // Remove expandedStates if the tab doesn't exist
    for (const tabId in expandedStates) {
        const tabIdNum = parseInt(tabId, 10);
        if (!validTabIds.has(tabIdNum)) {
            delete expandedStates[tabId];
        }
    }
}

/**
 * Rebuilds tabTree for a single window using parentMap & expandedStates.
 * Cleans up "ghost" tabs before building.
 */
function buildTreeStructureForWindow(windowId, tabs, parentMap, expandedStates) {
    // 1) Remove stale references
    cleanupDeadTabs(tabs, parentMap, expandedStates);

    // 2) Convert tabs to a dictionary
    const tabDict = {};
    for (const tab of tabs) {
        tabDict[tab.id] = {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            children: [],
            expanded: expandedStates[tab.id] !== undefined
                ? expandedStates[tab.id]
                : true
        };
    }

    // 3) Build a list of root nodes or children
    const rootTabs = [];
    for (const tab of tabs) {
        const parentId = parentMap[tab.id];
        if (parentId && tabDict[parentId]) {
            // valid parent => attach as child
            tabDict[parentId].children.push(tabDict[tab.id]);
        } else {
            // no parent => root
            rootTabs.push(tabDict[tab.id]);
        }
    }
    return rootTabs;
}

/**
 * Move all children of `deletedTabId` up one level in this window’s parentMap.
 */
function reassignChildren(windowData, deletedTabId) {
    const { parentMap } = windowData;
    const grandParent = parentMap[deletedTabId];
    for (const childId in parentMap) {
        if (parentMap[childId] === deletedTabId) {
            if (grandParent) {
                parentMap[childId] = grandParent;
            } else {
                delete parentMap[childId];
            }
        }
    }
    delete parentMap[deletedTabId];
}

/**
 * Initialize data for all open windows on extension startup.
 */
async function initializeAllWindows() {
    const windowTrees = await loadWindowTrees();
    const allWindows = await chrome.windows.getAll();

    for (const w of allWindows) {
        if (!windowTrees[w.id]) {
            windowTrees[w.id] = {
                parentMap: {},
                expandedStates: {},
                tabTree: []
            };
        }
        const tabs = await chrome.tabs.query({ windowId: w.id });
        const { parentMap, expandedStates } = windowTrees[w.id];
        const rootTabs = buildTreeStructureForWindow(
            w.id,
            tabs,
            parentMap,
            expandedStates
        );
        windowTrees[w.id].tabTree = rootTabs;
    }
    await saveWindowTrees(windowTrees);
}
initializeAllWindows();

// Listen for tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
    const windowTrees = await loadWindowTrees();

    // Ensure this window is tracked
    if (!windowTrees[tab.windowId]) {
        windowTrees[tab.windowId] = {
            parentMap: {},
            expandedStates: {},
            tabTree: []
        };
    }

    const winData = windowTrees[tab.windowId];

    // If the tab has an openerTabId => treat as child
    // If user pressed plus button or Ctrl+T, typically there's no openerTabId => root
    if (tab.openerTabId) {
        winData.parentMap[tab.id] = tab.openerTabId;
    }

    // Rebuild the tree
    const tabs = await chrome.tabs.query({ windowId: tab.windowId });
    winData.tabTree = buildTreeStructureForWindow(
        tab.windowId,
        tabs,
        winData.parentMap,
        winData.expandedStates
    );
    await saveWindowTrees(windowTrees);

    // Trigger an update so popup/side panel can refresh
    chrome.storage.local.set({ windowTrees });
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const { windowId } = removeInfo;
    if (typeof windowId === 'undefined') {
        return;
    }

    const windowTrees = await loadWindowTrees();
    if (!windowTrees[windowId]) return;

    const winData = windowTrees[windowId];
    // Move children up
    reassignChildren(winData, tabId);
    // Remove expanded state if any
    delete winData.expandedStates[tabId];

    // Rebuild
    const tabs = await chrome.tabs.query({ windowId });
    winData.tabTree = buildTreeStructureForWindow(
        windowId,
        tabs,
        winData.parentMap,
        winData.expandedStates
    );
    await saveWindowTrees(windowTrees);

    // Trigger update
    chrome.storage.local.set({ windowTrees });
});

// Listen for tab updates (title, url, favIconUrl)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
        const windowTrees = await loadWindowTrees();
        const wId = tab.windowId;
        if (!windowTrees[wId]) return;

        const winData = windowTrees[wId];
        const tabs = await chrome.tabs.query({ windowId: wId });
        winData.tabTree = buildTreeStructureForWindow(
            wId,
            tabs,
            winData.parentMap,
            winData.expandedStates
        );
        await saveWindowTrees(windowTrees);

        // Fire update
        chrome.storage.local.set({ windowTrees });
    }
});

// Listen for new windows
chrome.windows.onCreated.addListener(async (window) => {
    const windowTrees = await loadWindowTrees();
    if (!windowTrees[window.id]) {
        windowTrees[window.id] = {
            parentMap: {},
            expandedStates: {},
            tabTree: []
        };
    }
    if (window.type === 'normal') {
        const tabs = await chrome.tabs.query({ windowId: window.id });
        const { parentMap, expandedStates } = windowTrees[window.id];
        windowTrees[window.id].tabTree = buildTreeStructureForWindow(
            window.id,
            tabs,
            parentMap,
            expandedStates
        );
    }
    await saveWindowTrees(windowTrees);
    chrome.storage.local.set({ windowTrees });
});

// Listen for window removal
chrome.windows.onRemoved.addListener(async (windowId) => {
    const windowTrees = await loadWindowTrees();
    if (windowTrees[windowId]) {
        delete windowTrees[windowId];
        await saveWindowTrees(windowTrees);
        chrome.storage.local.set({ windowTrees });
    }
});
