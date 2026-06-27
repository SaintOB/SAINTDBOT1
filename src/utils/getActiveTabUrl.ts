export const getActiveTabUrl = () => {
    const current_tab_number = localStorage.getItem('active_tab');
    const TAB_NAMES = ['dashboard', 'bot-builder', 'chart', 'tutorial', 'custom-bots', 'analysis-tool'] as const;
    const getTabName = (index: number) => TAB_NAMES[index];
    const current_tab_name = getTabName(Number(current_tab_number));

    const origin = window.location.origin;
    const active_tab_url = `${origin}/${current_tab_name}`;
    return active_tab_url;
};
