# Canopy

A Chrome extension that visualizes open tabs in a tree hierarchy.  
Allows collapsing, searching, and easy navigation/closing of tabs.

## Features

- **Hierarchy**: Tracks parent/child relationships using its own internal storage, so tabs stay organized even if Chrome discards `openerTabId`.  
- **Search**: Quickly filter open tabs by title.  
- **Expand/Collapse**: Toggle branches to manage large sets of tabs.  
- **Side Panel Support**: Optionally open the UI in Chrome's side panel (Chrome 114+).  

## Installation / Development

1. **Clone or Download** the repository with all source files (including `manifest.json`, `background.js`, `shared.js`, etc.).  
2. **Open Chrome** and go to:  
   `chrome://extensions`  
   (Make sure **Developer Mode** is toggled on in the top-right corner.)
3. **Click "Load unpacked"**, then select the folder containing these files.  
   - The extension should appear in your list of installed extensions.
4. **Icons**: Make sure you have the `icons/` folder with `icon16.png`, `icon48.png`, and `icon128.png`.

## Usage

- **Click** the extension’s icon in the Chrome toolbar to open its popup.  
  - From there, you can see your tabs in a tree structure.  
  - Use the **"Open in Side Panel"** button to move the UI to Chrome’s side panel (if supported).  
- **Searching**: Type in the search box at the top to filter tabs by title.  
- **Expanding/Collapsing**: Click the little arrows next to a parent tab to expand/collapse its children.  
- **Focus / Close**: Hover over a tab entry to reveal the "Focus" (activate) or "Close" button.  

## Notes

- Closing a parent tab automatically reassigns its children to the parent's parent (i.e., they move up one level).  
- The "side panel" requires Chrome 114 or later. If you remove `"default_popup"` from `manifest.json`, Chrome won’t open a popup on icon click, but you can open the side panel via the **Extensions** menu → **Tab Tree Visualizer** → **Open in side panel**.

## Contributing

Feel free to open issues or pull requests for any enhancements or bug fixes.  