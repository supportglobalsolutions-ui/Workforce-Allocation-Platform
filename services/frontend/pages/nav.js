document.addEventListener('DOMContentLoaded', () => {
    // 1. Path Depth Resolution
    const currentPath = window.location.pathname || '';
    const isSubdir = currentPath.includes('/worker/') || currentPath.includes('/admin/') || currentPath.includes('/leadership/') || currentPath.includes('\\worker\\') || currentPath.includes('\\admin\\') || currentPath.includes('\\leadership\\');
    const prefix = isSubdir ? '../' : '';

    // 2. Complete Pages List
    const pages = [
        { name: 'Public Landing Page', url: 'globalsolutions_landing_page.html', category: 'Public & Auth' },
        { name: 'Enterprise Login', url: 'executive_login.html', category: 'Public & Auth' },
        { name: 'Worker Dashboard', url: 'worker/worker_portal_home.html', category: 'Worker Layer' },
        { name: 'RDP Claim Board', url: 'worker/rdp_claim_board.html', category: 'Worker Layer' },
        { name: 'Active Session', url: 'worker/active_work_session.html', category: 'Worker Layer' },
        { name: 'Operations Command Center', url: 'admin/operations_command_center.html', category: 'Admin / Operations' },
        { name: 'Worker Management', url: 'admin/worker_management.html', category: 'Admin / Operations' },
        { name: 'RDP Resource Management', url: 'admin/rdp_resource_management.html', category: 'Admin / Operations' },
        { name: 'Session History', url: 'admin/session_history.html', category: 'Admin / Operations' },
        { name: 'Audit Logs', url: 'admin/audit_logs.html', category: 'Admin / Operations' },
        { name: 'System Settings', url: 'admin/system_settings.html', category: 'Admin / Operations' },
        { name: 'Partner Management', url: 'admin/partner_management.html', category: 'Admin / Operations' },
        { name: 'CEO Command Center', url: 'leadership/ceo_command_center.html', category: 'Leadership Layer' },
        { name: 'Payroll Dashboard', url: 'leadership/payroll_revenue_dashboard.html', category: 'Leadership Layer' },
        { name: 'Financial Intelligence', url: 'leadership/financial_intelligence.html', category: 'Leadership Layer' }
    ];

    // 3. Inject CSS style block for custom styles
    const style = document.createElement('style');
    style.innerHTML = `
        #command-menu-modal input:focus {
            outline: none !important;
            box-shadow: none !important;
            border: none !important;
        }
        .command-menu-item {
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);

    // 4. Modal HTML Definition
    const modalHtml = `
    <div id="command-menu-modal" class="fixed inset-0 z-[9999] hidden bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4 font-body-md text-body-md">
      <div class="bg-[#001712] border border-white/10 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] relative z-[10000]">
        <!-- Search Header -->
        <div class="p-4 border-b border-white/10 flex items-center gap-3 bg-surface-container">
          <span class="material-symbols-outlined text-secondary">search</span>
          <input type="text" id="command-menu-search" class="w-full bg-transparent border-none text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-0 text-lg font-body-md" placeholder="Search pages or type command..." autocomplete="off" />
          <span class="text-xs bg-white/10 text-on-surface-variant px-2 py-1 rounded font-data-mono">ESC</span>
        </div>
        <!-- Results / Links -->
        <div id="command-menu-results" class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Generated dynamically -->
        </div>
        <!-- Footer -->
        <div class="p-3 border-t border-white/10 bg-surface-container-lowest flex justify-between items-center text-xs text-on-surface-variant font-data-mono">
          <div class="flex gap-4">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>ctrl+k to toggle</span>
        </div>
      </div>
    </div>
    `;

    // Inject HTML modal structure into document body
    const container = document.createElement('div');
    container.innerHTML = modalHtml;
    document.body.appendChild(container.firstElementChild);

    const modal = document.getElementById('command-menu-modal');
    const searchInput = document.getElementById('command-menu-search');
    const resultsContainer = document.getElementById('command-menu-results');

    // Helper to map category names to Material Symbols icon tags
    function getIcon(category) {
        if (category.includes('Public')) return 'public';
        if (category.includes('Worker')) return 'badge';
        if (category.includes('Admin')) return 'admin_panel_settings';
        if (category.includes('Leadership')) return 'insights';
        return 'description';
    }

    let activeIndex = 0;
    let filteredItemsCount = 0;

    // Highlight an item by its data-index attribute
    function highlightItem(index) {
        const items = document.querySelectorAll('.command-menu-item');
        if (items.length === 0) return;

        // Wrap around limits
        if (index < 0) index = items.length - 1;
        if (index >= items.length) index = 0;

        activeIndex = index;

        items.forEach(item => {
            const idx = parseInt(item.getAttribute('data-index'), 10);
            if (idx === activeIndex) {
                item.classList.add('bg-primary-container/30', 'text-primary', 'border-primary/30');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-primary-container/30', 'text-primary', 'border-primary/30');
            }
        });
    }

    // Render results based on search input
    function renderResults(filterText = '') {
        resultsContainer.innerHTML = '';
        
        // Group by category
        const categories = {};
        pages.forEach(page => {
            if (filterText && !page.name.toLowerCase().includes(filterText.toLowerCase()) && !page.category.toLowerCase().includes(filterText.toLowerCase())) {
                return;
            }
            if (!categories[page.category]) {
                categories[page.category] = [];
            }
            categories[page.category].push(page);
        });

        const sortedCategories = Object.keys(categories);
        if (sortedCategories.length === 0) {
            resultsContainer.innerHTML = `<div class="text-center text-on-surface-variant py-8 font-body-md">No pages found matching "${filterText}"</div>`;
            filteredItemsCount = 0;
            return;
        }

        let itemIndex = 0;
        sortedCategories.forEach(cat => {
            const catDiv = document.createElement('div');
            catDiv.className = 'space-y-1';
            
            const catTitle = document.createElement('div');
            catTitle.className = 'text-xs font-label-caps text-secondary uppercase tracking-wider mb-2 font-bold px-2';
            catTitle.innerText = cat;
            catDiv.appendChild(catTitle);

            categories[cat].forEach(page => {
                const link = document.createElement('a');
                link.href = prefix + page.url;
                link.className = `command-menu-item flex items-center justify-between p-3 rounded-lg hover:bg-primary-container/20 hover:text-primary transition-all duration-150 border border-transparent hover:border-primary/20 group font-body-md`;
                link.setAttribute('data-index', itemIndex++);
                
                // Check if current page is this URL
                const isCurrent = currentPath.endsWith(page.url.replace(/\//g, '\\')) || currentPath.endsWith(page.url.replace(/\\/g, '/'));
                
                link.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary ${isCurrent ? 'text-primary' : ''}">${getIcon(page.category)}</span>
                        <span class="${isCurrent ? 'font-semibold text-primary' : 'text-on-surface'}">${page.name}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${isCurrent ? '<span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-label-caps">Current</span>' : ''}
                        <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity text-primary">arrow_forward</span>
                    </div>
                `;
                catDiv.appendChild(link);
            });
            resultsContainer.appendChild(catDiv);
        });

        filteredItemsCount = itemIndex;
        highlightItem(0);
    }

    // Toggle Command Menu visibility
    function toggleModal() {
        if (modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
            searchInput.value = '';
            renderResults();
            setTimeout(() => searchInput.focus(), 50);
        } else {
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
    }

    // Keydown routing
    document.addEventListener('keydown', (e) => {
        // Ctrl+K or Cmd+K
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleModal();
        }
        
        // Modal navigation
        if (!modal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                toggleModal();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightItem(activeIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightItem(activeIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const activeItem = document.querySelector(`.command-menu-item[data-index="${activeIndex}"]`);
                if (activeItem) {
                    activeItem.click();
                }
            }
        }
    });

    searchInput.addEventListener('input', (e) => {
        renderResults(e.target.value);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            toggleModal();
        }
    });

    // Automatically hook up existing Command Menu elements
    function hookCommandMenuButtons() {
        const allElements = document.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            
            // Hook elements with "Command Menu" text
            if (el.innerText && el.innerText.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ').includes('Command Menu')) {
                el.style.cursor = 'pointer';
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleModal();
                });
            }
        }
    }

    // Dynamic injection of Command Menu button to pages containing a <header> but no menu button
    function injectHeaderButtonIfNeeded() {
        const header = document.querySelector('header') || document.querySelector('nav');
        if (header) {
            // Check if there is already a Command Menu button inside
            let hasBtn = false;
            const interactiveElements = header.querySelectorAll('button, a');
            interactiveElements.forEach(el => {
                if (el.innerText && el.innerText.toLowerCase().includes('command menu')) {
                    hasBtn = true;
                }
            });

            if (!hasBtn) {
                const navBtn = document.createElement('button');
                navBtn.className = 'flex items-center gap-2 border border-secondary text-secondary hover:bg-secondary/10 font-label-caps text-label-caps px-4 py-2 rounded-lg transition-colors ml-auto mr-2 z-10';
                navBtn.innerHTML = `
                    Command Menu
                    <span class="material-symbols-outlined text-[16px]">keyboard_command_key</span>
                `;
                navBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleModal();
                });

                // Find a container to append to, e.g., trailing container
                const trailingDiv = header.querySelector('.flex.items-center.gap-2') || header.querySelector('.flex.items-center.gap-4') || header.querySelector('.ml-auto') || header;
                if (trailingDiv && trailingDiv !== header) {
                    if (trailingDiv.children.length > 0) {
                        trailingDiv.insertBefore(navBtn, trailingDiv.lastElementChild);
                    } else {
                        trailingDiv.appendChild(navBtn);
                    }
                } else {
                    header.appendChild(navBtn);
                }
            }
        }
    }

    // Bind sidebar links to actual files dynamically if they match standard names
    function bindSidebarLinks() {
        const sidebarLinks = document.querySelectorAll('aside a, nav a');
        sidebarLinks.forEach(link => {
            const text = link.innerText ? link.innerText.toLowerCase().trim() : '';
            if (text.includes('dashboard')) {
                if (currentPath.includes('/worker') || currentPath.includes('\\worker')) {
                    link.href = prefix + 'worker/worker_portal_home.html';
                } else if (currentPath.includes('/admin') || currentPath.includes('\\admin')) {
                    link.href = prefix + 'admin/operations_command_center.html';
                } else if (currentPath.includes('/leadership') || currentPath.includes('\\leadership')) {
                    link.href = prefix + 'leadership/ceo_command_center.html';
                }
            } else if (text.includes('operations')) {
                if (currentPath.includes('/worker') || currentPath.includes('\\worker')) {
                    link.href = prefix + 'worker/active_work_session.html';
                } else {
                    link.href = prefix + 'admin/session_history.html';
                }
            } else if (text.includes('resources')) {
                if (currentPath.includes('/worker') || currentPath.includes('\\worker')) {
                    link.href = prefix + 'worker/rdp_claim_board.html';
                } else {
                    link.href = prefix + 'admin/rdp_resource_management.html';
                }
            } else if (text.includes('payroll')) {
                link.href = prefix + 'leadership/payroll_revenue_dashboard.html';
            } else if (text.includes('intelligence')) {
                if (currentPath.includes('/leadership') || currentPath.includes('\\leadership')) {
                    link.href = prefix + 'leadership/financial_intelligence.html';
                } else {
                    link.href = prefix + 'admin/audit_logs.html';
                }
            } else if (text.includes('settings')) {
                link.href = prefix + 'admin/system_settings.html';
            }
        });
    }

    // Run hook routines
    hookCommandMenuButtons();
    injectHeaderButtonIfNeeded();
    bindSidebarLinks();
});
